import { query } from 'express-validator';
import BaseValidator from '../../../shared/http/base.validator';
import auditactionsModule from '../../../shared/constants/audit-actions';
const { AUDIT_CATEGORIES, AUDIT_RISKS, AUDIT_MODULES } = auditactionsModule;

const CATEGORIES = Object.values(AUDIT_CATEGORIES);
const RISKS = Object.values(AUDIT_RISKS);
const MODULES = Object.values(AUDIT_MODULES);

class AdminAuditActionCatalogValidator {
  static listActionsQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),
      query('category')
        .optional()
        .isIn(CATEGORIES)
        .withMessage({
          message: 'category no es una categoría válida del catálogo',
          hint: `Indicá una de: ${CATEGORIES.join(', ')}`
        }),
      query('risk')
        .optional()
        .isIn(RISKS)
        .withMessage({
          message: `risk debe ser: ${RISKS.join(', ')}`,
          hint: `Indicá uno de los valores: ${RISKS.join(', ')}`
        }),
      query('module')
        .optional()
        .isIn(MODULES)
        .withMessage({
          message: `module debe ser: ${MODULES.join(', ')}`,
          hint: `Indicá uno de los valores: ${MODULES.join(', ')}`
        })
    ];
  }
}

export default AdminAuditActionCatalogValidator;
