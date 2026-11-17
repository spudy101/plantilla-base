import { query } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';

const VALID_STATUSES = ['active', 'closed'];

class AdminSessionTraceValidator {
  static listSessions() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      ...BaseValidator.optionalUuidQuery('sessionId', 'El ID de sesión'),
      query('status')
        .optional()
        .isIn(VALID_STATUSES)
        .withMessage({
          message: `status debe ser: ${VALID_STATUSES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_STATUSES.join(', ')}`
        }),
      query('ip')
        .optional()
        .trim()
        .isLength({ max: 45 })
        .withMessage({ message: 'ip no puede superar 45 caracteres', hint: 'Escribí hasta 45 caracteres' }),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query')
    ];
  }

  static sessionTimeline() {
    return [...BaseValidator.uuidParam('sessionId', 'El ID de sesión'), ...BaseValidator.pagination()];
  }

  static sessionEntities() {
    return [
      ...BaseValidator.uuidParam('sessionId', 'El ID de sesión'),
      query('entityTable')
        .optional()
        .trim()
        .isLength({ max: 150 })
        .withMessage({ message: 'entityTable no puede superar 150 caracteres', hint: 'Escribí hasta 150 caracteres' })
    ];
  }
}

export default AdminSessionTraceValidator;
