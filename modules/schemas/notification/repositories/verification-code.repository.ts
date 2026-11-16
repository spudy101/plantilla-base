import BaseRepository = require('../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../shared/models');
const { VerificationCode } = modelsModule;
import sequelizeModule = require('sequelize');
const { Op, literal } = sequelizeModule;
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger } = loggerUtilModule;
import requestContext = require('../../../../shared/utils/request-context.util');
import type { CreateOptions, DestroyOptions, UpdateOptions } from 'sequelize';
import type defineVerificationCode = require('../models/verification-code.model');

class VerificationCodeRepository extends BaseRepository<defineVerificationCode.Instance> {
  constructor() {
    super(VerificationCode);
  }

  static RATE_LIMIT_SECONDS = 60;

  findActiveByContact(type: defineVerificationCode.Attributes['type'], contactValue: string) {
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

  findVerifiedByContact(type: defineVerificationCode.Attributes['type'], contactValue: string) {
    return this.findOne(
      {
        type,
        contact_value: contactValue,
        verified_at: { [Op.ne]: null }
      },
      { order: [['verified_at', 'DESC']] }
    );
  }

  deleteVerifiedByContact(
    type: defineVerificationCode.Attributes['type'],
    contactValue: string,
    options: Omit<DestroyOptions<defineVerificationCode.Attributes>, 'where'> = {}
  ) {
    return this.model.destroy({
      where: {
        type,
        contact_value: contactValue,
        verified_at: { [Op.ne]: null }
      },
      ...options
    });
  }

  override create(
    codeData: Pick<defineVerificationCode.CreationAttributes, 'type' | 'contact_value' | 'code' | 'expires_at'>,
    options: CreateOptions<defineVerificationCode.Attributes> = {}
  ) {
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

  markAsVerified(verificationCodeId: string, options = {}, verifiedAt = new Date()) {
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
  async canRequestNewCode(type: defineVerificationCode.Attributes['type'], contactValue: string) {
    const threshold = new Date(Date.now() - VerificationCodeRepository.RATE_LIMIT_SECONDS * 1000);

    const recentCode = await this.findOne(
      {
        type,
        contact_value: contactValue,
        createdAt: { [Op.gte]: threshold },
        verified_at: null
      },
      { order: [['created_at', 'DESC']] }
    );

    return !recentCode;
  }

  /**
   * Incrementa contador de intentos
   */
  // options: { transaction } (antes no se aceptaba y el incremento corría fuera de la transacción del llamador)
  async incrementAttempts(verificationCodeId: string, options: Omit<UpdateOptions<defineVerificationCode.Attributes>, 'where'> = {}) {
    const [affectedRows] = await this.model.update(
      { attempts: literal('attempts + 1') },
      {
        where: {
          verification_code_id: verificationCodeId,
          verified_at: null,
          expires_at: { [Op.gt]: new Date() }
        },
        ...options
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

  deleteOldVerified(retentionDays: number) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.model.destroy({
      where: {
        verified_at: { [Op.lt]: cutoff }
      }
    });
  }

  // Override para usar verification_code_id
  override findById(verificationCodeId: string, options = {}) {
    return this.model.findByPk(verificationCodeId, options);
  }
}

export = new VerificationCodeRepository();
