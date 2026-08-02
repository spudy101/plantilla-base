const { body, header } = require('express-validator');
const BaseValidator = require('../../../../../shared/validators/base.validator');

class AuthLoginValidator {
  /** POST /auth/login */
  static login() {
    return [
      ...BaseValidator.nationalId(),
      ...BaseValidator.password(),
      header('x-client-type')
        .notEmpty()
        .withMessage({ message: 'X-Client-Type es requerido', hint: 'Indicá web o mobile' })
        .isIn(['web', 'mobile'])
        .withMessage({ message: 'X-Client-Type debe ser web o mobile', hint: 'Indicá web o mobile' }),
      // Push notifications (solo mobile, todos opcionales)
      body('pushToken')
        .optional()
        .isString()
        .withMessage({ message: 'pushToken debe ser un string', hint: 'Ingresá el token de push como texto' }),
      body('pushDeviceId')
        .optional()
        .isString()
        .withMessage({ message: 'pushDeviceId debe ser un string', hint: 'Ingresá el ID del dispositivo como texto' }),
      body('pushPlatform')
        .optional()
        .isIn(['android', 'ios'])
        .withMessage({ message: 'pushPlatform debe ser android o ios', hint: 'Indicá android o ios' }),
      // Política de privacidad — opcional, solo cuando el servidor la solicitó
      body('acceptPolicy')
        .optional()
        .isBoolean()
        .withMessage({ message: 'acceptPolicy debe ser verdadero o falso', hint: 'Ingresá true o false' })
    ];
  }

  /** POST /auth/verify-mfa */
  static verifyMFA() {
    return [
      ...BaseValidator.nationalId(),
      body('totpCode')
        .optional()
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage({ message: 'El código TOTP debe tener exactamente 6 dígitos', hint: 'Ingresá el código de 6 dígitos' })
        .isNumeric()
        .withMessage({ message: 'El código TOTP debe contener solo números', hint: 'Ingresá el código de 6 dígitos' }),
      body('smsCode')
        .optional()
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage({ message: 'El código SMS debe tener exactamente 6 dígitos', hint: 'Ingresá el código de 6 dígitos' })
        .isNumeric()
        .withMessage({ message: 'El código SMS debe contener solo números', hint: 'Ingresá el código de 6 dígitos' }),
      body().custom((_, { req }) => {
        if (!req.body.totpCode && !req.body.smsCode) {
          throw new Error('Se requiere totpCode o smsCode');
        }
        return true;
      }),
      body('session')
        .trim()
        .notEmpty()
        .withMessage({ message: 'La sesión es requerida', hint: 'Reenviá el identificador de sesión recibido en el login' }),
      header('x-client-type')
        .notEmpty()
        .withMessage({ message: 'X-Client-Type es requerido', hint: 'Indicá web o mobile' })
        .isIn(['web', 'mobile'])
        .withMessage({ message: 'X-Client-Type debe ser web o mobile', hint: 'Indicá web o mobile' }),
      body('acceptPolicy')
        .optional()
        .isBoolean()
        .withMessage({ message: 'acceptPolicy debe ser verdadero o falso', hint: 'Ingresá true o false' })
    ];
  }

  /** POST /auth/refresh */
  static refreshToken() {
    return [
      header('x-client-type')
        .notEmpty()
        .withMessage({ message: 'X-Client-Type es requerido', hint: 'Indicá web o mobile' })
        .isIn(['web', 'mobile'])
        .withMessage({ message: 'X-Client-Type debe ser web o mobile', hint: 'Indicá web o mobile' }),
      // x-refresh-token solo requerido para mobile (web lo trae en cookie)
      header('x-refresh-token').if(header('x-client-type').equals('mobile')).notEmpty().withMessage({
        message: 'X-Refresh-Token es requerido para mobile',
        hint: 'Incluí el header X-Refresh-Token en la petición'
      })
    ];
  }

  /** PATCH /auth/devices/:deviceId */
  static renameDevice() {
    return [
      ...BaseValidator.uuidParam('deviceId', 'El ID del dispositivo'),
      body('deviceName')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El nombre del dispositivo es requerido', hint: 'Ingresá un nombre de entre 1 y 100 caracteres' })
        .isLength({ min: 1, max: 100 })
        .withMessage({
          message: 'El nombre debe tener entre 1 y 100 caracteres',
          hint: 'Ingresá un nombre de entre 1 y 100 caracteres'
        })
    ];
  }

  /** POST /auth/devices/:deviceId/approve */
  static approveDevice() {
    return [...BaseValidator.uuidParam('deviceId', 'El ID del dispositivo')];
  }

  /** POST /auth/devices/:deviceId/block */
  static blockDevice() {
    return [...BaseValidator.uuidParam('deviceId', 'El ID del dispositivo')];
  }

  /** POST /auth/devices/:deviceId/unblock */
  static unblockDevice() {
    return [...BaseValidator.uuidParam('deviceId', 'El ID del dispositivo')];
  }

  /** DELETE /auth/sessions/:sessionId */
  static closeSession() {
    return [...BaseValidator.uuidParam('sessionId', 'El ID de sesión')];
  }
}

module.exports = AuthLoginValidator;
