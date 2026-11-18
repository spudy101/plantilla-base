// Componentes reutilizables de auditoría — RF-ADM-03

import MaskingUtil from '../../../shared/security/masking.util';
import type { DbDate, Maybe } from '../../../shared/types/db-rows';

/** Usuario adjunto a una fila de auditoría (Prisma): firstName/lastName viven en Person. */
interface AuditUserRow {
  userId: string;
  username?: Maybe<string>;
  person?: Maybe<{ firstName?: Maybe<string>; lastName?: Maybe<string> }>;
}

// Filas de Prisma (camelCase): audit_logs y audit_alerts migraron en la fase 5 (grupo 5).
interface AuditLogRow {
  auditLogId: string;
  action: string;
  description?: Maybe<string>;
  category?: Maybe<string>;
  module?: Maybe<string>;
  risk?: Maybe<string>;
  outcome?: Maybe<string>;
  httpStatus?: Maybe<number>;
  errorCode?: Maybe<string>;
  errorMessage?: Maybe<string>;
  userId?: Maybe<string>;
  sessionId?: Maybe<string>;
  executor?: Maybe<AuditUserRow>;
  entityId?: Maybe<string>;
  entityType?: Maybe<string>;
  entityTable?: Maybe<string>;
  method?: Maybe<string>;
  path?: Maybe<string>;
  ip?: Maybe<string>;
  source?: Maybe<string>;
  correlationId?: Maybe<string>;
  userAgent?: Maybe<string>;
  fingerprint?: Maybe<string>;
  details?: unknown;
  createdAt?: Maybe<DbDate>;
}

interface AuditAlertRow {
  alertId: string;
  auditLogId?: Maybe<string>;
  action: string;
  category?: Maybe<string>;
  risk?: Maybe<string>;
  userId?: Maybe<string>;
  actor?: Maybe<AuditUserRow>;
  entityId?: Maybe<string>;
  entityType?: Maybe<string>;
  message?: Maybe<string>;
  acknowledged?: Maybe<boolean>;
  acknowledgedBy?: Maybe<string>;
  acknowledgedByUser?: Maybe<AuditUserRow>;
  acknowledgedAt?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

// Filas de Prisma (camelCase): consent_types, privacy_policies y user_consents ya migraron (fase 5).
interface ConsentTypeRow {
  consentTypeId: string;
  code: string;
  name?: Maybe<string>;
  description?: Maybe<string>;
  isMandatory?: Maybe<boolean>;
  isRevocable?: Maybe<boolean>;
  isActive?: Maybe<boolean>;
  scope?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

interface PrivacyPolicyRefRow {
  privacyPolicyId: string;
  version: string;
  documentUrl?: Maybe<string>;
  effectiveDate?: Maybe<DbDate>;
}

/** Usuario incluido en un consentimiento (Prisma). El de las filas de auditoría sigue en snake_case. */
interface ConsentUserRow {
  userId: string;
  username?: Maybe<string>;
  person?: Maybe<{ firstName?: Maybe<string>; lastName?: Maybe<string> }>;
}

interface UserConsentRow {
  userConsentId: string;
  userId?: Maybe<string>;
  user?: Maybe<ConsentUserRow>;
  consentTypeId?: Maybe<string>;
  consentType?: Maybe<ConsentTypeRow>;
  privacyPolicy?: Maybe<PrivacyPolicyRefRow>;
  grantedAt?: Maybe<DbDate>;
  grantedIp?: Maybe<string>;
  originSessionId?: Maybe<string>;
  revokedAt?: Maybe<DbDate>;
  revocationReason?: Maybe<string>;
  isCurrent?: Maybe<boolean>;
  createdAt?: Maybe<DbDate>;
}

/** Fila de Prisma (fase 5, grupo 3); el horario de no molestar llega como 'HH:MM:SS'. */
interface NotificationPreferenceRow {
  userNotificationPreferenceId: string;
  userId: string;
  notificationCategoryCode?: Maybe<string>;
  allowPush?: Maybe<boolean>;
  allowEmail?: Maybe<boolean>;
  allowSms?: Maybe<boolean>;
  quietHoursStart?: Maybe<string>;
  quietHoursEnd?: Maybe<string>;
  originSessionId?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

interface TrustedDeviceTraceRow {
  userTrustedDeviceId: string;
  userId: string;
  deviceName?: Maybe<string>;
  deviceType?: Maybe<string>;
  browser?: Maybe<string>;
  os?: Maybe<string>;
  status?: Maybe<string>;
  originSessionId?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
}

/** Variantes de UserConsentComponent que buildArray puede aplicar a cada registro. */
type UserConsentVariant = 'build' | 'buildForClient' | 'buildGranted';

function _buildUserRef(user: Maybe<AuditUserRow | ConsentUserRow>) {
  if (!user) {
    return null;
  }
  return {
    userId: user.userId,
    username: user.username,
    fullName: [user.person?.firstName, user.person?.lastName].filter(Boolean).join(' ') || null
  };
}

class AuditLogComponent {
  static buildList(record: Maybe<AuditLogRow>) {
    if (!record) {
      return null;
    }
    return {
      auditLogId: record.auditLogId,
      action: record.action,
      description: record.description || null,
      category: record.category || null,
      module: record.module || null,
      risk: record.risk,
      outcome: record.outcome,
      userId: record.userId || null,
      sessionId: record.sessionId || null,
      executor: _buildUserRef(record.executor),
      entityId: record.entityId || null,
      entityType: record.entityType || null,
      entityTable: record.entityTable || null,
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
      correlationId: record.correlationId || null,
      userAgent: record.userAgent || null,
      fingerprint: record.fingerprint || null,
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
      alertId: record.alertId,
      auditLogId: record.auditLogId || null,
      action: record.action,
      category: record.category || null,
      risk: record.risk,
      userId: record.userId || null,
      user: _buildUserRef(record.actor),
      entityId: record.entityId || null,
      entityType: record.entityType || null,
      message: record.message || null,
      acknowledged: record.acknowledged,
      acknowledgedBy: record.acknowledgedBy || null,
      acknowledgedByUser: _buildUserRef(record.acknowledgedByUser),
      acknowledgedAt: record.acknowledgedAt || null,
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
      consentTypeId: consentType.consentTypeId,
      code: consentType.code,
      name: consentType.name,
      isMandatory: consentType.isMandatory,
      isRevocable: consentType.isRevocable,
      isActive: consentType.isActive,
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
      privacyPolicyId: policy.privacyPolicyId,
      version: policy.version,
      documentUrl: policy.documentUrl,
      effectiveDate: policy.effectiveDate
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
      userConsentId: record.userConsentId,
      userId: record.userId,
      user: _buildUserRef(record.user),
      consentType: ConsentTypeComponent.build(record.consentType),
      privacyPolicy: PrivacyPolicyRefComponent.build(record.privacyPolicy),
      grantedAt: record.grantedAt,
      grantedIp: record.grantedIp,
      // Solo variante admin: ata el consentimiento a su sesión de origen (user_sessions / audit_logs).
      // NO se expone en buildForClient/buildGranted/buildClientCatalogItem.
      originSessionId: record.originSessionId ?? null,
      revokedAt: record.revokedAt ?? null,
      revocationReason: record.revocationReason ?? null,
      isCurrent: record.isCurrent,
      createdAt: record.createdAt
    };
  }

  static buildForClient(record: Maybe<UserConsentRow>) {
    if (!record) {
      return null;
    }
    return {
      userConsentId: record.userConsentId,
      consentType: ConsentTypeComponent.build(record.consentType),
      privacyPolicy: PrivacyPolicyRefComponent.build(record.privacyPolicy),
      grantedAt: record.grantedAt,
      revokedAt: record.revokedAt ?? null,
      isCurrent: record.isCurrent
    };
  }

  static buildGranted(record: Maybe<UserConsentRow>) {
    if (!record) {
      return null;
    }
    return {
      userConsentId: record.userConsentId,
      consentTypeId: record.consentTypeId,
      grantedAt: record.grantedAt,
      isCurrent: record.isCurrent
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
      userConsentId: record ? record.userConsentId : null,
      privacyPolicy: record ? PrivacyPolicyRefComponent.build(record.privacyPolicy) : null,
      grantedAt: record ? record.grantedAt : null,
      revokedAt: record ? (record.revokedAt ?? null) : null,
      isCurrent: record ? record.isCurrent : false
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
      userNotificationPreferenceId: record.userNotificationPreferenceId,
      userId: record.userId,
      // null = preferencia global; con valor = override de esa categoría.
      notificationCategoryCode: record.notificationCategoryCode ?? null,
      allowPush: record.allowPush,
      allowEmail: record.allowEmail,
      allowSms: record.allowSms,
      quietHoursStart: record.quietHoursStart ?? null,
      quietHoursEnd: record.quietHoursEnd ?? null,
      originSessionId: record.originSessionId ?? null,
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
      userTrustedDeviceId: record.userTrustedDeviceId,
      userId: record.userId,
      deviceName: record.deviceName ?? null,
      deviceType: record.deviceType ?? null,
      browser: record.browser ?? null,
      os: record.os ?? null,
      status: record.status,
      originSessionId: record.originSessionId ?? null,
      createdAt: record.createdAt
    };
  }
}

export default {
  AuditLogComponent,
  AuditAlertComponent,
  ConsentTypeComponent,
  PrivacyPolicyRefComponent,
  UserConsentComponent,
  NotificationPreferenceComponent,
  TrustedDeviceComponent
};
