import { interopDefault } from '../../../../../shared/utils/interop.util';
import AppendOnlyRepository from '../../../../../shared/repositories/append-only.repository';
import modelsModule from '../../../../../shared/models';
const { AuditLog } = modelsModule;
import { Op, fn, col } from 'sequelize';
import type { Includeable } from 'sequelize';
import type defineAuditLog from '../models/audit-log.model';
import errorMessageModule from '../../../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;
import * as queryModule from '../../../../../shared/repositories/query';
const { range, toWhere } = queryModule;
import type { WhereClause } from '../../../../../shared/repositories/query';

// Quién ejecutó la acción (usuario + nombre). Inclusión por defecto de los listados/detalle admin,
// declarada por nombre de asociación para que los services no importen modelos (SOLID: D).
const EXECUTOR_INCLUDE: Includeable[] = [
  {
    association: 'executor',
    required: false,
    attributes: ['user_id', 'username'],
    include: [{ association: 'person', attributes: ['first_name', 'last_name'] }]
  }
];

class AuditLogRepository extends AppendOnlyRepository<defineAuditLog.Instance> {
  constructor() {
    super(AuditLog);
  }

  // `audit_logs` es append-only. La garantía dura es el trigger de BD (BEFORE UPDATE OR DELETE).
  // Antes este repo heredaba de BaseRepository y sobrescribía `update`/`delete` para lanzar error
  // (violación de Liskov). Ahora hereda de AppendOnlyRepository: esos métodos simplemente no existen.

  /**
   * Registra una entrada de auditoría.
   * Nunca lanza error — falla silenciosamente para no interrumpir el flujo principal.
   * @param {Object} entry
   * @returns {Promise<AuditLog|null>}
   */
  async register(entry: defineAuditLog.CreationAttributes) {
    try {
      // await: sin él, el catch no veía el rechazo de la Promise y el error escapaba al llamador
      return await this.model.create(entry);
    } catch (err) {
      // Importar logger aquí para evitar dependencia circular
      const { logger } = interopDefault(require('../../../../../shared/utils/logger.util') as typeof import('../../../../../shared/utils/logger.util'));
      logger.error('AuditLogRepository.register — error guardando en BD', {
        error: errorMessage(err),
        action: entry.action,
        userId: entry.user_id
      });
      return null;
    }
  }

  // ============================================================
  // CONSULTAS PARA PANEL / REPORTES SFC
  // ============================================================

  /**
   * Busca todos los logs de un usuario en un rango de fechas.
   * Consulta principal que pide la SFC: "todo lo que hizo el usuario X".
   * @param {string} userId
   * @param {Date} from
   * @param {Date} to
   * @param {Object} pagination
   * @returns {Promise<{rows: AuditLog[], count: number}>}
   */
  findByUser(userId: string, from: Date, to: Date, { limit = 50, offset = 0 }: AuditLogRepository.Page = {}) {
    return this.model.findAndCountAll({
      where: {
        user_id: userId,
        createdAt: { [Op.between]: [from, to] }
      },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }

  /**
   * Feed de actividad del PROPIO usuario (endpoint client): solo acciones de una whitelist
   * client-safe. El DTO nunca expone `details` (claves before/after) ni campos técnicos.
   * @param {string} userId
   * @param {string[]} actions - whitelist de acciones permitidas en el feed
   * @param {Object} pagination
   */
  findClientSafeByUser(userId: string, actions: string[], { limit = 50, offset = 0 }: AuditLogRepository.Page = {}) {
    return this.model.findAndCountAll({
      where: { user_id: userId, action: { [Op.in]: actions } },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      attributes: ['audit_log_id', 'action', 'description', 'category', 'outcome', 'ip', 'session_id', 'createdAt']
    });
  }

  /**
   * Busca logs por acción específica en un rango de fechas.
   * Útil para: "todos los LOGIN_FAILED del último mes".
   * @param {string} action
   * @param {Date} from
   * @param {Date} to
   * @param {Object} pagination
   */
  findByAction(action: string, from: Date, to: Date, { limit = 50, offset = 0 }: AuditLogRepository.Page = {}) {
    return this.model.findAndCountAll({
      where: {
        action,
        createdAt: { [Op.between]: [from, to] }
      },
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset,
      distinct: true
    });
  }

  /**
   * Busca logs por categoría y nivel de riesgo.
   * Útil para reportes por módulo: "todos los eventos críticos de KYC".
   * @param {string} category
   * @param {string[]} riskLevels — ej: ['high', 'critical']
   * @param {Date} from
   * @param {Date} to
   * @param {Object} pagination
   */
  findByCategoryAndRisk(
    category: string,
    riskLevels: Array<defineAuditLog.Attributes['risk']>,
    from: Date, to: Date,
    { limit = 50, offset = 0 }: AuditLogRepository.Page = {}
  ) {
    return this.model.findAndCountAll({
      where: {
        category,
        risk: { [Op.in]: riskLevels },
        createdAt: { [Op.between]: [from, to] }
      },
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset,
      distinct: true
    });
  }

  /**
   * Busca logs por IP — útil para detectar accesos sospechosos.
   * @param {string} ip
   * @param {Date} from
   * @param {Date} to
   */
  findByIp(ip: string, from: Date, to: Date, { limit = 50, offset = 0 }: AuditLogRepository.Page = {}) {
    return this.model.findAndCountAll({
      where: {
        ip,
        createdAt: { [Op.between]: [from, to] }
      },
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset,
      distinct: true
    });
  }

  /**
   * Busca logs por correlationId — reconstruye el flujo completo de una request.
   * @param {string} correlationId
   */
  findByCorrelationId(correlationId: string) {
    return this.model.findAll({
      where: { correlation_id: correlationId },
      order: [['created_at', 'ASC']]
    });
  }

  /**
   * Busca logs por resultado (outcome) en un rango de fechas.
   * Consulta clave para la SFC: "todos los errores/fallas del último mes".
   * @param {string} outcome — 'success' | 'failure' | 'warning' | 'attempt'
   * @param {Date} from
   * @param {Date} to
   * @param {Object} pagination
   */
  findByOutcome(outcome: defineAuditLog.Attributes['outcome'], from: Date, to: Date, { limit = 50, offset = 0 }: AuditLogRepository.Page = {}) {
    return this.model.findAndCountAll({
      where: {
        outcome,
        createdAt: { [Op.between]: [from, to] }
      },
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset,
      distinct: true
    });
  }

  /**
   * Busca fallas de un usuario específico en un rango de fechas.
   * Útil para detectar patrones de error por usuario.
   * @param {string} userId
   * @param {Date} from
   * @param {Date} to
   * @param {Object} pagination
   */
  findFailuresByUser(userId: string, from: Date, to: Date, { limit = 50, offset = 0 }: AuditLogRepository.Page = {}) {
    return this.model.findAndCountAll({
      where: {
        user_id: userId,
        outcome: { [Op.in]: ['failure'] },
        createdAt: { [Op.between]: [from, to] }
      },
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset,
      distinct: true
    });
  }

  /**
   * Paginación genérica; por defecto incluye al executor (User + Person).
   * @param {object} where
   * @param {{limit: number, offset: number}} pagination
   * @param {object[]} include
   */
  findPaginatedWithExecutor(
    where: WhereClause,
    { limit, offset, sortBy = 'created_at', order = 'DESC' }: AuditLogRepository.Pagination,
    include: Includeable[] = EXECUTOR_INCLUDE
  ) {
    return this.model.findAndCountAll({
      where: toWhere(where),
      include,
      order: [[sortBy, order]],
      limit,
      offset,
      distinct: true
    });
  }

  /**
   * Detalle de un log; por defecto incluye al executor.
   * @param {string} auditLogId
   * @param {object[]} include
   */
  findByIdFull(auditLogId: string, include: Includeable[] = EXECUTOR_INCLUDE) {
    return this.model.findOne({
      where: { [this.model.primaryKeyAttribute]: auditLogId },
      include
    });
  }

  /**
   * Búsqueda plana sin include para exportación CSV/XLSX.
   * @param {object} where
   * @param {number} limit
   */
  findAllForExport(where: WhereClause, limit: number) {
    return this.model.findAll({
      where: toWhere(where),
      order: [['created_at', 'DESC']],
      limit
    });
  }

  // ============================================================
  // BÚSQUEDAS CON FILTROS DE NEGOCIO (SOLID: D / I)
  // ============================================================
  // Los services pasan filtros planos (dateFrom, action, userId…) y el repositorio
  // los traduce a un WHERE de Sequelize. Así ningún service importa `Op`.

  /**
   * Traduce los filtros del listado/exportación de auditoría a un WHERE.
   * @param {object} filters - { dateFrom, dateTo, action, userId, sessionId, category, module,
   *                             outcome, risk, ip, correlationId, entityId, entityType, source }
   * @returns {object} where de Sequelize
   */
  buildSearchWhere(filters: AuditLogRepository.SearchFilters = {}) {
    const where: WhereClause = {};
    const { dateFrom, dateTo } = filters;
    const createdAtRange = range(dateFrom, dateTo);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }
    const columns: Record<Exclude<keyof AuditLogRepository.SearchFilters, 'dateFrom' | 'dateTo'>, string> = {
      action: 'action',
      userId: 'user_id',
      sessionId: 'session_id',
      category: 'category',
      module: 'module',
      outcome: 'outcome',
      risk: 'risk',
      ip: 'ip',
      correlationId: 'correlation_id',
      entityId: 'entity_id',
      entityType: 'entity_type',
      source: 'source'
    };
    for (const [key, column] of Object.entries(columns) as Array<[keyof typeof columns, string]>) {
      if (filters[key]) {
        where[column] = filters[key];
      }
    }
    return where;
  }

  /** Listado paginado de auditoría a partir de filtros de negocio. */
  searchPaginated(
    filters: AuditLogRepository.SearchFilters,
    pagination: AuditLogRepository.Pagination,
    include: Includeable[] = EXECUTOR_INCLUDE
  ) {
    return this.findPaginatedWithExecutor(this.buildSearchWhere(filters), pagination, include);
  }

  /** Exportación (sin include) a partir de filtros de negocio. */
  searchForExport(filters: AuditLogRepository.SearchFilters, limit: number) {
    return this.findAllForExport(this.buildSearchWhere(filters), limit);
  }

  /**
   * WHERE de intentos de autenticación.
   * @param {object} criteria
   * @param {Date} criteria.from
   * @param {Date} criteria.to
   * @param {string[]} [criteria.actions] - si viene, filtra por esas acciones
   * @param {string} [criteria.category]  - si no hay actions, filtra por categoría
   * @param {string} [criteria.userId]
   * @param {string} [criteria.outcome]
   */
  buildAuthAttemptsWhere({ from, to, actions, category, userId, outcome }: AuditLogRepository.AuthAttemptsCriteria) {
    const where: WhereClause = { created_at: { [Op.between]: [from, to] } };
    if (actions && actions.length) {
      where.action = { [Op.in]: actions };
    } else if (category) {
      where.category = category;
    }
    if (userId) {
      where.user_id = userId;
    }
    if (outcome) {
      where.outcome = outcome;
    }
    return where;
  }

  /** Intentos de autenticación paginados. */
  findAuthAttemptsPaginated(
    criteria: AuditLogRepository.AuthAttemptsCriteria,
    pagination: AuditLogRepository.Pagination,
    include: Includeable[] = EXECUTOR_INCLUDE
  ) {
    return this.findPaginatedWithExecutor(this.buildAuthAttemptsWhere(criteria), pagination, include);
  }

  // ============================================================
  // TRAZA POR SESIÓN (Fase 5 — API admin de sesiones)
  // ============================================================

  /**
   * Conteo de eventos de auditoría agrupado por sesión, para un conjunto de sesiones.
   * Usado por el listado de sesiones para mostrar el "conteo de acciones" sin un query por fila.
   * @param {string[]} sessionIds
   * @returns {Promise<Array<{session_id: string, count: string}>>}
   */
  countBySessionIds(sessionIds: string[]) {
    if (!sessionIds || sessionIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.aggregate<{ session_id: string; count: string }>({
      attributes: ['session_id', [fn('COUNT', col('audit_log_id')), 'count']],
      where: { session_id: { [Op.in]: sessionIds } },
      group: ['session_id']
    });
  }

  /**
   * Referencias de dominio (entity_table + entity_id) tocadas dentro de una sesión.
   * Fuente de la hidratación por lote: el timeline sale de audit_logs y cada evento ya trae la
   * llave de la fila de dominio a la que apunta. Se descartan los eventos sin entidad puntual.
   * @param {string} sessionId
   * @returns {Promise<Array<{entity_table: string, entity_id: string, entity_type: string}>>}
   */
  findEntityRefsBySession(sessionId: string) {
    return this.aggregate<{ entity_table: string; entity_id: string; entity_type: string | null }>({
      where: {
        session_id: sessionId,
        entity_table: { [Op.ne]: null },
        entity_id: { [Op.ne]: null }
      },
      attributes: ['entity_table', 'entity_id', 'entity_type']
    });
  }

  /**
   * Resumen de eventos críticos por día — para dashboard de cumplimiento.
   * @param {Date} from
   * @param {Date} to
   */
  countCriticalByDay(from: Date, to: Date) {
    return this.aggregate<{ date: string; count: string; category: string | null }>({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('audit_log_id')), 'count'],
        'category'
      ],
      where: {
        risk: { [Op.in]: ['high', 'critical'] },
        createdAt: { [Op.between]: [from, to] }
      },
      group: [fn('DATE', col('created_at')), 'category'],
      order: [[fn('DATE', col('created_at')), 'ASC']]
    });
  }

  // ============================================================
  // RETENCIÓN (worker de archivado, RF-ADM-03)
  // ============================================================

  /** Cuántos registros se crearon hasta `cutoff` inclusive (aviso de próximos a vencer). */
  countCreatedUpTo(cutoff: Date): Promise<number> {
    return this.model.count({ where: { createdAt: { [Op.lte]: cutoff } } });
  }

  /** Cuántos registros se crearon antes de `cutoff` (candidatos a purga). */
  countCreatedBefore(cutoff: Date): Promise<number> {
    return this.model.count({ where: { createdAt: { [Op.lt]: cutoff } } });
  }

  /**
   * Purga de retención: borra de la BD los registros creados antes de `cutoff` (la copia vive en S3).
   * Es la ÚNICA baja permitida en esta tabla append-only: el trigger de inmutabilidad la autoriza solo
   * con `app.allow_audit_purge` puesto en la misma transacción (SET LOCAL).
   */
  async purgeCreatedBefore(cutoff: Date): Promise<number> {
    return this.sequelize.transaction(async transaction => {
      await this.sequelize.query("SET LOCAL app.allow_audit_purge = 'true'", { transaction });
      return this.model.destroy({ where: { createdAt: { [Op.lt]: cutoff } }, force: true, transaction });
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AuditLogRepository {
  export interface Page {
    limit?: number;
    offset?: number;
  }

  export interface Pagination extends Page {
    sortBy?: string;
    order?: 'ASC' | 'DESC';
  }

  /** Filtros de negocio del listado/exportación de auditoría (los traduce buildSearchWhere). */
  export interface SearchFilters {
    dateFrom?: string | Date;
    dateTo?: string | Date;
    action?: string;
    userId?: string;
    sessionId?: string;
    category?: string;
    module?: string;
    outcome?: string;
    risk?: string;
    ip?: string;
    correlationId?: string;
    entityId?: string;
    entityType?: string;
    source?: string;
  }

  export interface AuthAttemptsCriteria {
    from: Date;
    to: Date;
    actions?: string[];
    category?: string;
    userId?: string;
    outcome?: string;
  }
}

export default new AuditLogRepository();
