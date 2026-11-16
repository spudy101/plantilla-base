// shared/services/hmac.service.ts
//
// Service estático para validación HMAC de requests mobile (anti-replay).
//
// Arquitectura intencional:
//   Middleware → HmacService → TrustedDeviceRepository → BD
//
// El middleware no llama al repository directamente — lo hace a través
// de este service, respetando la separación de capas.
//
// El hmac_secret está cifrado en BD con AES-256-GCM (hooks del modelo).
// Al leerlo, el hook lo descifra automáticamente — el service recibe
// el valor en texto plano sin hacer nada especial.

import type { Request } from 'express';
import EncryptionUtil = require('../utils/encryption.util');
import AppError = require('../utils/app-error.util');
import loggerUtilModule = require('../utils/logger.util');
const { logger } = loggerUtilModule;


const TIMESTAMP_TOLERANCE_SECONDS = 10;

/** Lo que HmacService necesita del repositorio de dispositivos de confianza. */
interface TrustedDeviceLookup {
  findOne(criteria: { fingerprint_hash: string }): Promise<{ hmac_secret?: string | null } | null>;
}

/** Un header de Express puede venir repetido (string[]): se toma el primer valor. */
const headerValue = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

class HmacService {
  private _trustedDeviceRepository: TrustedDeviceLookup | null;

  /**
   * Dependencias inyectables (SOLID: D). Sin trustedDeviceRepository se carga el real de forma
   * perezosa: auth-trusted-device.repository importa este service (generateDeviceSecret), así que
   * un require eager crearía un ciclo de carga.
   * @param {object} [deps]
   */
  constructor(deps: { trustedDeviceRepository?: TrustedDeviceLookup } = {}) {
    this._trustedDeviceRepository = deps.trustedDeviceRepository ?? null;
  }

  get trustedDeviceRepository(): TrustedDeviceLookup {
    this._trustedDeviceRepository ??= require('../../modules/schemas/kyc/iam/repositories/auth-trusted-device.repository') as TrustedDeviceLookup;
    return this._trustedDeviceRepository;
  }

  /**
   * Verifica la firma HMAC de un request mobile.
   *
   * Headers esperados:
   *   x-timestamp  : unix ms en texto plano  (ej: "1736000000000")
   *   x-signature  : HMAC-SHA256 hex         (ej: "abc123...")
   *   x-device-id  : fingerprint_hash del dispositivo
   *
   * @param {import('express').Request} req
   * @throws {AppError} si el timestamp expiró o la firma es inválida
   */
  async verifyRequestSignature(req: Request): Promise<void> {
    const timestamp = headerValue(req.headers['x-timestamp']);
    const signature = headerValue(req.headers['x-signature']);
    const fingerprintHash = headerValue(req.headers['x-device-id']);

    if (!timestamp) {
      throw AppError.unauthorized('X-Timestamp header requerido');
    }
    if (!signature) {
      throw AppError.unauthorized('X-Signature header requerido');
    }
    if (!fingerprintHash) {
      throw AppError.unauthorized('X-Device-Id header requerido');
    }

    // ── 1. Validar ventana de tiempo ──────────────────────────
    const requestTime = Number.parseInt(timestamp, 10);
    if (Number.isNaN(requestTime)) {
      throw AppError.unauthorized('Timestamp inválido');
    }

    const diffSeconds = Math.abs(Date.now() - requestTime) / 1000;
    if (diffSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
      logger.warn('HMAC — timestamp fuera de ventana', {
        diff: `${diffSeconds.toFixed(2)}s`,
        tolerance: `${TIMESTAMP_TOLERANCE_SECONDS}s`,
        ip: req.ip
      });
      throw AppError.unauthorized(
        `Timestamp expirado. El request debe realizarse dentro de ${TIMESTAMP_TOLERANCE_SECONDS} segundos`
      );
    }

    // ── 2. Obtener secret del dispositivo desde BD ────────────
    // El hmac_secret está cifrado en BD — el hook afterFind lo descifra
    // automáticamente antes de llegar aquí.
    const device = await this.trustedDeviceRepository.findOne({ fingerprint_hash: fingerprintHash });

    if (!device?.hmac_secret) {
      logger.warn('HMAC — dispositivo sin secret registrado', { fingerprintHash });
      throw AppError.unauthorized('Dispositivo no reconocido. Inicia sesión nuevamente.');
    }

    // ── 3. Verificar firma ─────────────────────────────────────
    const path = req.path || req.originalUrl?.split('?')[0] || '/';
    const expected = EncryptionUtil.generateRequestHmac(timestamp, req.method, path, device.hmac_secret);

    if (!EncryptionUtil.verifyRequestHmac(signature, expected)) {
      logger.warn('HMAC — firma inválida', {
        method: req.method,
        path,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      throw AppError.unauthorized('Firma de request inválida');
    }
  }

  /**
   * Genera un nuevo secret HMAC para un dispositivo.
   * Llamado desde auth-login.service al registrar o autenticar un dispositivo.
   *
   * @returns {string} 64 chars hex (32 bytes de entropía)
   */
  // eslint-disable-next-line class-methods-use-this
  generateDeviceSecret() {
    const crypto = require('node:crypto');
    const DEVICE_SECRET_BYTES = 32;
    return crypto.randomBytes(DEVICE_SECRET_BYTES).toString('hex');
  }
}

export = Object.assign(new HmacService(), { HmacService });
