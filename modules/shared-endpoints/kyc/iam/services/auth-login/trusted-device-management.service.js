// modules/shared-endpoints/kyc/iam/services/auth-login/trusted-device-management.service.js
//
// Gestión de dispositivos de confianza por el propio usuario (RF-AUTH-03):
// listar, renombrar, bloquear, desbloquear y aprobar. Extraído de AuthLoginService (SOLID: S).

const trustedDeviceRepository = require('../../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository');
const DeviceBlocklistUtil = require('../../../../../../shared/utils/device-blocklist.util');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { TrustedDeviceListDTO, TrustedDeviceUpdateDTO } = require('../../dtos/auth-login.dto');

class TrustedDeviceManagementService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   AuthLoginService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.trustedDeviceRepository = deps.trustedDeviceRepository ?? trustedDeviceRepository;
  }

  // ============================================================
  // TRUSTED DEVICES
  // ============================================================

  // === RF-AUTH-03: Gestión de Dispositivos Autenticados y Control de Sesiones ===
  // [RF-AUTH-03] | CA-01 | Devuelve lista de dispositivos del usuario con browser,
  // os, device_type, ip_address, city, country, last_seen_at y flag de sesión actual
  async getTrustedDevices(userId, currentFingerprintHash, currentSessionId = null) {
    const devices = await this.trustedDeviceRepository.findAllByUserWithSessions(userId);

    logAudit(
      'TRUSTED_DEVICES_VIEWED',
      userId,
      { deviceCount: devices.length },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return TrustedDeviceListDTO(devices, currentFingerprintHash, currentSessionId);
  }

  async getPendingDevices(userId) {
    const devices = await this.trustedDeviceRepository.findAllPending(userId);

    logAudit(
      'PENDING_DEVICES_VIEWED',
      userId,
      { deviceCount: devices.length },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return TrustedDeviceListDTO(devices, null);
  }

  async renameDevice(userId, deviceId, deviceName) {
    const device = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!device) {
      throw AppError.notFound('Dispositivo no encontrado');
    }

    const updated = await this.trustedDeviceRepository.rename(deviceId, deviceName);

    logAudit(
      'TRUSTED_DEVICE_RENAMED',
      userId,
      { newName: deviceName },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(updated);
  }

  /**
   * Bloquea un dispositivo (trusted o pending).
   * Solo puede ejecutarse desde un dispositivo TRUSTED.
   * Siempre debe quedar al menos un dispositivo trusted.
   */
  async blockDevice(userId, deviceId, currentFingerprintHash) {
    // Verificar que quien bloquea es TRUSTED
    const currentDevice = await this.trustedDeviceRepository.findByFingerprint(userId, currentFingerprintHash);

    if (!currentDevice || currentDevice.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes bloquear dispositivos desde un dispositivo de confianza');
    }

    // No puedes bloquearte a ti mismo
    if (currentDevice.user_trusted_device_id === deviceId) {
      throw AppError.badRequest('No puedes bloquear tu propio dispositivo. Usa el endpoint de logout');
    }

    // Verificar que el dispositivo a bloquear existe y pertenece al usuario
    const targetDevice = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!targetDevice) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    if (targetDevice.status === 'blocked') {
      throw AppError.badRequest('El dispositivo ya está bloqueado');
    }

    // Garantizar que siempre quede al menos un trusted
    if (targetDevice.status === 'trusted') {
      const trustedCount = await this.trustedDeviceRepository.countTrusted(userId);
      if (trustedCount <= 1) {
        throw AppError.badRequest('No puedes bloquear el único dispositivo de confianza. Promueve otro dispositivo primero');
      }
    }

    const updated = await this.trustedDeviceRepository.block(deviceId);

    // ── Invalidación inmediata del access token en Redis ─────────────────────
    // Los access tokens no se pueden revocar por sí mismos, así que escribimos el
    // fingerprint del dispositivo bloqueado en Redis para que el auth middleware lo rechace
    // en el próximo request, sin esperar a que el token expire (~1h).
    // El TTL de la clave es DEFAULT_TTL (1h) ya que no conocemos el exp del
    // token activo del dispositivo bloqueado en este momento.
    DeviceBlocklistUtil.block(userId, targetDevice.fingerprint_hash).catch(err =>
      logger.warn('Error escribiendo blocklist en Redis tras blockDevice', {
        error: err.message,
        userId,
        deviceId,
        fingerprintHash: targetDevice.fingerprint_hash
      })
    );

    logAudit(
      'TRUSTED_DEVICE_BLOCKED',
      userId,
      {
        blockedByDeviceId: currentDevice.user_trusted_device_id
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(updated);
  }

  /**
   * Desbloquea un dispositivo BLOCKED → vuelve a PENDING.
   * Solo puede ejecutarse desde un dispositivo TRUSTED.
   */
  async unblockDevice(userId, deviceId, currentFingerprintHash) {
    // Verificar que quien desbloquea es TRUSTED
    const currentDevice = await this.trustedDeviceRepository.findByFingerprint(userId, currentFingerprintHash);
    if (!currentDevice || currentDevice.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes desbloquear dispositivos desde un dispositivo de confianza');
    }

    // Verificar que el dispositivo a desbloquear existe y está bloqueado
    const targetDevice = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!targetDevice) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    if (targetDevice.status !== 'blocked') {
      throw AppError.badRequest('El dispositivo no está bloqueado');
    }

    // Al desbloquear vuelve a pending (requiere aprobación de un trusted para operar)
    const updated = await this.trustedDeviceRepository.unblock(deviceId);

    // ── Limpiar la entrada de Redis ──────────────────────────────────────────
    // Si la clave aún existe (el token original no expiró), la eliminamos
    // para que el dispositivo pueda operar de inmediato una vez lo aprueben.
    DeviceBlocklistUtil.unblock(userId, targetDevice.fingerprint_hash).catch(err =>
      logger.warn('Error eliminando blocklist en Redis tras unblockDevice', {
        error: err.message,
        userId,
        deviceId,
        fingerprintHash: targetDevice.fingerprint_hash
      })
    );

    logAudit(
      'TRUSTED_DEVICE_UNBLOCKED',
      userId,
      {
        unblockedByDeviceId: currentDevice.user_trusted_device_id
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(updated);
  }

  /**
   * Aprueba un dispositivo PENDING → pasa a TRUSTED.
   * Solo puede ejecutarse desde un dispositivo TRUSTED.
   */
  async approveDevice(userId, deviceId, currentFingerprintHash) {
    // Verificar que el dispositivo actual es TRUSTED (quien aprueba)

    const currentDevice = await this.trustedDeviceRepository.findByFingerprint(userId, currentFingerprintHash);
    if (!currentDevice || currentDevice.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes aprobar dispositivos desde un dispositivo de confianza');
    }

    // Verificar que el dispositivo a aprobar pertenece al usuario y está PENDING
    const pendingDevice = await this.trustedDeviceRepository.findByIdAndUser(deviceId, userId);
    if (!pendingDevice) {
      throw AppError.notFound('Dispositivo no encontrado');
    }
    if (pendingDevice.status !== 'pending') {
      throw AppError.badRequest('El dispositivo no está pendiente de aprobación');
    }

    const approved = await this.trustedDeviceRepository.approve(deviceId, currentDevice.user_trusted_device_id);

    logAudit(
      'TRUSTED_DEVICE_APPROVED',
      userId,
      {
        approvedByDeviceId: currentDevice.user_trusted_device_id
      },
      { entityId: deviceId, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return TrustedDeviceUpdateDTO(approved);
  }
}

module.exports = TrustedDeviceManagementService;
