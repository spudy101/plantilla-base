const { header, body } = require('express-validator');
const BaseValidator = require('../../../../../shared/validators/base.validator');

/**
 * ============================================================
 * AUTH REGISTER VALIDATOR
 * ============================================================
 */

class AuthRegisterValidator {
  /**
   * POST /auth/register
   */
  static register() {
    return [
      ...BaseValidator.email(),
      ...BaseValidator.password(),
      ...BaseValidator.firstName(),
      ...BaseValidator.optionalMiddleName(),
      ...BaseValidator.lastName(),
      ...BaseValidator.optionalSecondLastName(),
      ...BaseValidator.optionalBirthDate(),
      ...BaseValidator.nationalId(),
      ...BaseValidator.optionalUuidBody('documentTypeId', 'El tipo de documento'),
      ...BaseValidator.optionalUuidBody('genderId', 'El género'),
      ...BaseValidator.optionalUuidBody('countryId', 'El país de nacionalidad'),
      header('x-client-type')
        .notEmpty()
        .withMessage({ message: 'X-Client-Type es requerido', hint: 'Incluí el header X-Client-Type con valor web o mobile' })
        .isIn(['web', 'mobile'])
        .withMessage({ message: 'X-Client-Type debe ser web o mobile', hint: 'Indicá web o mobile en el header X-Client-Type' }),
      // Política de privacidad — obligatoria para cumplir Ley 1581 / App Stores
      body('acceptedPrivacyPolicy')
        .notEmpty()
        .withMessage({
          message: 'Debes aceptar la política de privacidad',
          hint: 'Enviá true para aceptar la política de privacidad'
        })
        .isBoolean()
        .withMessage({
          message: 'El campo acceptedPrivacyPolicy debe ser verdadero o falso',
          hint: 'Enviá true para aceptar la política de privacidad'
        })
        .custom(val => {
          if (val === false || val === 'false') {
            throw new Error('Debes aceptar la política de privacidad para registrarte');
          }
          return true;
        }),
      // Comunicaciones comerciales — opcional (Ley 1581/2012: no puede ser condición de acceso)
      body('comunicacionesComerciales')
        .optional()
        .isBoolean()
        .withMessage({ message: 'El campo comunicacionesComerciales debe ser verdadero o falso', hint: 'Ingresá true o false' })
        .toBoolean()
    ];
  }

  /**
   * POST /auth/reset-credentials/request
   */
  static requestResetCredentials() {
    return [...BaseValidator.email(), ...BaseValidator.resetType()];
  }

  /**
   * POST /auth/reset-credentials/confirm
   */
  static confirmResetCredentials() {
    return [...BaseValidator.resetToken(), ...BaseValidator.resetType(), ...BaseValidator.conditionalNewPassword()];
  }
}

module.exports = AuthRegisterValidator;
