// modules/shared-endpoints/kyc/iam/services/auth-login/login-device.service.js
//
// Resolución del dispositivo durante el login: primer dispositivo, dispositivo
// conocido o nuevo pendiente de aprobación. Extraído de AuthLoginService (SOLID: S).

const trustedDeviceRepository = require('../../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository');
const DeviceFingerprintUtil = require('../../../../../../shared/utils/device-fingerprint.util');
const NotificationUtil = require('../../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { notifications } = require('../../../../../../shared/constants');

class LoginDeviceService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   AuthLoginService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.trustedDeviceRepository = deps.trustedDeviceRepository ?? trustedDeviceRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  /**
   * Maneja el ciclo de vida del dispositivo en cada login.
   * Corre síncronamente — su resultado puede bloquear el login.
   *
   * Retorna:
   *   { requiresApproval: false, deviceId }  → login puede continuar
   *   { requiresApproval: true,  deviceId }  → login bloqueado
   *
   * @private
   */
  // [RF-AUTH-03] | CA-03 | Detecta si el dispositivo es nuevo por fingerprint hash.
  // Dispositivo conocido desde IP/ubicación distinta no genera alerta (decisión técnica:
  // evitar ruido por VPNs y roaming)
  async handleTrustedDevice(user, auditContext) {
    const { ip, userAgent, fingerprintHash } = auditContext;

    // ── ¿El dispositivo ya existe? ───────────────────────────
    const existing = await this.trustedDeviceRepository.findByFingerprint(user.user_id, fingerprintHash);
    if (existing) {
      return this._handleExistingDevice(user.user_id, fingerprintHash, existing);
    }

    // ── Dispositivo nuevo ────────────────────────────────────
    const enriched = DeviceFingerprintUtil.enrichDevice(userAgent, ip);
    const trustedCount = await this.trustedDeviceRepository.countTrusted(user.user_id);
    const isFirstDevice = trustedCount === 0;

    if (isFirstDevice) {
      return this._registerFirstDevice(user, fingerprintHash, ip, enriched);
    }

    return this._registerPendingDevice(user, fingerprintHash, ip, enriched);
  }

  /** @private */
  async _handleExistingDevice(userId, fingerprintHash, existing) {
    if (existing.status === 'blocked') {
      // Evento forense de seguridad (Opción A): política de dispositivo bloqueado.
      // Se mantiene pese al log genérico del middleware al propagar el throw.
      logAudit(
        'LOGIN_BLOCKED_DEVICE',
        userId,
        {},
        {
          entityId: existing.user_trusted_device_id,
          entityType: 'UserTrustedDevice',
          entityTable: 'user_trusted_devices',
          outcome: 'failure'
        }
      );
      throw AppError.forbidden('Este dispositivo ha sido bloqueado. Desbloquéalo desde otro dispositivo de confianza.');
    }

    // trusted o pending → puede loguearse, actualiza last_seen
    await this.trustedDeviceRepository.updateLastSeen(userId, fingerprintHash);
    return {
      requiresApproval: false,
      deviceId: existing.user_trusted_device_id,
      deviceHmacSecret: existing.hmac_secret
    };
  }

  /** @private */
  // [RF-AUTH-03] | CA-03 | Primer dispositivo del usuario → trusted automático,
  // sin notificación (es el dispositivo de registro inicial)
  async _registerFirstDevice(user, fingerprintHash, ip, enriched) {
    const { browser, os, deviceType, city, country, countryCode, deviceName } = enriched;

    const device = await this.trustedDeviceRepository.create({
      user_id: user.user_id,
      fingerprint_hash: fingerprintHash,
      device_name: deviceName,
      status: 'trusted',
      ip_address: ip,
      browser,
      os,
      device_type: deviceType,
      city,
      country,
      country_code: countryCode,
      trusted_at: new Date(),
      last_seen_at: new Date()
    });

    logAudit(
      'TRUSTED_DEVICE_ADDED_FIRST',
      user.user_id,
      { deviceName },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    return {
      requiresApproval: false,
      deviceId: device.user_trusted_device_id,
      deviceHmacSecret: device.hmac_secret
    };
  }

  /** @private */
  // [RF-AUTH-03] | CA-03 | Segundo dispositivo en adelante → status pending +
  // dispara NUEVO_DISPOSITIVO_DETECTADO (fire-and-forget)
  async _registerPendingDevice(user, fingerprintHash, ip, enriched) {
    const { browser, os, deviceType, city, country, countryCode, deviceName } = enriched;

    const device = await this.trustedDeviceRepository.create({
      user_id: user.user_id,
      fingerprint_hash: fingerprintHash,
      device_name: deviceName,
      status: 'pending',
      ip_address: ip,
      browser,
      os,
      device_type: deviceType,
      city,
      country,
      country_code: countryCode,
      last_seen_at: new Date()
    });

    logAudit(
      'TRUSTED_DEVICE_PENDING',
      user.user_id,
      {
        deviceName
      },
      { entityId: device.user_trusted_device_id, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    // Notificación informativa (fire-and-forget — no bloquea el flujo)
    const firstName = user.person?.first_name || 'Usuario';
    const email = user.person?.contact?.email;

    this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'NUEVO_DISPOSITIVO_DETECTADO',
      userId: user.user_id,
      relatedEntity: null,
      metadata: {
        nombre: firstName,
        email,
        ip,
        browser: browser || 'Desconocido',
        os: os || 'Desconocido',
        ciudad: city || 'Desconocida',
        pais: country || 'Desconocido',
        deviceName,
        fechaAcceso: new Date().toISOString(),
        logoUrl: notifications.ses.logoUrl
      }
    }).catch(err => logger.warn('Error sending new device notification', { error: err.message }));

    return {
      requiresApproval: false,
      deviceId: device.user_trusted_device_id,
      deviceHmacSecret: device.hmac_secret
    };
  }
}

module.exports = LoginDeviceService;
