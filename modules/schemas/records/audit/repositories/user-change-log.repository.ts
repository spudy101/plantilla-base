import sequelizeModule = require('sequelize');
const { Op } = sequelizeModule;
import type { CreateOptions } from 'sequelize';
import ReadRepository = require('../../../../../shared/repositories/read.repository');
import queryModule = require('../../../../../shared/repositories/query');
const { dateRange } = queryModule;
import type { WhereClause } from '../../../../../shared/repositories/query';
import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { UserChangeLog } = modelsModule;
import requestContext = require('../../../../../shared/utils/request-context.util');
import type defineUserChangeLog = require('../models/user-change-log.model');

class UserChangeLogRepository extends BaseRepository<defineUserChangeLog.Instance> {
  constructor() {
    super(UserChangeLog);
  }

  /**
   * Busca logs con paginación y búsqueda
   * @param {Object} filters - { changeType, changedByRole, user_id }
   * @param {Object} paginationParams - { page, limit, offset, sortBy, order }
   * @param {string} searchTerm - Término de búsqueda (opcional)
   * @returns {Promise<{ rows: Array, count: number }>}
   */
  /**
   * Cambios hechos SOBRE el usuario por un tercero (admin/system) — para el feed de actividad
   * client. Los cambios que el propio usuario hizo ya viven en su rastro de audit_logs; incluirlos
   * acá los duplicaría. Sin previous/new_value: el feed nunca expone valores.
   */
  findExternalChangesByUserId(userId: string, { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
    return this.model.findAndCountAll({
      where: { user_id: userId, changed_by_role: { [Op.in]: ['admin', 'system'] } },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      attributes: ['log_id', 'change_type', 'changed_by_role', 'origin_session_id', 'created_at']
    });
  }

  override findAllPaginated(
    filters: UserChangeLogRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {},
    searchTerm: string | null = null
  ) {
    const extraFilters: WhereClause = {};

    if (filters.changeType) {
      extraFilters.change_type = filters.changeType;
    }

    if (filters.changedByRole) {
      extraFilters.changed_by_role = filters.changedByRole;
    }

    if (filters.changedByUserId) {
      extraFilters.changed_by_user_id = filters.changedByUserId;
    }

    if (filters.user_id) {
      extraFilters.user_id = filters.user_id;
    }

    const createdAtRange = dateRange(filters.dateFrom, filters.dateTo);
    if (createdAtRange) {
      extraFilters.created_at = createdAtRange;
    }

    const options: ReadRepository.PaginatedOptions<defineUserChangeLog.Instance> = {
      _extraFilters: extraFilters,
      _searchFields: ['change_reason', 'previous_value', 'new_value'],
      attributes: [
        'log_id',
        'user_id',
        'changed_by_user_id',
        'changed_by_role',
        'change_type',
        'previous_value',
        'new_value',
        'change_reason',
        'ip_address',
        'user_agent',
        'created_at'
      ],
      include: [
        {
          association: 'user',
          attributes: ['user_id', 'username'],
          include: [
            {
              association: 'person',
              attributes: ['first_name', 'last_name']
            }
          ]
        },
        {
          association: 'changedBy',
          attributes: ['user_id', 'username'],
          include: [
            {
              association: 'person',
              attributes: ['first_name', 'last_name']
            }
          ]
        }
      ]
    };

    return super.findAllPaginated({}, paginationParams, searchTerm, options);
  }

  /**
   * Crea un log de cambio de usuario
   * @param {Object} logData - Datos del log
   * @param {Object} options - Opciones de Sequelize (transaction, etc.)
   * @returns {Promise<UserChangeLog>}
   */
  createLog(logData: UserChangeLogRepository.LogInput, options: CreateOptions<defineUserChangeLog.Attributes> = {}) {
    return this.create(
      {
        user_id: logData.userId,
        changed_by_user_id: logData.changedByUserId || null,
        changed_by_role: logData.changedByRole,
        change_type: logData.changeType,
        previous_value: logData.previousValue || null,
        new_value: logData.newValue || null,
        change_reason: logData.changeReason || null,
        ip_address: logData.ipAddress || null,
        user_agent: logData.userAgent || null,
        // Punto único: createLog tiene ~20 call sites. Alinea esta tabla de auditoría con
        // audit_logs.session_id, que es la consistencia que pedía el plan §3 (Fase 3).
        ...requestContext.originFromContext()
      },
      options
    );
  }

  /**
   * Obtiene logs de un usuario específico
   * @param {string} userId - ID del usuario
   * @param {Object} paginationParams - Parámetros de paginación
   * @returns {Promise<{rows: Array, count: number}>}
   */
  findByUserId(userId: string, paginationParams: ReadRepository.PaginationParams = {}) {
    const criteria = { user_id: userId };

    return this.findAllPaginated(criteria, paginationParams);
  }

  /**
   * Obtiene logs por tipo de cambio
   * @param {string} changeType - Tipo de cambio
   * @param {Object} paginationParams - Parámetros de paginación
   * @returns {Promise<{rows: Array, count: number}>}
   */
  findByChangeType(changeType: defineUserChangeLog.Attributes['change_type'], paginationParams: ReadRepository.PaginationParams = {}) {
    // Las claves son las que lee findAllPaginated (antes se pasaba change_type y el filtro se perdía)
    return this.findAllPaginated({ changeType }, paginationParams);
  }

  /**
   * Obtiene logs realizados por un admin específico
   * @param {string} adminUserId - ID del admin
   * @param {Object} paginationParams - Parámetros de paginación
   * @returns {Promise<{rows: Array, count: number}>}
   */
  findByAdminUser(adminUserId: string, paginationParams: ReadRepository.PaginationParams = {}) {
    // Ídem: antes changed_by_user_id/changed_by_role no llegaban al WHERE
    return this.findAllPaginated({ changedByUserId: adminUserId, changedByRole: 'admin' }, paginationParams);
  }

  /**
   * Cuenta cambios por tipo para un usuario
   * @param {string} userId - ID del usuario
   * @param {string} changeType - Tipo de cambio
   * @returns {Promise<number>}
   */
  countByUserAndType(userId: string, changeType: defineUserChangeLog.Attributes['change_type']) {
    return this.count({
      user_id: userId,
      change_type: changeType
    });
  }

  /**
   * Obtiene el último cambio de un tipo específico para un usuario
   * @param {string} userId - ID del usuario
   * @param {string} changeType - Tipo de cambio
   * @returns {Promise<UserChangeLog|null>}
   */
  findLastChangeByType(userId: string, changeType: defineUserChangeLog.Attributes['change_type']) {
    return this.model.findOne({
      where: {
        user_id: userId,
        change_type: changeType
      },
      order: [['created_at', 'DESC']]
    });
  }

  // Override para usar log_id en vez de id
  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  override delete(logId: string, options = {}) {
    return this.model.destroy({ where: { log_id: logId }, ...options });
  }

  // Override findById para usar log_id
  override findById(logId: string, options = {}) {
    return this.model.findByPk(logId, options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace UserChangeLogRepository {
  export type Filters = {
    changeType?: defineUserChangeLog.Attributes['change_type'];
    changedByRole?: defineUserChangeLog.Attributes['changed_by_role'];
    changedByUserId?: string;
    user_id?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
  };

  /** Entrada de createLog (camelCase, como la arman los services). */
  export interface LogInput {
    userId: string;
    changedByUserId?: string | null;
    changedByRole: defineUserChangeLog.Attributes['changed_by_role'];
    changeType: defineUserChangeLog.Attributes['change_type'];
    previousValue?: string | null;
    newValue?: string | null;
    changeReason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
}

export = new UserChangeLogRepository();
