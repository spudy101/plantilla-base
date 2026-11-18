// modules/schemas/integration/repositories/integration-api-log.repository.ts
//
// Bitácora de llamadas a proveedores externos (AWS). El usuario y la sesión que originaron cada
// llamada se adjuntan con una consulta por tabla: el schema no declara esas relaciones (son columnas
// de trazabilidad sin FK).
import PrismaRepository from '../../../shared/database/prisma.repository';
import { IntegrationApiLogProduct } from '../../../shared/database/generated/prisma/client';
import type { IntegrationApiLog, IntegrationApiLogResult, Prisma } from '../../../shared/database/generated/prisma/client';

type Product = IntegrationApiLogProduct;

// Derivado del enum de la base (única fuente de verdad de los productos monitoreados).
const PRODUCTS = Object.values(IntegrationApiLogProduct) as readonly Product[];

const PERCENT_SCALE = 10000;
const PCT_DIVISOR = 100;
const FULL_PERCENT = 100;

const USER_SELECT = { userId: true, username: true } satisfies Prisma.UserSelect;
const SESSION_SELECT = { userSessionId: true, ipAddress: true, userAgent: true, startedAt: true, status: true } satisfies Prisma.UserSessionSelect;

export type IntegrationLogUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
export type IntegrationLogSession = Prisma.UserSessionGetPayload<{ select: typeof SESSION_SELECT }>;
/** Llamada con quién la hizo y en qué sesión. */
export type IntegrationLogRow = IntegrationApiLog & { user: IntegrationLogUser | null; session: IntegrationLogSession | null };

class IntegrationApiLogRepository extends PrismaRepository {
  get products() {
    return PRODUCTS;
  }

  async create(data: Prisma.IntegrationApiLogUncheckedCreateInput): Promise<IntegrationApiLog> {
    return (await this.db()).integrationApiLog.create({ data });
  }

  /** Lista paginada (drill-down por llamada) con filtros opcionales, con usuario y sesión. */
  async findAllPaginated(
    { product, result, userId, sessionId, from, to }: IntegrationApiLogRepository.Filters = {},
    { limit, offset }: PrismaRepository.PaginationParams = {}
  ): Promise<PrismaRepository.Page<IntegrationLogRow>> {
    const where: Prisma.IntegrationApiLogWhereInput = {};
    // Llegan del query string: un valor fuera del enum no coincide con nada (como con Sequelize)
    if (product) {
      if (!PRODUCTS.includes(product as Product)) {
        return { rows: [], count: 0 };
      }
      where.product = product as Product;
    }
    if (result) {
      if (!['success', 'failed', 'circuit_open'].includes(result)) {
        return { rows: [], count: 0 };
      }
      where.result = result as IntegrationApiLogResult;
    }
    if (userId) {
      where.userId = userId;
    }
    if (sessionId) {
      where.sessionId = sessionId;
    }
    Object.assign(where, createdAtRange(from, to));

    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.integrationApiLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      db.integrationApiLog.count({ where })
    ]);
    return { rows: await this.attachOrigin(rows), count };
  }

  /** Detalle forense de una llamada (payloads + usuario + sesión). */
  async findById(apiLogId: string): Promise<IntegrationLogRow | null> {
    const row = await (await this.db()).integrationApiLog.findUnique({ where: { apiLogId } });
    return row ? (await this.attachOrigin([row]))[0]! : null;
  }

  /** Último intento registrado para una notificación + producto (ses/sns): lo usa el worker de reintentos. */
  async findLatestByNotification(notificationId: string, product: Product) {
    return (await this.db()).integrationApiLog.findFirst({
      where: { notificationId, product },
      orderBy: { createdAt: 'desc' },
      select: { apiLogId: true, result: true, errorCode: true, createdAt: true }
    });
  }

  /**
   * Estadísticas agregadas por producto para el dashboard: total, éxito, fallo, circuito abierto,
   * % de éxito (solo llamadas reales success+failed, excluye system_error) y tiempo promedio.
   */
  async getStats({ from, to }: Pick<IntegrationApiLogRepository.Filters, 'from' | 'to'> = {}) {
    const groups = await (await this.db()).integrationApiLog.groupBy({
      by: ['product', 'result', 'isSystemError'],
      where: createdAtRange(from, to),
      _count: { _all: true },
      _avg: { responseTimeMs: true }
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
    for (const g of groups) {
      const p = byProduct[g.product];
      if (!p) {
        continue;
      }
      const count = g._count._all;
      p.total += count;
      if (g.isSystemError) {
        p.systemError += count;
      } else if (g.result === 'success') {
        p.success += count;
      } else if (g.result === 'failed') {
        p.failed += count;
      } else if (g.result === 'circuit_open') {
        p.circuitOpen += count;
      }
      if (g._avg.responseTimeMs != null) {
        const acc = (respAcc[g.product] ??= { weighted: 0, count: 0 });
        acc.weighted += g._avg.responseTimeMs * count;
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

    return { summary: _summarize(byProduct), byProduct };
  }

  /** Adjunta usuario y sesión de origen con una consulta por tabla. */
  private async attachOrigin(rows: IntegrationApiLog[]): Promise<IntegrationLogRow[]> {
    const userIds = [...new Set(rows.map(r => r.userId).filter((id): id is string => Boolean(id)))];
    const sessionIds = [...new Set(rows.map(r => r.sessionId).filter((id): id is string => Boolean(id)))];
    const db = await this.db();
    const [users, sessions] = await Promise.all([
      userIds.length ? db.user.findMany({ where: { userId: { in: userIds } }, select: USER_SELECT }) : [],
      sessionIds.length ? db.userSession.findMany({ where: { userSessionId: { in: sessionIds } }, select: SESSION_SELECT }) : []
    ]);
    const userById = new Map(users.map(u => [u.userId, u]));
    const sessionById = new Map(sessions.map(s => [s.userSessionId, s]));
    return rows.map(r => ({
      ...r,
      user: (r.userId && userById.get(r.userId)) || null,
      session: (r.sessionId && sessionById.get(r.sessionId)) || null
    }));
  }
}

function createdAtRange(from?: string | Date | null, to?: string | Date | null): Prisma.IntegrationApiLogWhereInput {
  if (!from && !to) {
    return {};
  }
  return { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } };
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
