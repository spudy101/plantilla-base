// ================================================================
// ACTIVIDAD RECIENTE — CLIENT
// Ruta:     modules/client/records/audit/
// Módulo:   client
// Services: user-activity
// ================================================================

import auditCatalogModule = require('./audit-catalog');
const { AUDIT_CATEGORIES, AUDIT_RISKS, AUDIT_MODULES } = auditCatalogModule;

export = {
  RECENT_ACTIVITY_VIEWED: {
    description: 'Feed de actividad reciente del propio usuario consultado',
    category: AUDIT_CATEGORIES.PROFILE,
    module: AUDIT_MODULES.CLIENT,
    risk: AUDIT_RISKS.LOW
  }
};
