import expressValidatorModule = require('express-validator');
const { body } = expressValidatorModule;
import BaseValidator = require('../../../../../shared/validators/base.validator');

/**
 * ============================================================
 * PROFILE VALIDATOR — CLIENT
 * ============================================================
 * Compone reglas desde BaseValidator — nunca duplicar reglas aquí.
 */

class ProfileValidator {
  /** PUT /profile */
  static updateProfile() {
    return [
      body().custom(value => {
        const allowed = ['username', 'avatarId', 'genderId', 'location', 'birthDate'];
        const hasAny = allowed.some(f =>
          f === 'location' ? value[f] && Object.keys(value[f]).length > 0 : value[f] !== undefined
        );
        if (!hasAny) {
          throw new Error('Debe enviar al menos un campo para actualizar el perfil');
        }
        return true;
      }),

      body('username')
        .optional()
        .trim()
        .isString()
        .withMessage({
          message: 'El username debe ser una cadena de texto',
          hint: 'Usá entre 3 y 30 caracteres: letras, números y guiones bajos'
        })
        .isLength({ min: 3, max: 30 })
        .withMessage({
          message: 'El username debe tener entre 3 y 30 caracteres',
          hint: 'Usá entre 3 y 30 caracteres: letras, números y guiones bajos'
        })
        .matches(/^\w+$/)
        .withMessage({
          message: 'El username solo puede contener letras, números y guiones bajos',
          hint: 'Usá entre 3 y 30 caracteres: letras, números y guiones bajos'
        }),

      ...BaseValidator.optionalUuidBody('avatarId', 'El avatar'),
      ...BaseValidator.optionalUuidBody('genderId', 'El género'),

      body('location')
        .optional()
        .custom(location => {
          const required = ['departmentId', 'cityId', 'address'];
          const missing = required.filter(f => !location[f]);
          if (missing.length > 0) {
            throw new Error(`Si envía location, los siguientes campos son obligatorios: ${missing.join(', ')}`);
          }
          return true;
        }),

      body('location.departmentId')
        .if(body('location').exists())
        .optional({ nullable: true })
        .isUUID()
        .withMessage({ message: 'El departamento debe ser un UUID válido', hint: 'El identificador debe ser un UUID válido' }),

      body('location.cityId')
        .if(body('location').exists())
        .optional({ nullable: true })
        .isUUID()
        .withMessage({ message: 'La ciudad debe ser un UUID válido', hint: 'El identificador debe ser un UUID válido' }),

      body('location.address')
        .if(body('location').exists())
        .trim()
        .notEmpty()
        .withMessage({ message: 'La dirección es requerida', hint: 'Ingresá una dirección de entre 5 y 150 caracteres' })
        .isLength({ min: 5, max: 150 })
        .withMessage({
          message: 'La dirección debe tener entre 5 y 150 caracteres',
          hint: 'Ingresá una dirección de entre 5 y 150 caracteres'
        }),

      body('location.postalCode')
        .if(body('location').exists())
        .optional({ nullable: true })
        .trim()
        .matches(/^\d{4,10}$/)
        .withMessage({
          message: 'El código postal debe contener entre 4 y 10 dígitos',
          hint: 'Ingresá un código postal de 4 a 10 dígitos'
        }),

      body('location.type')
        .if(body('location').exists())
        .optional()
        .isString()
        .withMessage({
          message: 'El tipo de vivienda debe ser una cadena de texto',
          hint: 'Ingresá el tipo de vivienda, máximo 40 caracteres'
        })
        .isLength({ max: 40 })
        .withMessage({
          message: 'El tipo de vivienda no puede exceder 40 caracteres',
          hint: 'Ingresá el tipo de vivienda, máximo 40 caracteres'
        }),

      ...BaseValidator.optionalBirthDate('birthDate')
    ];
  }

  /** PUT /profile/email */
  static updateEmail() {
    return [
      ...BaseValidator.email(),
      body('currentPassword')
        .notEmpty()
        .withMessage({ message: 'La contraseña actual es requerida', hint: 'Ingresá tu contraseña actual' })
        .isString()
        .withMessage({ message: 'La contraseña debe ser una cadena de texto', hint: 'Ingresá tu contraseña actual' })
    ];
  }

  /** PUT /profile/phone */
  static updatePhone() {
    return [
      ...BaseValidator.phone('newPhone', 'El teléfono'),
      ...BaseValidator.uuidBody('phonePrefixId', 'El prefijo telefónico'),

      body('phoneType')
        .notEmpty()
        .withMessage({ message: 'El tipo de teléfono es requerido', hint: 'Indicá primary o secondary' })
        .isIn(['primary', 'secondary'])
        .withMessage({ message: 'El tipo debe ser "primary" o "secondary"', hint: 'Indicá primary o secondary' })
    ];
  }

  /** PUT /profile/password */
  static updatePassword() {
    return [
      body('currentPassword')
        .notEmpty()
        .withMessage({ message: 'La contraseña actual es requerida', hint: 'Ingresá tu contraseña actual' })
        .isString()
        .withMessage({ message: 'La contraseña debe ser una cadena de texto', hint: 'Ingresá tu contraseña actual' }),
      ...BaseValidator.newPassword()
    ];
  }

  /** PUT /profile/names */
  static updateNames() {
    return [
      ...BaseValidator.firstName('firstName'),
      ...BaseValidator.optionalMiddleName('middleName'),
      ...BaseValidator.lastName('lastName'),
      ...BaseValidator.optionalSecondLastName('secondLastName')
    ];
  }

  /** DELETE /profile/delete-account */
  static deleteAccount() {
    return [
      body('currentPassword')
        .notEmpty()
        .withMessage({ message: 'La contraseña actual es requerida', hint: 'Ingresá tu contraseña actual' })
        .isString()
        .withMessage({ message: 'La contraseña debe ser una cadena de texto', hint: 'Ingresá tu contraseña actual' })
    ];
  }
}

export = ProfileValidator;
