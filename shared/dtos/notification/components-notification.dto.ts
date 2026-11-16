/**
 * ============================================================
 * SHARED COMPONENTS DTO — NOTIFICACIONES
 * ============================================================
 * Bloques reutilizables para el módulo de notificaciones.
 * Usado tanto en client como en admin — nunca duplicar estos bloques.
 *
 * Convención de PKs: se mapean al nombre real de la BD en camelCase.
 *   notification_type.notification_type_id         → notificationTypeId
 *   notification.notification_id                   → notificationId
 *   global_notification.global_notification_id     → globalNotificationId
 *   global_notification_read — PK compuesta        → { globalNotificationId, userId }
 *   user_push_token.user_push_token_id             → userPushTokenId
 *   user_notification_preference.user_notification_preference_id → userNotificationPreferenceId
 *
 * Aliases esperados en Sequelize (deben coincidir con el `as:` del modelo):
 *   notification.notification_type        (NotificationType)
 *   globalNotification.notification_type  (NotificationType)
 *   globalNotification.creator            (User — solo en admin)
 */

import MaskingUtil = require('../../utils/masking.util');
import type { DbDate, Maybe } from '../../types/db-rows';

/** Objeto de salida con campos opcionales que se agregan según las opciones de build. */
type Dto = Record<string, unknown>;

interface NotificationCategoryRow {
  notification_category_id: string;
  code: string;
  name?: Maybe<string>;
  description?: Maybe<string>;
  supports_push?: Maybe<boolean>;
  supports_email?: Maybe<boolean>;
  supports_sms?: Maybe<boolean>;
  allow_dnd?: Maybe<boolean>;
  is_critical?: Maybe<boolean>;
  default_quiet_hours_start?: Maybe<string>;
  default_quiet_hours_end?: Maybe<string>;
  priority?: Maybe<string | number>;
  sort_order?: Maybe<number>;
  is_active?: Maybe<boolean>;
  email_layout_template?: Maybe<string>;
}

interface NotificationTypeRow {
  notification_type_id: string;
  code: string;
  name?: Maybe<string>;
  description?: Maybe<string>;
  notification_category_id?: Maybe<string>;
  priority?: Maybe<string | number>;
  is_active?: Maybe<boolean>;
  category?: Maybe<NotificationCategoryRow>;
  title_template?: Maybe<string>;
  body_template?: Maybe<string>;
  email_subject_template?: Maybe<string>;
  email_body_template?: Maybe<string>;
}

interface NotificationRow {
  notification_id: string;
  user_id: string;
  notification_type_id?: Maybe<string>;
  title?: Maybe<string>;
  body?: Maybe<string>;
  related_entity_type?: Maybe<string>;
  related_entity_id?: Maybe<string>;
  metadata?: unknown;
  is_read?: Maybe<boolean>;
  read_at?: Maybe<DbDate>;
  processing_status?: Maybe<string>;
  scheduled_for?: Maybe<DbDate>;
  priority?: Maybe<string | number>;
  createdAt?: Maybe<DbDate>;
  notification_type?: Maybe<NotificationTypeRow>;
  push_sent?: Maybe<boolean>;
  push_sent_at?: Maybe<DbDate>;
  push_error?: Maybe<string>;
  push_retry_count?: Maybe<number>;
  push_next_retry_at?: Maybe<DbDate>;
  email_sent?: Maybe<boolean>;
  email_sent_at?: Maybe<DbDate>;
  email_error?: Maybe<string>;
  email_retry_count?: Maybe<number>;
  email_next_retry_at?: Maybe<DbDate>;
}

interface GlobalNotificationRow {
  global_notification_id: string;
  notification_type_id?: Maybe<string>;
  title?: Maybe<string>;
  body?: Maybe<string>;
  metadata?: unknown;
  send_push?: Maybe<boolean>;
  send_email?: Maybe<boolean>;
  send_in_app?: Maybe<boolean>;
  is_active?: Maybe<boolean>;
  starts_at?: Maybe<DbDate>;
  ends_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
  notification_type?: Maybe<NotificationTypeRow>;
  total_target_users?: Maybe<number>;
  push_sent_count?: Maybe<number>;
  email_sent_count?: Maybe<number>;
  push_processing_status?: Maybe<string>;
  email_processing_status?: Maybe<string>;
  processing_started_at?: Maybe<DbDate>;
  processing_completed_at?: Maybe<DbDate>;
  batch_size?: Maybe<number>;
  target_user_role?: Maybe<string>;
  target_conditions?: unknown;
  created_by?: Maybe<string>;
}

interface GlobalNotificationReadRow {
  global_notification_id: string;
  user_id: string;
  read_at?: Maybe<DbDate>;
}

interface UserPushTokenRow {
  user_push_token_id: string;
  user_id: string;
  token: string;
  platform?: Maybe<string>;
  device_id?: Maybe<string>;
  is_active?: Maybe<boolean>;
  last_used_at?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface UserNotificationPreferenceRow {
  user_notification_preference_id: string;
  user_id: string;
  notification_category_code?: Maybe<string>;
  allow_push?: Maybe<boolean>;
  allow_email?: Maybe<boolean>;
  allow_sms?: Maybe<boolean>;
  quiet_hours_start?: Maybe<string>;
  quiet_hours_end?: Maybe<string>;
  notification_category?: Maybe<NotificationCategoryRow>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

interface NotificationBuildOptions {
  includeType?: boolean;
  includeDelivery?: boolean;
}

interface GlobalNotificationBuildOptions {
  includeType?: boolean;
  includeStats?: boolean;
  includeTargeting?: boolean;
  /** Si viene (true/false), se marca si el usuario actual ya la leyó. */
  isRead?: boolean | null;
}

// ============================================================
// NOTIFICATION CATEGORY
// ============================================================

class NotificationCategoryComponent {
  /**
   * @param {Object} category - Instancia de NotificationCategory
   * @param {boolean} includeLayout - Incluir el email_layout_template (solo admin/edición)
   */
  static build(category: Maybe<NotificationCategoryRow>, includeLayout = false) {
    if (!category) {
      return null;
    }

    const dto: Dto = {
      notificationCategoryId: category.notification_category_id,
      code: category.code,
      name: category.name,
      description: category.description || null,
      supportsPush: category.supports_push,
      supportsEmail: category.supports_email,
      supportsSms: category.supports_sms,
      allowDnd: category.allow_dnd,
      isCritical: category.is_critical,
      defaultQuietHoursStart: category.default_quiet_hours_start || null,
      defaultQuietHoursEnd: category.default_quiet_hours_end || null,
      priority: category.priority,
      sortOrder: category.sort_order,
      isActive: category.is_active
    };

    if (includeLayout) {
      dto.emailLayoutTemplate = category.email_layout_template || null;
    }

    return dto;
  }

  static buildArray(categories: Maybe<NotificationCategoryRow[]>, includeLayout = false) {
    if (!categories || categories.length === 0) {
      return [];
    }
    return categories.map(c => NotificationCategoryComponent.build(c, includeLayout));
  }
}

// ============================================================
// NOTIFICATION TYPE
// ============================================================

class NotificationTypeComponent {
  /**
   * @param {Object} notificationType - Instancia de NotificationType
   * @param {boolean} includeTemplates - Incluir campos de plantilla (title/body/email templates)
   */
  static build(notificationType: Maybe<NotificationTypeRow>, includeTemplates = false) {
    if (!notificationType) {
      return null;
    }

    const dto: Dto = {
      notificationTypeId: notificationType.notification_type_id,
      code: notificationType.code,
      name: notificationType.name,
      description: notificationType.description || null,
      notificationCategoryId: notificationType.notification_category_id || null,
      priority: notificationType.priority,
      isActive: notificationType.is_active
    };

    // La categoría (canales/DND/criticidad) se expone si viene incluida en la asociación.
    if (notificationType.category) {
      dto.category = NotificationCategoryComponent.build(notificationType.category);
    }

    if (includeTemplates) {
      dto.titleTemplate = notificationType.title_template;
      dto.bodyTemplate = notificationType.body_template;
      dto.emailSubjectTemplate = notificationType.email_subject_template || null;
      dto.emailBodyTemplate = notificationType.email_body_template || null;
    }

    return dto;
  }
}

// ============================================================
// NOTIFICATION
// ============================================================

class NotificationComponent {
  /**
   * @param {Object} notification - Instancia de Notification
   * @param {Object} [options]
   * @param {boolean} [options.includeType]        - Incluir asociación notificationType
   * @param {boolean} [options.includeDelivery]    - Incluir campos de estado push/email (para admin)
   *
   * Aliases esperados:
   *   notification.notification_type  (NotificationType)
   */
  static build(notification: Maybe<NotificationRow>, options: NotificationBuildOptions = {}) {
    if (!notification) {
      return null;
    }

    const { includeType = false, includeDelivery = false } = options;

    const dto: Dto = {
      notificationId: notification.notification_id,
      userId: notification.user_id,
      notificationTypeId: notification.notification_type_id || null,
      title: notification.title,
      body: notification.body,
      relatedEntityType: notification.related_entity_type || null,
      relatedEntityId: notification.related_entity_id || null,
      // [RF-USR-01] | CA-06 | El metadata suele traer el correo/celular del titular → redactor profundo.
      metadata: MaskingUtil.redactPayload(notification.metadata) || null,
      isRead: notification.is_read,
      readAt: notification.read_at || null,
      processingStatus: notification.processing_status,
      scheduledFor: notification.scheduled_for || null,
      priority: notification.priority,
      createdAt: notification.createdAt
    };

    if (includeType && notification.notification_type) {
      dto.notificationType = NotificationTypeComponent.build(notification.notification_type);
    }

    if (includeDelivery) {
      dto.delivery = {
        push: {
          sent: notification.push_sent,
          sentAt: notification.push_sent_at || null,
          error: notification.push_error || null,
          retryCount: notification.push_retry_count,
          nextRetryAt: notification.push_next_retry_at || null
        },
        email: {
          sent: notification.email_sent,
          sentAt: notification.email_sent_at || null,
          error: notification.email_error || null,
          retryCount: notification.email_retry_count,
          nextRetryAt: notification.email_next_retry_at || null
        }
      };
    }

    return dto;
  }

  static buildArray(notifications: Maybe<NotificationRow[]>, options: NotificationBuildOptions = {}) {
    if (!notifications || notifications.length === 0) {
      return [];
    }
    return notifications.map(n => NotificationComponent.build(n, options));
  }
}

// ============================================================
// GLOBAL NOTIFICATION
// ============================================================

class GlobalNotificationComponent {
  /**
   * @param {Object} globalNotification - Instancia de GlobalNotification
   * @param {Object} [options]
   * @param {boolean} [options.includeType]      - Incluir asociación notificationType
   * @param {boolean} [options.includeStats]     - Incluir contadores push/email enviados
   * @param {boolean} [options.includeTargeting] - Incluir campos de targeting (admin)
   * @param {boolean} [options.isRead]           - Marcar si el usuario actual ya la leyó
   *
   * Aliases esperados:
   *   globalNotification.notification_type  (NotificationType)
   *   globalNotification.creator            (User — solo en admin)
   */
  static build(globalNotification: Maybe<GlobalNotificationRow>, options: GlobalNotificationBuildOptions = {}) {
    if (!globalNotification) {
      return null;
    }

    const { includeType = false, includeStats = false, includeTargeting = false, isRead = null } = options;

    const dto: Dto = {
      globalNotificationId: globalNotification.global_notification_id,
      notificationTypeId: globalNotification.notification_type_id || null,
      title: globalNotification.title,
      body: globalNotification.body,
      metadata: MaskingUtil.redactPayload(globalNotification.metadata) || null,
      sendPush: globalNotification.send_push,
      sendEmail: globalNotification.send_email,
      sendInApp: globalNotification.send_in_app,
      isActive: globalNotification.is_active,
      startsAt: globalNotification.starts_at,
      endsAt: globalNotification.ends_at || null,
      createdAt: globalNotification.createdAt
    };

    if (isRead !== null) {
      dto.isRead = isRead;
    }

    if (includeType && globalNotification.notification_type) {
      dto.notificationType = NotificationTypeComponent.build(globalNotification.notification_type);
    }

    if (includeStats) {
      dto.stats = {
        totalTargetUsers: globalNotification.total_target_users,
        pushSentCount: globalNotification.push_sent_count,
        emailSentCount: globalNotification.email_sent_count,
        pushProcessingStatus: globalNotification.push_processing_status,
        emailProcessingStatus: globalNotification.email_processing_status,
        processingStartedAt: globalNotification.processing_started_at || null,
        processingCompletedAt: globalNotification.processing_completed_at || null,
        batchSize: globalNotification.batch_size
      };
    }

    if (includeTargeting) {
      dto.targeting = {
        targetUserRole: globalNotification.target_user_role || null,
        targetConditions: globalNotification.target_conditions || null,
        createdByUserId: globalNotification.created_by || null
      };
    }

    return dto;
  }

  static buildArray(globalNotifications: Maybe<GlobalNotificationRow[]>, options: GlobalNotificationBuildOptions = {}) {
    if (!globalNotifications || globalNotifications.length === 0) {
      return [];
    }
    return globalNotifications.map(gn => GlobalNotificationComponent.build(gn, options));
  }
}

// ============================================================
// GLOBAL NOTIFICATION READ
// ============================================================

class GlobalNotificationReadComponent {
  /**
   * @param {Object} read - Instancia de GlobalNotificationRead (PK compuesta)
   */
  static build(read: Maybe<GlobalNotificationReadRow>) {
    if (!read) {
      return null;
    }
    return {
      globalNotificationId: read.global_notification_id,
      userId: read.user_id,
      readAt: read.read_at
    };
  }
}

// ============================================================
// USER PUSH TOKEN
// ============================================================

class UserPushTokenComponent {
  /**
   * @param {Object} pushToken - Instancia de UserPushToken
   */
  static build(pushToken: Maybe<UserPushTokenRow>) {
    if (!pushToken) {
      return null;
    }
    return {
      userPushTokenId: pushToken.user_push_token_id,
      userId: pushToken.user_id,
      token: pushToken.token,
      platform: pushToken.platform,
      deviceId: pushToken.device_id || null,
      isActive: pushToken.is_active,
      lastUsedAt: pushToken.last_used_at,
      createdAt: pushToken.createdAt
    };
  }

  static buildArray(pushTokens: Maybe<UserPushTokenRow[]>) {
    if (!pushTokens || pushTokens.length === 0) {
      return [];
    }
    return pushTokens.map(pt => UserPushTokenComponent.build(pt));
  }
}

// ============================================================
// USER NOTIFICATION PREFERENCE
// ============================================================

class UserNotificationPreferenceComponent {
  /**
   * @param {Object} preference - Instancia de UserNotificationPreference
   */
  static build(preference: Maybe<UserNotificationPreferenceRow>) {
    if (!preference) {
      return null;
    }
    return {
      userNotificationPreferenceId: preference.user_notification_preference_id,
      userId: preference.user_id,
      // null = preferencia global (afecta a todas las categorías)
      notificationCategoryCode: preference.notification_category_code || null,
      allowPush: preference.allow_push,
      allowEmail: preference.allow_email,
      allowSms: preference.allow_sms,
      quietHoursStart: preference.quiet_hours_start || null,
      quietHoursEnd: preference.quiet_hours_end || null,
      category: preference.notification_category
        ? NotificationCategoryComponent.build(preference.notification_category)
        : null,
      createdAt: preference.createdAt,
      updatedAt: preference.updatedAt
    };
  }

  static buildArray(preferences: Maybe<UserNotificationPreferenceRow[]>) {
    if (!preferences || preferences.length === 0) {
      return [];
    }
    return preferences.map(p => UserNotificationPreferenceComponent.build(p));
  }
}

// ============================================================
// EXPORTS
// ============================================================

export = {
  NotificationCategoryComponent,
  NotificationTypeComponent,
  NotificationComponent,
  GlobalNotificationComponent,
  GlobalNotificationReadComponent,
  UserPushTokenComponent,
  UserNotificationPreferenceComponent
};
