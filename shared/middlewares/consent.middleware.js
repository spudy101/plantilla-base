const AppError = require('../utils/app-error.util');
const { logger, logAudit } = require('../utils/logger.util');
const { asyncHandler } = require('./error.middleware');
const userConsentRepository = require('../../modules/schemas/records/legal/repositories/user-consent.repository');
const consentTypeRepository = require('../../modules/schemas/records/legal/repositories/consent-type.repository');

// Nota: para gatear una operación por un consentimiento OBLIGATORIO, usa requireConsent() como middleware
// de ruta. Si tu dominio necesita exigir varios consentimientos en un solo submit (acumular todas las
// faltas en una respuesta 422 en vez de fallar de a una), valídalos directamente en el service en lugar
// de encadenar varios middlewares.

class ConsentMiddleware {
  /**
   * Verifica que el usuario autenticado tenga un consentimiento válido y vigente
   * para el tipo indicado antes de permitir el acceso a datos de terceros.
   *
   * Si no existe, detiene el proceso y registra un error de compliance en auditoría.
   *
   * @param {string} consentTypeCode — código del tipo (ej: 'PRIVACY_POLICY')
   */
  static requireConsent(consentTypeCode) {
    return asyncHandler(async (req, _res, next) => {
      const userId = req.user?.userId;
      if (!userId) {
        throw AppError.unauthorized('Token requerido');
      }

      const consentType = await consentTypeRepository.findByCode(consentTypeCode);
      if (!consentType) {
        logger.warn('ConsentMiddleware: tipo de consentimiento no configurado', { consentTypeCode, userId });
        logAudit(
          'CONSENT_VERIFIED_FAIL',
          userId,
          { reason: 'consent_type_not_found', consentTypeCode },
          { entityType: 'UserConsent', outcome: 'failure' }
        );
        throw AppError.forbidden(`El tipo de consentimiento "${consentTypeCode}" no está configurado`, {
          code: 'CONSENT_TYPE_NOT_FOUND'
        });
      }

      // Ley 1581/2012 — un consentimiento opcional NUNCA puede ser condición de acceso
      if (!consentType.is_mandatory) {
        logger.error('ConsentMiddleware: uso incorrecto — requireConsent() con tipo opcional', { consentTypeCode });
        throw AppError.internal(
          `ConsentMiddleware.requireConsent() no puede usarse con el tipo opcional "${consentTypeCode}". ` +
            'Los consentimientos opcionales no pueden ser condición de acceso al servicio.',
          { code: 'CONSENT_MIDDLEWARE_MISCONFIGURATION' }
        );
      }

      const existing = await userConsentRepository.findCurrentByUserAndType(userId, consentType.consent_type_id);
      const isValid = existing && !existing.revoked_at;

      if (!isValid) {
        logAudit(
          'CONSENT_VERIFIED_FAIL',
          userId,
          {
            reason: 'no_valid_consent',
            consentTypeCode,
            consentTypeId: consentType.consent_type_id
          },
          { entityType: 'UserConsent', outcome: 'failure' }
        );
        throw AppError.forbidden('No se encontró un consentimiento válido y vigente para continuar con esta operación', {
          code: 'CONSENT_REQUIRED',
          consentTypeCode
        });
      }

      logAudit(
        'CONSENT_VERIFIED_OK',
        userId,
        { consentTypeCode, consentTypeId: consentType.consent_type_id },
        { entityType: 'UserConsent', entityId: existing.user_consent_id }
      );

      next();
    });
  }
}

module.exports = ConsentMiddleware;
