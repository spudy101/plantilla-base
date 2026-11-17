import { query } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';

const VALID_OUTCOMES = ['success', 'failure', 'warning', 'attempt'];
const VALID_STATUSES = ['active', 'closed'];
const VALID_SCOPES = ['all', 'login'];

class AdminAuthSessionValidator {
  static listSessions() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.optionalUuidQuery('sessionId', 'El ID de sesión'),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      query('status')
        .optional()
        .isIn(VALID_STATUSES)
        .withMessage({
          message: `status debe ser: ${VALID_STATUSES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_STATUSES.join(', ')}`
        }),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query')
    ];
  }

  static sessionsByUser() {
    return [
      ...BaseValidator.uuidParam('userId', 'userId'),
      ...BaseValidator.pagination(),
      query('status')
        .optional()
        .isIn(VALID_STATUSES)
        .withMessage({
          message: `status debe ser: ${VALID_STATUSES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_STATUSES.join(', ')}`
        })
    ];
  }

  static revokeSession() {
    return [...BaseValidator.uuidParam('sessionId', 'sessionId')];
  }

  static listAttempts() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      query('scope')
        .optional()
        .isIn(VALID_SCOPES)
        .withMessage({
          message: `scope debe ser: ${VALID_SCOPES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_SCOPES.join(', ')}`
        }),
      query('outcome')
        .optional()
        .isIn(VALID_OUTCOMES)
        .withMessage({
          message: `outcome debe ser: ${VALID_OUTCOMES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_OUTCOMES.join(', ')}`
        }),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query')
    ];
  }

  static attemptsByUser() {
    return [
      ...BaseValidator.uuidParam('userId', 'userId'),
      ...BaseValidator.pagination(),
      query('scope')
        .optional()
        .isIn(VALID_SCOPES)
        .withMessage({
          message: `scope debe ser: ${VALID_SCOPES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_SCOPES.join(', ')}`
        }),
      query('outcome')
        .optional()
        .isIn(VALID_OUTCOMES)
        .withMessage({
          message: `outcome debe ser: ${VALID_OUTCOMES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_OUTCOMES.join(', ')}`
        }),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query')
    ];
  }
}

export default AdminAuthSessionValidator;
