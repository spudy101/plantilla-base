// ================================================================
// AUDIT ALERT TRIGGERS
// Acciones que generan una alerta visible en el panel del Superadmin.
// Cambios sensibles en RBAC, usuarios internos, parámetros del sistema,
// seguridad/identidad, auditoría y doble aprobación.
// ================================================================

const AUDIT_ALERT_TRIGGER_ACTIONS = new Set([
  // ── RBAC / Roles ──────────────────────────────────────────────
  'RBAC_PERMISSION_GRANTED',
  'RBAC_PERMISSION_REVOKED',
  'INTERNAL_USER_ROLE_CHANGED',
  'INTERNAL_USER_CREATED',
  'INTERNAL_USER_ACTIVATED',
  'INTERNAL_USER_DEACTIVATED',
  'INTERNAL_USER_SESSIONS_CLOSED',

  // ── Parámetros del sistema ────────────────────────────────────
  'SYSTEM_GLOBAL_CONFIG_UPDATED',

  // ── Impacto sistémico (notificaciones / legal) ────────────────
  'NOTIFICATION_TYPE_UPDATED', // modifica template que llega a todos los usuarios
  'GLOBAL_NOTIFICATION_SENT', // broadcast a todos los usuarios activos
  'PRIVACY_POLICY_VERSION_CREATED', // documento legal de impacto global
  'CONSENT_RECORD_FAILED', // la fila de user_consents no se pudo escribir — la cuenta existe sin constancia

  // ── Conectividad de infraestructura ───────────────────────────
  'REDIS_CONNECTION_LOST', // caída de Redis → modo degradado (impacta controles de seguridad)
  'WORKER_CYCLE_FAILED', // un ciclo de worker/cron explotó — proceso automático no completó

  // ── Seguridad / identidad (ataques y cambios de identidad) ────
  'REFRESH_TOKEN_REUSE_ATTACK', // ataque activo de reuso de refresh token
  'BIOMETRIC_LOGIN_REPLAY_ATTACK', // ataque de replay en login biométrico
  'PERSON_NATIONAL_ID_CHANGED', // cambio de identificación — riesgo de fraude de identidad
  'PERSON_MFA_DISABLED', // admin desactiva MFA de una persona — downgrade de seguridad
  'PERSON_ACCOUNT_DELETED', // eliminación de cuenta de persona

  // ── Auditoría — retención / exfiltración ──────────────────────
  'AUDIT_LOG_EXPORTED', // exportación masiva de auditoría — riesgo de exfiltración
  'AUDIT_LOG_PURGE_EXECUTED', // purga destructiva de registros de auditoría desde BD

  // ── Doble aprobación global (maker-checker) ───────────────────
  'DUAL_APPROVAL_REQUESTED', // operación sensible quedó pendiente de segunda aprobación
  'DUAL_APPROVAL_APPROVED', // checker autorizó — se ejecutó la acción real
  'DUAL_APPROVAL_REJECTED', // checker rechazó la operación pendiente
  'DUAL_APPROVAL_AUTO_APPROVED' // super_admin omitió cuatro ojos por rol — bypass auditado
]);

module.exports = { AUDIT_ALERT_TRIGGER_ACTIONS };
