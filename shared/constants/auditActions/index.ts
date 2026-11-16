// ================================================================
// AUDIT ACTIONS — Registro central
// Todos los módulos se unen aquí via spread.
// Agregar cada nuevo archivo de módulo en este index.
// ================================================================

import systemActions = require('./audit-actions.system');
import kycSharedActions = require('./audit-actions.kyc-shared');
import kycClientActions = require('./audit-actions.kyc-client');
import kycAdminActions = require('./audit-actions.kyc-admin');
import kycSystemActions = require('./audit-actions.kyc-system');
import iamAdminActions = require('./audit-actions.iam-admin');
import auditAdminActions = require('./audit-actions.audit-admin');
import auditSystemActions = require('./audit-actions.audit-system');
import approvalsAdminActions = require('./audit-actions.approvals-admin');
import approvalsSystemActions = require('./audit-actions.approvals-system');
import notificationSharedActions = require('./audit-actions.notification-shared');
import activityClientActions = require('./audit-actions.activity-client');
import promotionalActions = require('./audit-actions.promotional');

const AUDIT_ACTIONS = {
  ...systemActions,
  ...kycSharedActions,
  ...kycClientActions,
  ...kycAdminActions,
  ...kycSystemActions,
  ...iamAdminActions,
  ...auditAdminActions,
  ...auditSystemActions,
  ...approvalsAdminActions,
  ...approvalsSystemActions,
  ...notificationSharedActions,
  ...activityClientActions,
  ...promotionalActions
};

import auditAlertTriggersModule = require('./audit-alert-triggers');
const { AUDIT_ALERT_TRIGGER_ACTIONS } = auditAlertTriggersModule;

// Catálogo canónico (fuente de verdad de category/risk/module). Toda acción
// de AUDIT_ACTIONS usa estos valores — homologación garantizada por el test
// audit-catalog.consistency. Lo consume la API /api/audit-action-catalog/*.
import auditCatalogModule = require('./audit-catalog');
const {
  AUDIT_CATEGORIES,
  AUDIT_RISKS,
  AUDIT_RISK_ORDER,
  AUDIT_MODULES,
  AUDIT_OUTCOMES,
  AUDIT_SOURCES
} = auditCatalogModule;

// Mensaje de log compartido (no es una acción de auditoría) — se expone como export
// nombrado hermano de AUDIT_ACTIONS para NO contaminar el registro de acciones.
// Usado por los middlewares que aplican el gate de 2FA: rbac, auth.
const MFA_NOT_ACTIVE_LOG_MSG = 'Acción bloqueada — 2FA no activo';

export = {
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
