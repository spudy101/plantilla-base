const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { UserSession } = require('../../../../../shared/models');
const { Op } = require('sequelize');

// Cabecera de sesión para vistas admin: dispositivo + usuario (sessionUser es el alias que consume
// UserSessionComponent). Declarada por nombre de asociación (SOLID: D).
const DEVICE_AND_USER_INCLUDE = Object.freeze([
  {
    association: 'device',
    required: false,
    attributes: ['user_trusted_device_id', 'device_name', 'device_type', 'browser', 'os', 'status']
  },
  {
    association: 'sessionUser',
    required: false,
    attributes: ['user_id', 'username'],
    include: [{ association: 'person', attributes: ['first_name', 'last_name'] }]
  }
]);

class UserSessionRepository extends BaseRepository {
  constructor() {
    super(UserSession);
  }

  findByJti(jti) {
    return this.model.findOne({ where: { jti } });
  }

  /**
   * Lote de sesiones con su dispositivo de confianza — para resolver qué dispositivo ejecutó cada
   * acción del feed de actividad del cliente. Filtra por `user_id` a propósito: solo se resuelven
   * sesiones DEL PROPIO usuario (una sesión ajena —p. ej. la del admin que hizo un cambio sobre la
   * cuenta— jamás expone su dispositivo al cliente).
   */
  findByIdsWithDeviceForUser(sessionIds, userId) {
    return this.model.findAll({
      where: { user_session_id: { [Op.in]: sessionIds }, user_id: userId },
      attributes: ['user_session_id', 'device_id'],
      include: [{ association: 'device', attributes: ['user_trusted_device_id', 'device_name'] }]
    });
  }

  findActiveByUser(userId) {
    return this.model.findAll({
      where: { user_id: userId, status: 'active' },
      order: [['started_at', 'DESC']]
    });
  }

  /** Sesión por id solo si sigue activa (null si no existe o ya se cerró). */
  findActiveById(sessionId) {
    return this.model.findOne({ where: { user_session_id: sessionId, status: 'active' } });
  }

  /** Renueva last_access_at (ventana deslizante de inactividad). */
  touchLastAccess(sessionId) {
    return this.model.update({ last_access_at: new Date() }, { where: { user_session_id: sessionId } });
  }

  updateJtiAndLastAccess(sessionId, newJti) {
    return this.model.update({ jti: newJti, last_access_at: new Date() }, { where: { user_session_id: sessionId } });
  }

  closeSession(sessionId, reason) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      { where: { user_session_id: sessionId, status: 'active' } }
    );
  }

  closeByJti(jti, reason) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      { where: { jti, status: 'active' } }
    );
  }

  closeAllByUser(userId, reason) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      { where: { user_id: userId, status: 'active' } }
    );
  }

  closeAllByUserExcept(userId, exceptSessionId, reason) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      {
        where: { user_id: userId, status: 'active', user_session_id: { [Op.ne]: exceptSessionId } }
      }
    );
  }

  findActiveByUserExcept(userId, exceptSessionId) {
    return this.model.findAll({
      where: { user_id: userId, status: 'active', user_session_id: { [Op.ne]: exceptSessionId } },
      attributes: ['user_session_id', 'jti']
    });
  }

  findActiveByUserAndDevice(userId, deviceId) {
    return this.model.findAll({
      where: { user_id: userId, device_id: deviceId, status: 'active' },
      attributes: ['user_session_id', 'jti']
    });
  }

  // [RF-AUTH-03] | CA-04 | Conteo de sesiones activas y selección de la más antigua;
  // usado por _enforceSessionLimit para aplicar el límite de 5 sesiones
  findOldestActive(userId) {
    return this.model.findOne({
      where: { user_id: userId, status: 'active' },
      order: [['started_at', 'ASC']]
    });
  }

  countActive(userId) {
    return this.model.count({ where: { user_id: userId, status: 'active' } });
  }

  // Sesiones activas cuya última actividad superó el umbral de inactividad
  // (last_access_at < cutoff). Usado por session-expiration.worker para cerrarlas.
  findExpirableActive(inactivityCutoff) {
    return this.model.findAll({
      where: {
        status: 'active',
        last_access_at: { [Op.lt]: inactivityCutoff }
      },
      attributes: ['user_session_id', 'user_id', 'jti', 'last_access_at']
    });
  }

  // [RF-AUTH-02] | CA-01/CA-04 | Sesiones activas que el worker debe cerrar: por inactividad
  // (last_access_at < inactivityCutoff) O por tope absoluto de vida (started_at < absoluteCutoff).
  findClosableActive(inactivityCutoff, absoluteCutoff) {
    return this.model.findAll({
      where: {
        status: 'active',
        [Op.or]: [{ last_access_at: { [Op.lt]: inactivityCutoff } }, { started_at: { [Op.lt]: absoluteCutoff } }]
      },
      attributes: ['user_session_id', 'user_id', 'jti', 'last_access_at', 'started_at']
    });
  }

  /** Listado paginado admin con dispositivo y usuario de cada sesión. */
  findPaginatedWithDeviceAndUser(where, pagination) {
    return this.findPaginated(where, pagination, DEVICE_AND_USER_INCLUDE);
  }

  /** Detalle de una sesión con dispositivo y usuario. */
  findByIdWithDeviceAndUser(sessionId) {
    return this.findById(sessionId, { include: DEVICE_AND_USER_INCLUDE });
  }

  findPaginated(where = {}, { limit = 20, offset = 0 } = {}, include = []) {
    return this.model.findAndCountAll({
      where,
      include,
      order: [['started_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }

  buildWhere({ sessionId, userId, status, ip, dateFrom, dateTo } = {}) {
    const where = {};
    if (sessionId) {
      where.user_session_id = sessionId;
    }
    if (userId) {
      where.user_id = userId;
    }
    if (status) {
      where.status = status;
    }
    if (ip) {
      where.ip_address = ip;
    }

    if (dateFrom || dateTo) {
      where.started_at = {};
      if (dateFrom) {
        where.started_at[Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        where.started_at[Op.lte] = new Date(dateTo);
      }
    }

    return where;
  }
}

module.exports = new UserSessionRepository();
