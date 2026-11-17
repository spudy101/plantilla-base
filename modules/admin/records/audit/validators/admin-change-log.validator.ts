import expressValidatorModule = require('express-validator');
const { query } = expressValidatorModule;
import BaseValidator = require('../../../../../shared/validators/base.validator');

class ChangeLogValidator {
  static listUserChangeLogsQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),
      ...BaseValidator.optionalUuidQuery('userId', 'userId'),
      ...BaseValidator.dateRangeQuery('dateFrom', 'dateTo'),

      query('changeType')
        .optional()
        .isIn(['email', 'password', 'mfa_status', 'account_status', 'role', 'national_id'])
        .withMessage({
          message: 'changeType debe ser un tipo válido',
          hint: 'Indicá uno de los valores: email, password, mfa_status, account_status, role, national_id'
        }),

      query('changedByRole').optional().isIn(['admin', 'user', 'system']).withMessage({
        message: 'changedByRole debe ser "admin", "user" o "system"',
        hint: 'Indicá uno de los valores: admin, user, system'
      })
    ];
  }
}

export = ChangeLogValidator;
