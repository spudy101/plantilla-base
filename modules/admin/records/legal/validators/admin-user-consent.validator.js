const { query } = require('express-validator');
const BaseValidator = require('../../../../../shared/validators/base.validator');

class AdminUserConsentValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      query('consentTypeCode').optional().isString().trim().toUpperCase().withMessage({
        message: 'consentTypeCode debe ser texto',
        hint: 'Ingresá el código del tipo de consentimiento como texto'
      }),
      query('isCurrent')
        .optional()
        .isBoolean()
        .withMessage({ message: 'isCurrent debe ser true o false', hint: 'Ingresá true o false' }),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query')
    ];
  }

  static userId() {
    return [...BaseValidator.uuidParam('userId', 'El ID de usuario'), ...BaseValidator.pagination()];
  }
}

module.exports = AdminUserConsentValidator;
