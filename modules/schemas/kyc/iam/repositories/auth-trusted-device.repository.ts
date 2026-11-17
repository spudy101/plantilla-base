import { interopDefault } from '../../../../../shared/utils/interop.util';
import BaseRepository from '../../../../../shared/repositories/base.repository';
import AppError from '../../../../../shared/utils/app-error.util';
import modelsModule from '../../../../../shared/models';
const { UserTrustedDevice } = modelsModule;
import HmacService from '../../../../../shared/services/hmac.service';
import requestContext from '../../../../../shared/utils/request-context.util';
import type defineUserTrustedDevice from '../models/user-trusted-device.model';
import type { CreateOptions } from 'sequelize';

class TrustedDeviceRepository extends BaseRepository<defineUserTrustedDevice.Instance> {
  constructor() {
    super(UserTrustedDevice);
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  /**
   * Busca un dispositivo por fingerprint_hash para un usuario.
   * Retorna el dispositivo independientemente de su status.
   */
  findByFingerprint(userId: string, fingerprintHash: string) {
    return this.findOne({
      user_id: userId,
      fingerprint_hash: fingerprintHash
    });
  }

  /**
   * Busca un dispositivo por PK validando que pertenezca al usuario.
   */
  findByIdAndUser(deviceId: string, userId: string) {
    return this.findOne({
      user_trusted_device_id: deviceId,
      user_id: userId
    });
  }

  /**
   * Lista todos los dispositivos de un usuario ordenados por último acceso.
   */
  findAllByUser(userId: string) {
    return this.findAll({ user_id: userId }, { order: [['last_seen_at', 'DESC']] });
  }

  /**
   * Lista dispositivos con su última sesión incluida (activa o cerrada).
   * Se trae la más reciente por last_access_at para que el front pueda mostrar
   * el estado y el último acceso aunque la sesión ya esté cerrada.
   * Usa separate:true para poder aplicar limit:1 sin afectar el query principal.
   */
  findAllByUserWithSessions(userId: string) {
    const { UserSession } = interopDefault(require('../../../../../shared/models') as typeof import('../../../../../shared/models'));
    return this.model.findAll({
      where: { user_id: userId },
      include: [
        {
          model: UserSession,
          as: 'sessions',
          required: false,
          separate: true,
          attributes: [
            'user_session_id',
            'status',
            'ip_address',
            'user_agent',
            'started_at',
            'last_access_at',
            'closed_at',
            'close_reason'
          ],
          order: [['last_access_at', 'DESC']],
          limit: 1
        }
      ],
      order: [['last_seen_at', 'DESC']]
    });
  }

  /**
   * Lista solo los dispositivos PENDING de un usuario.
   * Usado para que el usuario los apruebe/rechace desde un dispositivo trusted.
   */
  findAllPending(userId: string) {
    return this.findAll({ user_id: userId, status: 'pending' }, { order: [['created_at', 'DESC']] });
  }

  /**
   * Cuenta dispositivos de un usuario (todos los estados).
   */
  countByUser(userId: string) {
    return this.count({ user_id: userId });
  }

  /**
   * Cuenta solo dispositivos TRUSTED de un usuario.
   * Usado para determinar si el primer dispositivo debe ir directo a trusted.
   */
  countTrusted(userId: string) {
    return this.count({ user_id: userId, status: 'trusted' });
  }

  // ============================================================
  // ESCRITURA
  // ============================================================

  /**
   * Crea un nuevo dispositivo con toda la info enriquecida.
   * El status se pasa explícitamente: 'pending' o 'trusted'.
   */
  override create(
    // hmac_secret lo genera el repositorio: el llamador no lo conoce
    data: Omit<defineUserTrustedDevice.CreationAttributes, 'hmac_secret'>,
    options: CreateOptions<defineUserTrustedDevice.Attributes> = {}
  ) {
    return super.create(
      {
        user_id: data.user_id,
        fingerprint_hash: data.fingerprint_hash,
        device_name: data.device_name,
        status: data.status || 'pending',
        ip_address: data.ip_address || null,
        city: data.city || null,
        country: data.country || null,
        country_code: data.country_code || null,
        browser: data.browser || null,
        os: data.os || null,
        device_type: data.device_type || 'desktop',
        trusted_at: data.trusted_at || null,
        last_seen_at: data.last_seen_at || new Date(),
        // Secret único por dispositivo — generado aquí, cifrado por el hook del modelo
        hmac_secret: HmacService.generateDeviceSecret(),
        // origin_session_id queda null por diseño: el dispositivo se registra DURANTE el login, antes
        // de que la sesión exista, y es su padre (user_sessions.device_id apunta acá). La relación
        // sesión→dispositivo ya se lee por esa FK; acá solo sirve el correlationId del request de login.
        ...requestContext.originFromContext()
      },
      options
    );
  }

  /**
   * Retorna el hmac_secret del dispositivo identificado por fingerprint.
   * Usado por el auth middleware para verificar la firma HMAC del request.
   */
  async findHmacSecretByFingerprint(userId: string, fingerprintHash: string) {
    const device = await this.findOne({
      user_id: userId,
      fingerprint_hash: fingerprintHash
    });
    return device?.hmac_secret || null;
  }

  /**
   * Aprueba un dispositivo PENDING.
   * Registra qué dispositivo lo aprobó y cuándo.
   *
   * @param {string} deviceId          - ID del dispositivo a aprobar
   * @param {string} approvedByDeviceId - ID del dispositivo TRUSTED que aprueba
   */
  async approve(deviceId: string, approvedByDeviceId: string) {
    const device = await this.findById(deviceId); // FIX: await faltante — device era una Promise, device.update lanzaba TypeError
    if (!device) {
      throw AppError.notFound('Dispositivo no encontrado');
    }

    return device.update({
      status: 'trusted',
      trusted_at: new Date(),
      approved_by_device_id: approvedByDeviceId,
      approved_at: new Date()
    });
  }

  /**
   * Rechaza (elimina) un dispositivo PENDING.
   * Se elimina el registro — no se guarda historial de rechazos.
   */
  reject(deviceId: string) {
    return super.delete(deviceId);
  }

  /**
   * Bloquea un dispositivo — status pasa a 'blocked'.
   * Registra qué dispositivo trusted ejecutó el bloqueo y cuándo.
   *
   * @param {string} deviceId           - ID del dispositivo a bloquear
   * @param {string} blockedByDeviceId  - ID del dispositivo TRUSTED que bloquea
   */
  async block(deviceId: string, blockedByDeviceId: string) {
    const device = await this.findById(deviceId); // FIX: await faltante — device era una Promise, device.update lanzaba TypeError
    if (!device) {
      throw AppError.notFound('Dispositivo no encontrado');
    }

    return device.update({
      status: 'blocked',
      blocked_by_device_id: blockedByDeviceId,
      blocked_at: new Date()
    });
  }

  /**
   * Desbloquea un dispositivo BLOCKED — status vuelve a 'pending'.
   * Limpia los campos de bloqueo para mantener el historial limpio.
   *
   * @param {string} deviceId - ID del dispositivo a desbloquear
   */
  async unblock(deviceId: string) {
    const device = await this.findById(deviceId); // FIX: await faltante — device era una Promise, device.update lanzaba TypeError
    if (!device) {
      throw AppError.notFound('Dispositivo no encontrado');
    }

    return device.update({
      status: 'pending',
      blocked_by_device_id: null,
      blocked_at: null
    });
  }

  /**
   * Actualiza last_seen_at — llamar en cada login exitoso desde dispositivo conocido.
   */
  updateLastSeen(userId: string, fingerprintHash: string) {
    return this.bulkUpdate({ last_seen_at: new Date() }, { user_id: userId, fingerprint_hash: fingerprintHash });
  }

  /**
   * Renombra un dispositivo.
   */
  async rename(deviceId: string, deviceName: string) {
    const device = await this.findById(deviceId); // FIX: await faltante — device era una Promise, device.update lanzaba TypeError
    if (!device) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    return device.update({ device_name: deviceName });
  }

  /**
   * Elimina el dispositivo más antiguo (por last_seen_at) de un usuario.
   */
  async deleteOldest(userId: string) {
    const oldest = await this.findOne(
      // FIX: await faltante — oldest era una Promise, oldest.destroy() nunca se ejecutaba
      { user_id: userId },
      { order: [['last_seen_at', 'ASC']] }
    );
    if (oldest) {
      await oldest.destroy();
    }
  }

  /**
   * Elimina todos los dispositivos de un usuario.
   * Usado en logoutAll.
   */
  deleteAllByUser(userId: string) {
    return this.bulkDelete({ user_id: userId });
  }
}

export default new TrustedDeviceRepository();
