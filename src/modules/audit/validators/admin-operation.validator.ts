import { query } from 'express-validator';
import BaseValidator from '../../../shared/http/base.validator';

const SOURCES = ['http', 'webhook', 'worker', 'system'];
const STATUSES = ['running', 'success', 'failure'];
const MAX_NAME = 255;

const oneOf = (field: string, values: string[]) =>
  query(field)
    .optional()
    .isIn(values)
    .withMessage({ message: `${field} debe ser: ${values.join(', ')}`, hint: `Indicá uno de: ${values.join(', ')}` });

class AdminOperationValidator {
  static list() {
    return [
      ...BaseValidator.pagination(),
      oneOf('source', SOURCES),
      oneOf('status', STATUSES),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      query('name')
        .optional()
        .trim()
        .isLength({ max: MAX_NAME })
        .withMessage({ message: `name no puede superar ${MAX_NAME} caracteres`, hint: 'Usá parte del nombre de la ruta o del worker' }),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query')
    ];
  }

  static timeline() {
    return [...BaseValidator.uuidParam('operationId', 'El ID de la operación')];
  }
}

export default AdminOperationValidator;
