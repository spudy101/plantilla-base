// ================================================================
// AUDIT ACTIONS — Registro central
// Todos los módulos se unen aquí via spread.
// Agregar cada nuevo archivo de módulo en este index.
// ================================================================

import systemActions from './audit-actions.system';
import kycSharedActions from './audit-actions.kyc-shared';
import kycClientActions from './audit-actions.kyc-client';
import kycAdminActions from './audit-actions.kyc-admin';
import kycSystemActions from './audit-actions.kyc-system';
import iamAdminActions from './audit-actions.iam-admin';
import auditAdminActions from './audit-actions.audit-admin';
import auditSystemActions from './audit-actions.audit-system';
import approvalsAdminActions from './audit-actions.approvals-admin';
import approvalsSystemActions from './audit-actions.approvals-system';
import notificationSharedActions from './audit-actions.notification-shared';
import activityClientActions from './audit-actions.activity-client';
import promotionalActions from './audit-actions.promotional';

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

import auditAlertTriggersModule from './audit-alert-triggers';
const { AUDIT_ALERT_TRIGGER_ACTIONS } = auditAlertTriggersModule;

// Catálogo canónico (fuente de verdad de category/risk/module). Toda acción
// de AUDIT_ACTIONS usa estos valores — homologación garantizada por el test
// audit-catalog.consistency. Lo consume la API /api/audit-action-catalog/*.
import auditCatalogModule from './audit-catalog';
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

export default {
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
