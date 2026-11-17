import { fn, col } from 'sequelize';
import BaseRepository from '../../../../shared/repositories/base.repository';
import modelsModule from '../../../../shared/models';
const { IntegrationApiLog } = modelsModule;
import type { FindOptions } from 'sequelize';
import ReadRepository from '../../../../shared/repositories/read.repository';
import type defineIntegrationApiLog from '../models/integration-api-log.model';
import * as queryModule from '../../../../shared/repositories/query';
const { dateRange, toWhere } = queryModule;
import type { WhereClause } from '../../../../shared/repositories/query';

type Product = defineIntegrationApiLog.Attributes['product'];

// Derivado del ENUM del modelo (única fuente de verdad de los productos monitoreados).
const PRODUCTS = (IntegrationApiLog.rawAttributes.product?.values ?? []) as readonly Product[];

const PERCENT_SCALE = 10000;
const PCT_DIVISOR = 100;
const FULL_PERCENT = 100;

class IntegrationApiLogRepository extends BaseRepository<defineIntegrationApiLog.Instance> {
  constructor() {
    super(IntegrationApiLog, {});
  }

  get products() {
    return PRODUCTS;
  }

  /**
   * Lista paginada (drill-down por llamada) con filtros opcionales. Incluye el usuario y la
   * sesión que originaron cada llamada, para responder "quién llamó y en qué sesión".
   */
  override findAllPaginated(
    { product, result, userId, sessionId, from, to }: IntegrationApiLogRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {}
  ) {
    const where: WhereClause = {};

    if (product) {
      where.product = product;
    }
    if (result) {
      where.result = result;
    }
    if (userId) {
      where.user_id = userId;
    }
    if (sessionId) {
      where.session_id = sessionId;
    }
    const createdAtRange = dateRange(from, to);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }

    return IntegrationApiLog.findAndCountAll({
      where: toWhere(where),
      include: [
        { association: 'user', attributes: ['user_id', 'username'], required: false },
        {
          association: 'session',
          attributes: ['user_session_id', 'ip_address', 'user_agent', 'started_at', 'status'],
          required: false
        }
      ],
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['created_at', 'DESC']],
      distinct: true
    });
  }

  /**
   * Detalle forense de una llamada: incluye request/response payload + usuario + sesión.
   */
  override findById(id: string, options: FindOptions<defineIntegrationApiLog.Attributes> = {}) {
    return IntegrationApiLog.findByPk(id, {
      ...options,
      include: [
        { association: 'user', attributes: ['user_id', 'username'], required: false },
        {
          association: 'session',
          attributes: ['user_session_id', 'ip_address', 'user_agent', 'started_at', 'status'],
          required: false
        }
      ]
    });
  }

  /**
   * Último intento registrado para una notificación + producto (ses/sns). Lo usa el worker de
   * reintentos para leer el error_code del último envío.
   */
  findLatestByNotification(notificationId: string, product: Product) {
    return IntegrationApiLog.findOne({
      where: { notification_id: notificationId, product },
      order: [['created_at', 'DESC']],
      attributes: ['api_log_id', 'result', 'error_code', 'created_at']
    });
  }

  /**
   * Estadísticas agregadas por producto para el dashboard: total, éxito, fallo, circuito abierto,
   * % de éxito (solo llamadas reales success+failed, excluye system_error) y tiempo promedio.
   */
  async getStats({ from, to }: Pick<IntegrationApiLogRepository.Filters, 'from' | 'to'> = {}) {
    const where: WhereClause = {};
    const createdAtRange = dateRange(from, to);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }

    const rows = await this.aggregate<{
      product: Product;
      result: defineIntegrationApiLog.Attributes['result'];
      is_system_error: boolean;
      count: string;
      avg_response_ms: string | null;
    }>({
      where: toWhere(where),
      attributes: [
        'product',
        'result',
        'is_system_error',
        [fn('COUNT', col('api_log_id')), 'count'],
        [fn('AVG', col('response_time_ms')), 'avg_response_ms']
      ],
      group: ['product', 'result', 'is_system_error']
    });

    const byProduct = {} as Record<Product, IntegrationApiLogRepository.ProductStats>;
    for (const product of PRODUCTS) {
      byProduct[product] = {
        product,
        total: 0,
        success: 0,
        failed: 0,
        circuitOpen: 0,
        systemError: 0,
        successRate: FULL_PERCENT,
        avgResponseMs: null
      };
    }

    const respAcc: Partial<Record<Product, { weighted: number; count: number }>> = {};
    for (const row of rows) {
      const p = byProduct[row.product];
      if (!p) {
        continue;
      }
      const count = Number.parseInt(row.count, 10);
      p.total += count;
      if (row.is_system_error) {
        p.systemError += count;
      } else if (row.result === 'success') {
        p.success += count;
      } else if (row.result === 'failed') {
        p.failed += count;
      } else if (row.result === 'circuit_open') {
        p.circuitOpen += count;
      }
      if (row.avg_response_ms) {
        const acc = (respAcc[row.product] ??= { weighted: 0, count: 0 });
        acc.weighted += Number.parseFloat(row.avg_response_ms) * count;
        acc.count += count;
      }
    }

    for (const product of PRODUCTS) {
      const p = byProduct[product];
      const real = p.success + p.failed;
      p.successRate = real > 0 ? Math.round((p.success / real) * PERCENT_SCALE) / PCT_DIVISOR : FULL_PERCENT;
      const acc = respAcc[product];
      p.avgResponseMs = acc && acc.count > 0 ? Math.round(acc.weighted / acc.count) : null;
    }

    const summary = _summarize(byProduct);
    return { summary, byProduct };
  }
}

function _summarize(byProduct: Record<string, IntegrationApiLogRepository.ProductStats>) {
  const values = Object.values(byProduct);
  const success = values.reduce((s, p) => s + p.success, 0);
  const failed = values.reduce((s, p) => s + p.failed, 0);
  const circuitOpen = values.reduce((s, p) => s + p.circuitOpen, 0);
  const real = success + failed;
  return {
    totalCalls: values.reduce((s, p) => s + p.total, 0),
    success,
    failed,
    circuitOpen,
    successRate: real > 0 ? Math.round((success / real) * PERCENT_SCALE) / PCT_DIVISOR : FULL_PERCENT
  };
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace IntegrationApiLogRepository {
  // Llegan del query string: se comparan contra la columna tal cual (un valor desconocido no matchea)
  export type Filters = {
    product?: string | null;
    result?: string | null;
    userId?: string | null;
    sessionId?: string | null;
    from?: string | Date | null;
    to?: string | Date | null;
  };

  export interface ProductStats {
    product: Product;
    total: number;
    success: number;
    failed: number;
    circuitOpen: number;
    systemError: number;
    successRate: number;
    avgResponseMs: number | null;
  }
}

export default new IntegrationApiLogRepository();
