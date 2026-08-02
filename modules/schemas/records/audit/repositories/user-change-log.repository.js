const { Op } = require('sequelize');
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { UserChangeLog } = require('../../../../../shared/models');
const requestContext = require('../../../../../shared/utils/request-context.util');

class UserChangeLogRepository extends BaseRepository {
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
  findExternalChangesByUserId(userId, { limit = 50, offset = 0 } = {}) {
    return this.model.findAndCountAll({
      where: { user_id: userId, changed_by_role: { [Op.in]: ['admin', 'system'] } },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      attributes: ['log_id', 'change_type', 'changed_by_role', 'origin_session_id', 'created_at']
    });
  }

  findAllPaginated(filters = {}, paginationParams = {}, searchTerm = null) {
    const extraFilters = {};

    if (filters.changeType) {
      extraFilters.change_type = filters.changeType;
    }

    if (filters.changedByRole) {
      extraFilters.changed_by_role = filters.changedByRole;
    }

    if (filters.user_id) {
      extraFilters.user_id = filters.user_id;
    }

    if (filters.dateFrom || filters.dateTo) {
      extraFilters.created_at = {};
      if (filters.dateFrom) {
        extraFilters.created_at[Op.gte] = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        extraFilters.created_at[Op.lte] = new Date(filters.dateTo);
      }
    }

    const options = {
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
  createLog(logData, options = {}) {
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
  findByUserId(userId, paginationParams = {}) {
    const criteria = { user_id: userId };

    return this.findAllPaginated(criteria, paginationParams);
  }

  /**
   * Obtiene logs por tipo de cambio
   * @param {string} changeType - Tipo de cambio
   * @param {Object} paginationParams - Parámetros de paginación
   * @returns {Promise<{rows: Array, count: number}>}
   */
  findByChangeType(changeType, paginationParams = {}) {
    const criteria = { change_type: changeType };

    return this.findAllPaginated(criteria, paginationParams);
  }

  /**
   * Obtiene logs realizados por un admin específico
   * @param {string} adminUserId - ID del admin
   * @param {Object} paginationParams - Parámetros de paginación
   * @returns {Promise<{rows: Array, count: number}>}
   */
  findByAdminUser(adminUserId, paginationParams = {}) {
    const criteria = {
      changed_by_user_id: adminUserId,
      changed_by_role: 'admin'
    };

    return this.findAllPaginated(criteria, paginationParams);
  }

  /**
   * Cuenta cambios por tipo para un usuario
   * @param {string} userId - ID del usuario
   * @param {string} changeType - Tipo de cambio
   * @returns {Promise<number>}
   */
  countByUserAndType(userId, changeType) {
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
  findLastChangeByType(userId, changeType) {
    return this.model.findOne({
      where: {
        user_id: userId,
        change_type: changeType
      },
      order: [['created_at', 'DESC']]
    });
  }

  // Override para usar log_id en vez de id
  delete(logId) {
    return this.model.destroy({ where: { log_id: logId } });
  }

  // Override findById para usar log_id
  findById(logId, options = {}) {
    return this.model.findByPk(logId, options);
  }
}

module.exports = new UserChangeLogRepository();
