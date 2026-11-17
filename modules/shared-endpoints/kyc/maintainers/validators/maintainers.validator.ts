import { query } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';

/**
 * ============================================================
 * MAINTAINERS VALIDATOR — PUBLIC
 * ============================================================
 * Compone desde BaseValidator para los filtros comunes.
 * Los filtros específicos de maintainers (isActive, countryId, etc.)
 * no están en BaseValidator porque son query params de catálogo.
 */

class MaintainersValidator {
  static paginationQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),

      ...BaseValidator.optionalBoolean('isActive', 'isActive', 'query'),

      ...BaseValidator.optionalUuidQuery('countryId', 'countryId'),

      ...BaseValidator.optionalUuidQuery('themeId', 'themeId'),

      ...BaseValidator.optionalUuidQuery('departmentId', 'departmentId'),

      query('priority')
        .optional()
        .isString()
        .withMessage({ message: 'priority debe ser un string', hint: 'Ingresá la prioridad como texto' })
    ];
  }
}

export default MaintainersValidator;
