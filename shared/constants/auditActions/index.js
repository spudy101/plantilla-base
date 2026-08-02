// ================================================================
// AUDIT ACTIONS — Registro central
// Todos los módulos se unen aquí via spread.
// Agregar cada nuevo archivo de módulo en este index.
// ================================================================

const AUDIT_ACTIONS = {
  ...require('./audit-actions.system'),
  ...require('./audit-actions.kyc-shared'),
  ...require('./audit-actions.kyc-client'),
  ...require('./audit-actions.kyc-admin'),
  ...require('./audit-actions.kyc-system'),
  ...require('./audit-actions.iam-admin'),
  ...require('./audit-actions.audit-admin'),
  ...require('./audit-actions.audit-system'),
  ...require('./audit-actions.approvals-admin'),
  ...require('./audit-actions.approvals-system'),
  ...require('./audit-actions.notification-shared'),
  ...require('./audit-actions.activity-client'),
  ...require('./audit-actions.promotional')
};

const { AUDIT_ALERT_TRIGGER_ACTIONS } = require('./audit-alert-triggers');

// Catálogo canónico (fuente de verdad de category/risk/module). Toda acción
// de AUDIT_ACTIONS usa estos valores — homologación garantizada por el test
// audit-catalog.consistency. Lo consume la API /api/audit-action-catalog/*.
const {
  AUDIT_CATEGORIES,
  AUDIT_RISKS,
  AUDIT_RISK_ORDER,
  AUDIT_MODULES,
  AUDIT_OUTCOMES,
  AUDIT_SOURCES
} = require('./audit-catalog');

// Mensaje de log compartido (no es una acción de auditoría) — se expone como export
// nombrado hermano de AUDIT_ACTIONS para NO contaminar el registro de acciones.
// Usado por los middlewares que aplican el gate de 2FA: rbac, auth.
const MFA_NOT_ACTIVE_LOG_MSG = 'Acción bloqueada — 2FA no activo';

module.exports = {
  AUDIT_ACTIONS,
  AUDIT_ALERT_TRIGGER_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_RISKS,
  AUDIT_RISK_ORDER,
  AUDIT_MODULES,
  AUDIT_OUTCOMES,
  AUDIT_SOURCES,
  MFA_NOT_ACTIVE_LOG_MSG
};
