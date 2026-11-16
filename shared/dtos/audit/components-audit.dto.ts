// shared/dtos/audit/components-audit.dto.ts
// Componentes reutilizables de auditoría — RF-ADM-03

import MaskingUtil = require('../../utils/masking.util');
import type { DbDate, Maybe, UserRefRow } from '../../types/db-rows';

interface AuditLogRow {
  audit_log_id: string;
  action: string;
  description?: Maybe<string>;
  category?: Maybe<string>;
  module?: Maybe<string>;
  risk?: Maybe<string>;
  outcome?: Maybe<string>;
  http_status?: Maybe<number>;
  error_code?: Maybe<string>;
  error_message?: Maybe<string>;
  user_id?: Maybe<string>;
  session_id?: Maybe<string>;
  executor?: Maybe<UserRefRow>;
  entity_id?: Maybe<string>;
  entity_type?: Maybe<string>;
  entity_table?: Maybe<string>;
  method?: Maybe<string>;
  path?: Maybe<string>;
  ip?: Maybe<string>;
  source?: Maybe<string>;
  correlation_id?: Maybe<string>;
  user_agent?: Maybe<string>;
  fingerprint?: Maybe<string>;
  details?: unknown;
  createdAt?: Maybe<DbDate>;
}

interface AuditAlertRow {
  alert_id: string;
  audit_log_id?: Maybe<string>;
  action: string;
  category?: Maybe<string>;
  risk?: Maybe<string>;
  user_id?: Maybe<string>;
  actor?: Maybe<UserRefRow>;
  entity_id?: Maybe<string>;
  entity_type?: Maybe<string>;
  message?: Maybe<string>;
  acknowledged?: Maybe<boolean>;
  acknowledged_by?: Maybe<string>;
  acknowledgedByUser?: Maybe<UserRefRow>;
  acknowledged_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface ConsentTypeRow {
  consent_type_id: string;
  code: string;
  name?: Maybe<string>;
  description?: Maybe<string>;
  is_mandatory?: Maybe<boolean>;
  is_revocable?: Maybe<boolean>;
  is_active?: Maybe<boolean>;
  scope?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

interface PrivacyPolicyRefRow {
  privacy_policy_id: string;
  version: string;
  document_url?: Maybe<string>;
  effective_date?: Maybe<DbDate>;
}

interface UserConsentRow {
  user_consent_id: string;
  user_id?: Maybe<string>;
  user?: Maybe<UserRefRow>;
  consent_type_id?: Maybe<string>;
  consentType?: Maybe<ConsentTypeRow>;
  privacyPolicy?: Maybe<PrivacyPolicyRefRow>;
  granted_at?: Maybe<DbDate>;
  granted_ip?: Maybe<string>;
  origin_session_id?: Maybe<string>;
  revoked_at?: Maybe<DbDate>;
  revocation_reason?: Maybe<string>;
  is_current?: Maybe<boolean>;
  createdAt?: Maybe<DbDate>;
}

interface NotificationPreferenceRow {
  user_notification_preference_id: string;
  user_id: string;
  notification_category_code?: Maybe<string>;
  allow_push?: Maybe<boolean>;
  allow_email?: Maybe<boolean>;
  allow_sms?: Maybe<boolean>;
  quiet_hours_start?: Maybe<string>;
  quiet_hours_end?: Maybe<string>;
  origin_session_id?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

interface TrustedDeviceTraceRow {
  user_trusted_device_id: string;
  user_id: string;
  device_name?: Maybe<string>;
  device_type?: Maybe<string>;
  browser?: Maybe<string>;
  os?: Maybe<string>;
  status?: Maybe<string>;
  origin_session_id?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
}

/** Variantes de UserConsentComponent que buildArray puede aplicar a cada registro. */
type UserConsentVariant = 'build' | 'buildForClient' | 'buildGranted';

function _buildUserRef(user: Maybe<UserRefRow>) {
  if (!user) {
    return null;
  }
  return {
    userId: user.user_id,
    username: user.username,
    fullName: [user.person?.first_name, user.person?.last_name].filter(Boolean).join(' ') || null
  };
}

class AuditLogComponent {
  static buildList(record: Maybe<AuditLogRow>) {
    if (!record) {
      return null;
    }
    return {
      auditLogId: record.audit_log_id,
      action: record.action,
      description: record.description || null,
      category: record.category || null,
      module: record.module || null,
      risk: record.risk,
      outcome: record.outcome,
      httpStatus: record.http_status || null,
      errorCode: record.error_code || null,
      errorMessage: record.error_message || null,
      userId: record.user_id || null,
      sessionId: record.session_id || null,
      executor: _buildUserRef(record.executor),
      entityId: record.entity_id || null,
      entityType: record.entity_type || null,
      entityTable: record.entity_table || null,
      method: record.method || null,
      path: record.path || null,
      ip: record.ip || null,
      source: record.source,
      createdAt: record.createdAt
    };
  }

  static buildDetail(record: Maybe<AuditLogRow>) {
    if (!record) {
      return null;
    }
    return {
      ...AuditLogComponent.buildList(record),
      httpStatus: record.http_status || null,
      errorCode: record.error_code || null,
      errorMessage: record.error_message || null,
      correlationId: record.correlation_id || null,
      userAgent: record.user_agent || null,
      fingerprint: record.fingerprint || null,
      method: record.method || null,
      path: record.path || null,
      // [RF-USR-01] | CA-06 | `details` es JSONB libre de logAudit: guarda diffs con correos y
      // documentos en claro (p. ej. PERSON_EMAIL_CHANGED) → redactor profundo por key.
      details: MaskingUtil.redactPayload(record.details) || null
    };
  }

  static buildArray(records: Maybe<AuditLogRow[]>) {
    if (!records || records.length === 0) {
      return [];
    }
    return records.map(r => AuditLogComponent.buildList(r));
  }
}

class AuditAlertComponent {
  static build(record: Maybe<AuditAlertRow>) {
    if (!record) {
      return null;
    }
    return {
      alertId: record.alert_id,
      auditLogId: record.audit_log_id || null,
      action: record.action,
      category: record.category || null,
      risk: record.risk,
      userId: record.user_id || null,
      user: _buildUserRef(record.actor),
      entityId: record.entity_id || null,
      entityType: record.entity_type || null,
      message: record.message || null,
      acknowledged: record.acknowledged,
      acknowledgedBy: record.acknowledged_by || null,
      acknowledgedByUser: _buildUserRef(record.acknowledgedByUser),
      acknowledgedAt: record.acknowledged_at || null,
      createdAt: record.createdAt
    };
  }

  static buildArray(records: Maybe<AuditAlertRow[]>) {
    if (!records || records.length === 0) {
      return [];
    }
    return records.map(r => AuditAlertComponent.build(r));
  }
}

// ============================================================
// CONSENT TYPE COMPONENT — RF-ADM-04
// ============================================================

class ConsentTypeComponent {
  static build(consentType: Maybe<ConsentTypeRow>) {
    if (!consentType) {
      return null;
    }
    return {
      consentTypeId: consentType.consent_type_id,
      code: consentType.code,
      name: consentType.name,
      isMandatory: consentType.is_mandatory,
      isRevocable: consentType.is_revocable,
      isActive: consentType.is_active,
      scope: consentType.scope
    };
  }

  static buildDetail(consentType: Maybe<ConsentTypeRow>) {
    if (!consentType) {
      return null;
    }
    return {
      ...ConsentTypeComponent.build(consentType),
      description: consentType.description ?? null,
      createdAt: consentType.createdAt,
      updatedAt: consentType.updatedAt
    };
  }

  static buildList(consentType: Maybe<ConsentTypeRow>) {
    if (!consentType) {
      return null;
    }
    return {
      ...ConsentTypeComponent.build(consentType),
      createdAt: consentType.createdAt
    };
  }
}

// ============================================================
// PRIVACY POLICY REF COMPONENT
// ============================================================

class PrivacyPolicyRefComponent {
  static build(policy: Maybe<PrivacyPolicyRefRow>) {
    if (!policy) {
      return null;
    }
    return {
      privacyPolicyId: policy.privacy_policy_id,
      version: policy.version,
      documentUrl: policy.document_url,
      effectiveDate: policy.effective_date
    };
  }
}

// ============================================================
// USER CONSENT COMPONENT — RF-ADM-04
// ============================================================

class UserConsentComponent {
  static build(record: Maybe<UserConsentRow>) {
    if (!record) {
      return null;
    }
    return {
      userConsentId: record.user_consent_id,
      userId: record.user_id,
      user: _buildUserRef(record.user),
      consentType: ConsentTypeComponent.build(record.consentType),
      privacyPolicy: PrivacyPolicyRefComponent.build(record.privacyPolicy),
      grantedAt: record.granted_at,
      grantedIp: record.granted_ip,
      // Solo variante admin: ata el consentimiento a su sesión de origen (user_sessions / audit_logs).
      // NO se expone en buildForClient/buildGranted/buildClientCatalogItem.
      originSessionId: record.origin_session_id ?? null,
      revokedAt: record.revoked_at ?? null,
      revocationReason: record.revocation_reason ?? null,
      isCurrent: record.is_current,
      createdAt: record.createdAt
    };
  }

  static buildForClient(record: Maybe<UserConsentRow>) {
    if (!record) {
      return null;
    }
    return {
      userConsentId: record.user_consent_id,
      consentType: ConsentTypeComponent.build(record.consentType),
      privacyPolicy: PrivacyPolicyRefComponent.build(record.privacyPolicy),
      grantedAt: record.granted_at,
      revokedAt: record.revoked_at ?? null,
      isCurrent: record.is_current
    };
  }

  static buildGranted(record: Maybe<UserConsentRow>) {
    if (!record) {
      return null;
    }
    return {
      userConsentId: record.user_consent_id,
      consentTypeId: record.consent_type_id,
      grantedAt: record.granted_at,
      isCurrent: record.is_current
    };
  }

  // Item de catálogo para el cliente: un tipo de consentimiento activo + el estado de otorgamiento
  // del usuario. Si no existe otorgamiento vigente (record null), granted=false y los campos de
  // otorgamiento quedan en null.
  static buildClientCatalogItem(consentType: Maybe<ConsentTypeRow>, record: Maybe<UserConsentRow>) {
    if (!consentType) {
      return null;
    }
    return {
      consentType: ConsentTypeComponent.build(consentType),
      granted: Boolean(record),
      userConsentId: record ? record.user_consent_id : null,
      privacyPolicy: record ? PrivacyPolicyRefComponent.build(record.privacyPolicy) : null,
      grantedAt: record ? record.granted_at : null,
      revokedAt: record ? (record.revoked_at ?? null) : null,
      isCurrent: record ? record.is_current : false
    };
  }

  static buildArray(records: Maybe<UserConsentRow[]>, variant: UserConsentVariant = 'build') {
    if (!records || records.length === 0) {
      return [];
    }
    return records.map(r => UserConsentComponent[variant](r));
  }
}

// ============================================================
// SESSION-TRACE ENTITY COMPONENTS — hidratación forense de acciones del usuario
// Componentes livianos que el ENTITY_REGISTRY del session-trace usa para mostrar QUÉ tocó el
// usuario en una sesión. Sin PII (o enmascarada): esta vista NO es self-view.
// ============================================================

class NotificationPreferenceComponent {
  static build(record: Maybe<NotificationPreferenceRow>) {
    if (!record) {
      return null;
    }
    return {
      userNotificationPreferenceId: record.user_notification_preference_id,
      userId: record.user_id,
      // null = preferencia global; con valor = override de esa categoría.
      notificationCategoryCode: record.notification_category_code ?? null,
      allowPush: record.allow_push,
      allowEmail: record.allow_email,
      allowSms: record.allow_sms,
      quietHoursStart: record.quiet_hours_start ?? null,
      quietHoursEnd: record.quiet_hours_end ?? null,
      originSessionId: record.origin_session_id ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}

class TrustedDeviceComponent {
  static build(record: Maybe<TrustedDeviceTraceRow>) {
    if (!record) {
      return null;
    }
    return {
      userTrustedDeviceId: record.user_trusted_device_id,
      userId: record.user_id,
      deviceName: record.device_name ?? null,
      deviceType: record.device_type ?? null,
      browser: record.browser ?? null,
      os: record.os ?? null,
      status: record.status,
      originSessionId: record.origin_session_id ?? null,
      createdAt: record.createdAt
    };
  }
}

export = {
  AuditLogComponent,
  AuditAlertComponent,
  ConsentTypeComponent,
  PrivacyPolicyRefComponent,
  UserConsentComponent,
  NotificationPreferenceComponent,
  TrustedDeviceComponent
};
