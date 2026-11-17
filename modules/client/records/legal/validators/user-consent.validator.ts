import { body } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';

class UserConsentValidator {
  static grant() {
    return [
      body().isArray({ min: 1 }).withMessage({
        message: 'El cuerpo debe ser un array con al menos un consentimiento',
        hint: 'Enviá un array con al menos un consentimiento'
      }),
      body('*.consentTypeCode')
        .notEmpty()
        .withMessage({ message: 'consentTypeCode es requerido', hint: 'Incluí el código del tipo de consentimiento' })
        .isString()
        .trim()
        .toUpperCase(),
      body('*.privacyPolicyId')
        .optional({ nullable: true })
        .isUUID()
        .withMessage({ message: 'privacyPolicyId debe ser un UUID válido', hint: 'El identificador debe ser un UUID válido' })
    ];
  }

  static revokeParam() {
    return [
      ...BaseValidator.uuidParam('consentTypeId', 'El ID de tipo de consentimiento'),
      body('reason').optional({ nullable: true }).isString().trim().isLength({ max: 500 })
    ];
  }
}

export default UserConsentValidator;
