const BaseValidator = require('../../../../../shared/validators/base.validator');

/**
 * ============================================================
 * MFA VALIDATOR — CLIENT
 * ============================================================
 * Compone reglas desde BaseValidator — nunca duplicar reglas aquí.
 */

class MFAValidator {
  /** POST /mfa/activate-totp */
  static activateTOTP() {
    return [...BaseValidator.totpCode()];
  }

  /** POST /mfa/verify-totp */
  static verifyTOTP() {
    return [...BaseValidator.totpCode()];
  }

  /** POST /mfa/validate-password */
  static validatePassword() {
    return [...BaseValidator.password()];
  }

  /** POST /mfa/deactivate-totp */
  static deactivateTOTP() {
    return [...BaseValidator.password()];
  }

  /** POST /mfa/sms/request */
  static requestSMSActivation() {
    return [...BaseValidator.password()];
  }

  /** POST /mfa/sms/confirm */
  static confirmSMSActivation() {
    const { body } = require('express-validator');
    return [
      body('code')
        .notEmpty()
        .withMessage({ message: 'El código de verificación es requerido', hint: 'Ingresá el código de 6 dígitos' })
        .isString()
        .trim()
        .matches(/^\d{6}$/)
        .withMessage({ message: 'El código debe ser de 6 dígitos numéricos', hint: 'Ingresá el código de 6 dígitos' })
    ];
  }

  /** POST /mfa/deactivate-sms */
  static deactivateSMS() {
    return [...BaseValidator.password()];
  }

  /** PUT /mfa/preferred-method */
  static updatePreferredMethod() {
    const { body } = require('express-validator');
    return [
      body('preferredMethod')
        .notEmpty()
        .withMessage({ message: 'El método preferido es requerido', hint: 'Indicá none, totp o sms' })
        .isIn(['none', 'totp', 'sms'])
        .withMessage({ message: 'El método debe ser "none", "totp" o "sms"', hint: 'Indicá none, totp o sms' })
    ];
  }
}

module.exports = MFAValidator;
