import { query } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';
import auditactionsModule from '../../../../../shared/constants/audit-actions';
const {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_RISKS,
  AUDIT_MODULES,
  AUDIT_OUTCOMES,
  AUDIT_SOURCES
} = auditactionsModule;

// Valores homologados del catálogo canónico — el filtro acepta solo lo que el
// sistema realmente persiste en audit_logs (no strings libres).
const ACTIONS = Object.keys(AUDIT_ACTIONS);
const CATEGORIES = Object.values(AUDIT_CATEGORIES);
// Los logs pueden tener risk='unknown' (fallback de logAudit para acciones fuera
// de catálogo) — valor que NO existe en el catálogo de acciones, se suma SOLO para
// el filtro de logs.
const RISKS = [...Object.values(AUDIT_RISKS), 'unknown'];
const MODULES = Object.values(AUDIT_MODULES);
const OUTCOMES = Object.values(AUDIT_OUTCOMES);
const SOURCES = Object.values(AUDIT_SOURCES);

class AdminAuditLogValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.optionalIsoDate('dateFrom', 'dateFrom', 'query'),
      ...BaseValidator.optionalIsoDate('dateTo', 'dateTo', 'query'),
      query('action').optional().trim().isIn(ACTIONS).withMessage({
        message: 'action no es una acción válida del catálogo',
        hint: 'Consultá las acciones válidas en GET /api/audit-action-catalog/actions'
      }),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      ...BaseValidator.optionalUuidQuery('sessionId', 'El ID de sesión'),
      query('category')
        .optional()
        .isIn(CATEGORIES)
        .withMessage({
          message: 'category no es una categoría válida del catálogo',
          hint: `Indicá una de: ${CATEGORIES.join(', ')}`
        }),
      query('outcome')
        .optional()
        .isIn(OUTCOMES)
        .withMessage({
          message: `outcome debe ser: ${OUTCOMES.join(', ')}`,
          hint: `Indicá uno de los valores: ${OUTCOMES.join(', ')}`
        }),
      query('risk')
        .optional()
        .isIn(RISKS)
        .withMessage({
          message: `risk debe ser: ${RISKS.join(', ')}`,
          hint: `Indicá uno de los valores: ${RISKS.join(', ')}`
        }),
      query('ip')
        .optional()
        .trim()
        .isLength({ max: 45 })
        .withMessage({ message: 'ip no puede superar 45 caracteres', hint: 'Escribí hasta 45 caracteres' }),
      query('correlationId')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage({ message: 'correlationId no puede superar 100 caracteres', hint: 'Escribí hasta 100 caracteres' }),
      query('entityId')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage({ message: 'entityId no puede superar 255 caracteres', hint: 'Escribí hasta 255 caracteres' }),
      query('entityType')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage({ message: 'entityType no puede superar 100 caracteres', hint: 'Escribí hasta 100 caracteres' }),
      query('source')
        .optional()
        .isIn(SOURCES)
        .withMessage({
          message: `source debe ser: ${SOURCES.join(', ')}`,
          hint: `Indicá uno de los valores: ${SOURCES.join(', ')}`
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

  static exportQuery() {
    return [
      ...AdminAuditLogValidator.listQuery(),
      query('format')
        .optional()
        .isIn(['csv', 'xlsx'])
        .withMessage({ message: 'format debe ser csv o xlsx', hint: 'Indicá uno de los valores: csv, xlsx' })
    ];
  }

  static auditLogId() {
    return [...BaseValidator.uuidParam('auditLogId', 'El ID del log de auditoría')];
  }
}

export default AdminAuditLogValidator;
