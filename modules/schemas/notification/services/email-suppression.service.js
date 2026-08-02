const emailBounceSuppressionRepo = require('../repositories/email-bounce-suppression.repository');
const EncryptionUtil = require('../../../../shared/utils/encryption.util');
const MaskingUtil = require('../../../../shared/utils/masking.util');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');

// Umbral de rebotes duros para bloquear una dirección de correo. Regla de negocio (no configurable
// por env): a los 3 hard bounces la dirección se suprime.
const HARD_BOUNCE_SUPPRESSION_THRESHOLD = 3;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

const ENTITY = { entityType: 'EmailBounceSuppression', entityTable: 'email_bounce_suppressions' };

class EmailSuppressionService {
  /** Normaliza un correo (o hash ya calculado) a su email_hash SHA-256. */
  _toHash(emailOrHash) {
    if (!emailOrHash) {
      return null;
    }
    // Un hash SHA-256 es hex de 64 chars; si ya viene así (desde el listado admin), se usa tal cual.
    if (SHA256_HEX.test(emailOrHash)) {
      return emailOrHash.toLowerCase();
    }
    return EncryptionUtil.generateHash(emailOrHash.trim().toLowerCase());
  }

  /** ¿La dirección está bloqueada para envíos? */
  isSuppressed(emailOrHash) {
    const emailHash = this._toHash(emailOrHash);
    if (!emailHash) {
      return Promise.resolve(false);
    }
    return emailBounceSuppressionRepo.isSuppressed(emailHash);
  }

  /**
   * Registra un rebote duro para una dirección. Incrementa el contador y, al alcanzar el umbral,
   * bloquea la dirección. Emite auditoría del rebote y del bloqueo (cuando ocurre).
   * @param {{ email?: string, emailHash?: string, errorCode?: string, userId?: string }} params
   */
  async registerHardBounce({ email = null, emailHash = null, errorCode = null, userId = null }) {
    const hash = this._toHash(emailHash || email);
    if (!hash) {
      return null;
    }

    const result = await emailBounceSuppressionRepo.registerHardBounce(hash, {
      userId,
      errorCode,
      threshold: HARD_BOUNCE_SUPPRESSION_THRESHOLD
    });

    const maskedEmail = email ? MaskingUtil.maskEmail(email) : null;

    logAudit(
      'EMAIL_HARD_BOUNCE_RECORDED',
      'system',
      { emailHash: hash, maskedEmail, errorCode, bounceCount: result.bounceCount, threshold: HARD_BOUNCE_SUPPRESSION_THRESHOLD },
      { ...ENTITY, outcome: 'failure' }
    );

    // Solo la transición active → suppressed dispara el evento de bloqueo (no cada rebote posterior).
    if (result.suppressed && !result.alreadySuppressed) {
      logger.warn('[EmailSuppression] Dirección bloqueada por rebotes duros', {
        emailHash: hash,
        bounceCount: result.bounceCount
      });
      logAudit(
        'EMAIL_ADDRESS_SUPPRESSED',
        'system',
        { emailHash: hash, maskedEmail, bounceCount: result.bounceCount, threshold: HARD_BOUNCE_SUPPRESSION_THRESHOLD },
        { ...ENTITY, outcome: 'failure' }
      );
    }

    return result;
  }

  /**
   * Levanta la supresión de una dirección (des-bloqueo manual por un admin).
   * @param {{ email?: string, emailHash?: string, adminUserId: string }} params
   */
  async lift({ email = null, emailHash = null, adminUserId }) {
    const hash = this._toHash(emailHash || email);
    const record = await emailBounceSuppressionRepo.lift(hash);
    logAudit(
      'EMAIL_SUPPRESSION_LIFTED',
      adminUserId,
      { emailHash: hash, maskedEmail: email ? MaskingUtil.maskEmail(email) : null, found: record !== null },
      { ...ENTITY }
    );
    return record;
  }
}

const instance = new EmailSuppressionService();
instance.threshold = HARD_BOUNCE_SUPPRESSION_THRESHOLD;
module.exports = instance;
