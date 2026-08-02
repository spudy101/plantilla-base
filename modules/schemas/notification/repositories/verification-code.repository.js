const BaseRepository = require('../../../../shared/repositories/base.repository');
const { VerificationCode } = require('../../../../shared/models');
const { Op, literal } = require('sequelize');
const { logger } = require('../../../../shared/utils/logger.util');
const requestContext = require('../../../../shared/utils/request-context.util');

class VerificationCodeRepository extends BaseRepository {
  constructor() {
    super(VerificationCode);
  }

  static RATE_LIMIT_SECONDS = 60;

  findActiveByContact(type, contactValue) {
    return this.findOne(
      {
        type,
        contact_value: contactValue,
        expires_at: { [Op.gt]: new Date() },
        verified_at: null
      },
      { order: [['created_at', 'DESC']] }
    );
  }

  findVerifiedByContact(type, contactValue) {
    return this.findOne(
      {
        type,
        contact_value: contactValue,
        verified_at: { [Op.ne]: null }
      },
      { order: [['verified_at', 'DESC']] }
    );
  }

  deleteVerifiedByContact(type, contactValue, options = {}) {
    return this.model.destroy({
      where: {
        type,
        contact_value: contactValue,
        verified_at: { [Op.ne]: null }
      },
      ...options
    });
  }

  create(codeData, options = {}) {
    return super.create(
      {
        type: codeData.type,
        contact_value: codeData.contact_value,
        code: codeData.code,
        expires_at: codeData.expires_at,
        verified_at: null,
        // Whitelist estricta: si no se listan acá, se descartan en silencio (como ya pasa con `attempts`).
        // Null en los OTP de onboarding y en el challenge SMS de login (rutas públicas, pre-sesión);
        // con valor al activar MFA y al firmar contrato, que sí son autenticados.
        ...requestContext.originFromContext()
      },
      options
    );
  }

  markAsVerified(verificationCodeId, options = {}, verifiedAt = new Date()) {
    const dateToUse = verifiedAt || new Date();

    // Validación adicional por seguridad
    if (!(dateToUse instanceof Date) || Number.isNaN(dateToUse.getTime())) {
      logger.warn('Invalid date provided to markAsVerified, using current date', {
        verificationCodeId,
        providedDate: verifiedAt
      });
      return this.update(verificationCodeId, { verified_at: new Date() }, options);
    }

    return this.update(verificationCodeId, { verified_at: dateToUse }, options);
  }

  /**
   * Verifica rate limiting (1 código por minuto)
   */
  async canRequestNewCode(type, contactValue) {
    const threshold = new Date(Date.now() - VerificationCodeRepository.RATE_LIMIT_SECONDS * 1000);

    const recentCode = await this.findOne(
      {
        type,
        contact_value: contactValue,
        created_at: { [Op.gte]: threshold },
        verified_at: null
      },
      { order: [['created_at', 'DESC']] }
    );

    return !recentCode;
  }

  /**
   * Incrementa contador de intentos
   */
  async incrementAttempts(verificationCodeId) {
    const [affectedRows] = await this.model.update(
      { attempts: literal('attempts + 1') },
      {
        where: {
          verification_code_id: verificationCodeId,
          verified_at: null,
          expires_at: { [Op.gt]: new Date() }
        }
      }
    );

    return affectedRows;
  }

  deleteExpired() {
    return this.model.destroy({
      where: {
        verified_at: null,
        expires_at: { [Op.lt]: new Date() }
      }
    });
  }

  deleteOldVerified(retentionDays) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.model.destroy({
      where: {
        verified_at: { [Op.lt]: cutoff }
      }
    });
  }

  // Override para usar verification_code_id
  findById(verificationCodeId, options = {}) {
    return this.model.findByPk(verificationCodeId, options);
  }
}

module.exports = new VerificationCodeRepository();
