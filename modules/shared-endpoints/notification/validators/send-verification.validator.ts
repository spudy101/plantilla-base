import expressValidatorModule = require('express-validator');
const { body } = expressValidatorModule;

class SendVerificationValidator {
  /** POST /verification/send-verification */
  static sendVerification() {
    return [
      body('type')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El tipo de verificación es requerido', hint: 'Indicá email o phone' })
        .isIn(['email', 'phone'])
        .withMessage({ message: 'Tipo de verificación inválido. Debe ser email o phone', hint: 'Indicá email o phone' }),

      body('contact')
        .isLength({ max: 100 })
        .trim()
        .notEmpty()
        .withMessage({ message: 'El contacto es requerido', hint: 'Ingresá el email o teléfono a verificar' })
        .custom((value, { req }) => {
          if (req.body.type === 'email') {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              throw new Error('Debe ser un email válido');
            }
          } else if (req.body.type === 'phone') {
            if (!/^\d{7,15}$/.test(value)) {
              throw new Error('Debe ser un número de teléfono válido (7-15 dígitos)');
            }
          }
          return true;
        }),

      // phonePrefixId solo requerido cuando type === 'phone'
      body('phonePrefixId')
        .if(body('type').equals('phone'))
        .notEmpty()
        .withMessage({
          message: 'phonePrefixId es requerido cuando el tipo es phone',
          hint: 'El identificador debe ser un UUID válido'
        })
        .isUUID()
        .withMessage({ message: 'phonePrefixId debe ser un UUID válido', hint: 'El identificador debe ser un UUID válido' })
    ];
  }

  /** POST /verification/verify-code */
  static verifyCode() {
    return [
      body('type')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El tipo de verificación es requerido', hint: 'Indicá email o phone' })
        .isIn(['email', 'phone'])
        .withMessage({ message: 'Tipo de verificación inválido. Debe ser email o phone', hint: 'Indicá email o phone' }),

      body('contact')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El contacto es requerido', hint: 'Ingresá el email o teléfono a verificar' }),

      body('code')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El código es requerido', hint: 'Ingresá el código que recibiste, entre 4 y 8 caracteres' })
        .isLength({ min: 4, max: 8 })
        .withMessage({
          message: 'El código debe tener entre 4 y 8 caracteres',
          hint: 'Ingresá el código que recibiste, entre 4 y 8 caracteres'
        })
    ];
  }
}

export = SendVerificationValidator;
