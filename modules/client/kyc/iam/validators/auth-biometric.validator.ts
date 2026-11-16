// ============================================================
// auth-biometric.validator.ts
// ============================================================

import expressValidatorModule = require('express-validator');
const { body } = expressValidatorModule;
import BaseValidator = require('../../../../../shared/validators/base.validator');

class AuthBiometricValidator {
  /** POST /auth/biometric/register/start — solo requiere auth */
  static registerStart() {
    return [];
  }

  /** POST /auth/biometric/register/finish */
  static registerFinish() {
    return [
      body('credentialId')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El credentialId es requerido', hint: 'Incluí el credentialId devuelto por el autenticador' }),
      body('publicKey')
        .trim()
        .notEmpty()
        .withMessage({ message: 'La llave pública es requerida', hint: 'Incluí la llave pública generada por el autenticador' }),
      body('challenge')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El challenge es requerido', hint: 'Incluí el challenge recibido al iniciar el registro' }),
      body('signature')
        .trim()
        .notEmpty()
        .withMessage({ message: 'La firma es requerida', hint: 'Incluí la firma generada por el autenticador' })
    ];
  }

  /** POST /auth/biometric/login/start */
  static loginStart() {
    return [...BaseValidator.nationalId()];
  }

  /** POST /auth/biometric/login/finish */
  static loginFinish() {
    return [
      body('credentialId')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El credentialId es requerido', hint: 'Incluí el credentialId devuelto por el autenticador' }),
      body('challenge')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El challenge es requerido', hint: 'Incluí el challenge recibido al iniciar el login' }),
      body('signature')
        .trim()
        .notEmpty()
        .withMessage({ message: 'La firma es requerida', hint: 'Incluí la firma generada por el autenticador' }),
      body('signCount')
        .isInt({ min: 0 })
        .withMessage({ message: 'El signCount debe ser un entero positivo', hint: 'Ingresá un entero mayor o igual a 0' }),
      ...BaseValidator.optionalBoolean('acceptPolicy', 'acceptPolicy')
    ];
  }

  /** DELETE /auth/biometric/:credentialId */
  static deleteCredential() {
    return [...BaseValidator.uuidParam('credentialId', 'El ID de la credencial biométrica')];
  }
}

export = AuthBiometricValidator;
