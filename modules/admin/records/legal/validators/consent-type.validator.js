const { body } = require('express-validator');
const BaseValidator = require('../../../../../shared/validators/base.validator');

class ConsentTypeValidator {
  static listQuery() {
    return [...BaseValidator.pagination(), ...BaseValidator.searchQuery()];
  }

  static create() {
    return [
      body('code')
        .notEmpty()
        .withMessage({
          message: 'El código es requerido',
          hint: 'Usá solo letras mayúsculas y guiones bajos (ej: TERMS_AND_CONDITIONS)'
        })
        .isString()
        .trim()
        .toUpperCase()
        .matches(/^[A-Z_]+$/)
        .withMessage({
          message: 'El código solo puede contener letras mayúsculas y guiones bajos',
          hint: 'Usá solo letras mayúsculas y guiones bajos (ej: TERMS_AND_CONDITIONS)'
        }),
      body('name')
        .notEmpty()
        .withMessage({
          message: 'El nombre es requerido',
          hint: 'Usá hasta 200 caracteres'
        })
        .trim()
        .isLength({ max: 200 }),
      body('description').optional({ nullable: true }).isString().trim(),
      ...BaseValidator.optionalBoolean('isMandatory', 'El indicador de obligatoriedad'),
      ...BaseValidator.optionalBoolean('isRevocable', 'El indicador de revocabilidad')
    ];
  }

  static update() {
    return [
      ...BaseValidator.uuidParam('consentTypeId', 'El ID de tipo de consentimiento'),
      body('name').optional().isString().trim().isLength({ max: 200 }),
      body('description').optional({ nullable: true }).isString().trim(),
      ...BaseValidator.optionalBoolean('isActive', 'El estado')
    ];
  }

  static idParam() {
    return [...BaseValidator.uuidParam('consentTypeId', 'El ID de tipo de consentimiento')];
  }
}

module.exports = ConsentTypeValidator;
