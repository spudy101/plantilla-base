import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { UserSession } = modelsModule;
import sequelizeModule = require('sequelize');
const { Op } = sequelizeModule;
import type { Includeable } from 'sequelize';
import type defineUserSession = require('../models/user-session.model');
import queryModule = require('../../../../../shared/repositories/query');
const { dateRange, toWhere } = queryModule;
import type { WhereClause } from '../../../../../shared/repositories/query';

// Cabecera de sesión para vistas admin: dispositivo + usuario (sessionUser es el alias que consume
// UserSessionComponent). Declarada por nombre de asociación (SOLID: D).
const DEVICE_AND_USER_INCLUDE: Includeable[] = [
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
];

class UserSessionRepository extends BaseRepository<defineUserSession.Instance> {
  constructor() {
    super(UserSession);
  }

  findByJti(jti: string) {
    return this.model.findOne({ where: { jti } });
  }

  /**
   * Lote de sesiones con su dispositivo de confianza — para resolver qué dispositivo ejecutó cada
   * acción del feed de actividad del cliente. Filtra por `user_id` a propósito: solo se resuelven
   * sesiones DEL PROPIO usuario (una sesión ajena —p. ej. la del admin que hizo un cambio sobre la
   * cuenta— jamás expone su dispositivo al cliente).
   */
  findByIdsWithDeviceForUser(sessionIds: string[], userId: string) {
    return this.model.findAll({
      where: { user_session_id: { [Op.in]: sessionIds }, user_id: userId },
      attributes: ['user_session_id', 'device_id'],
      include: [{ association: 'device', attributes: ['user_trusted_device_id', 'device_name'] }]
    });
  }

  findActiveByUser(userId: string) {
    return this.model.findAll({
      where: { user_id: userId, status: 'active' },
      order: [['started_at', 'DESC']]
    });
  }

  /** Sesión por id solo si sigue activa (null si no existe o ya se cerró). */
  findActiveById(sessionId: string) {
    return this.model.findOne({ where: { user_session_id: sessionId, status: 'active' } });
  }

  /** Renueva last_access_at (ventana deslizante de inactividad). */
  touchLastAccess(sessionId: string) {
    return this.model.update({ last_access_at: new Date() }, { where: { user_session_id: sessionId } });
  }

  updateJtiAndLastAccess(sessionId: string, newJti: string) {
    return this.model.update({ jti: newJti, last_access_at: new Date() }, { where: { user_session_id: sessionId } });
  }

  closeSession(sessionId: string, reason: string) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      { where: { user_session_id: sessionId, status: 'active' } }
    );
  }

  closeByJti(jti: string, reason: string) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      { where: { jti, status: 'active' } }
    );
  }

  closeAllByUser(userId: string, reason: string) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      { where: { user_id: userId, status: 'active' } }
    );
  }

  closeAllByUserExcept(userId: string, exceptSessionId: string | null, reason: string) {
    return this.model.update(
      { status: 'closed', closed_at: new Date(), close_reason: reason },
      {
        // Sin sesión actual (token viejo) no se excluye ninguna — igual que antes ({ [Op.ne]: null } → IS NOT NULL)
        where: { user_id: userId, status: 'active', ...(exceptSessionId ? { user_session_id: { [Op.ne]: exceptSessionId } } : {}) }
      }
    );
  }

  findActiveByUserExcept(userId: string, exceptSessionId: string | null) {
    return this.model.findAll({
      where: { user_id: userId, status: 'active', ...(exceptSessionId ? { user_session_id: { [Op.ne]: exceptSessionId } } : {}) },
      attributes: ['user_session_id', 'jti']
    });
  }

  findActiveByUserAndDevice(userId: string, deviceId: string) {
    return this.model.findAll({
      where: { user_id: userId, device_id: deviceId, status: 'active' },
      attributes: ['user_session_id', 'jti']
    });
  }

  // [RF-AUTH-03] | CA-04 | Conteo de sesiones activas y selección de la más antigua;
  // usado por _enforceSessionLimit para aplicar el límite de 5 sesiones
  findOldestActive(userId: string) {
    return this.model.findOne({
      where: { user_id: userId, status: 'active' },
      order: [['started_at', 'ASC']]
    });
  }

  countActive(userId: string) {
    return this.model.count({ where: { user_id: userId, status: 'active' } });
  }

  // Sesiones activas cuya última actividad superó el umbral de inactividad
  // (last_access_at < cutoff). Usado por session-expiration.worker para cerrarlas.
  findExpirableActive(inactivityCutoff: Date) {
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
  findClosableActive(inactivityCutoff: Date, absoluteCutoff: Date) {
    return this.model.findAll({
      where: {
        status: 'active',
        [Op.or]: [{ last_access_at: { [Op.lt]: inactivityCutoff } }, { started_at: { [Op.lt]: absoluteCutoff } }]
      },
      attributes: ['user_session_id', 'user_id', 'jti', 'last_access_at', 'started_at']
    });
  }

  /** Listado paginado admin con dispositivo y usuario de cada sesión. */
  findPaginatedWithDeviceAndUser(where: WhereClause, pagination: { limit?: number; offset?: number }) {
    return this.findPaginated(where, pagination, DEVICE_AND_USER_INCLUDE);
  }

  /** Detalle de una sesión con dispositivo y usuario. */
  findByIdWithDeviceAndUser(sessionId: string) {
    return this.findById(sessionId, { include: DEVICE_AND_USER_INCLUDE });
  }

  findPaginated(
    where: WhereClause = {},
    { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
    include: Includeable[] = []
  ) {
    return this.model.findAndCountAll({
      where: toWhere(where),
      include,
      order: [['started_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }

  buildWhere({ sessionId, userId, status, ip, dateFrom, dateTo }: UserSessionRepository.Filters = {}) {
    const where: WhereClause = {};
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

    const startedAtRange = dateRange(dateFrom, dateTo);
    if (startedAtRange) {
      where.started_at = startedAtRange;
    }

    return where;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace UserSessionRepository {
  export interface Filters {
    sessionId?: string;
    userId?: string;
    status?: defineUserSession.Attributes['status'];
    ip?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
  }
}

export = new UserSessionRepository();
