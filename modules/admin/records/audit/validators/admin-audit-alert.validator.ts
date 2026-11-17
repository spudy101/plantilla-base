import expressValidatorModule = require('express-validator');
const { query, body } = expressValidatorModule;
import BaseValidator = require('../../../../../shared/validators/base.validator');

class AdminAuditAlertValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.optionalBoolean('acknowledged', 'El estado', 'query'),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query'),
      query('action')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage({ message: 'action no puede superar 100 caracteres', hint: 'Escribí hasta 100 caracteres' }),
      query('category')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage({ message: 'category no puede superar 50 caracteres', hint: 'Escribí hasta 50 caracteres' })
    ];
  }

  static alertId() {
    return [...BaseValidator.uuidParam('alertId', 'El ID de la alerta')];
  }

  static acknowledgeBulk() {
    return [
      body('alertIds').isArray({ min: 1, max: 100 }).withMessage({
        message: 'alertIds debe ser un array de 1 a 100 elementos',
        hint: 'Enviá entre 1 y 100 identificadores en el array'
      }),
      body('alertIds.*').isUUID().withMessage({
        message: 'Cada elemento de alertIds debe ser un UUID válido',
        hint: 'El identificador debe ser un UUID válido'
      })
    ];
  }
}

export = AdminAuditAlertValidator;
