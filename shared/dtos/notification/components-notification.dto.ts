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

import MaskingUtil from '../../utils/masking.util';
import type { DbDate, Maybe } from '../../types/db-rows';

/** Objeto de salida con campos opcionales que se agregan según las opciones de build. */
type Dto = Record<string, unknown>;

interface NotificationCategoryRow {
  notificationCategoryId: string;
  code: string;
  name?: Maybe<string>;
  description?: Maybe<string>;
  supportsPush?: Maybe<boolean>;
  supportsEmail?: Maybe<boolean>;
  supportsSms?: Maybe<boolean>;
  allowDnd?: Maybe<boolean>;
  isCritical?: Maybe<boolean>;
  defaultQuietHoursStart?: Maybe<string>;
  defaultQuietHoursEnd?: Maybe<string>;
  priority?: Maybe<string | number>;
  sortOrder?: Maybe<number>;
  isActive?: Maybe<boolean>;
  emailLayoutTemplate?: Maybe<string>;
}

interface NotificationTypeRow {
  notificationTypeId: string;
  code: string;
  name?: Maybe<string>;
  description?: Maybe<string>;
  notificationCategoryId?: Maybe<string>;
  priority?: Maybe<string | number>;
  isActive?: Maybe<boolean>;
  category?: Maybe<NotificationCategoryRow>;
  titleTemplate?: Maybe<string>;
  bodyTemplate?: Maybe<string>;
  emailSubjectTemplate?: Maybe<string>;
  emailBodyTemplate?: Maybe<string>;
}

interface NotificationRow {
  notificationId: string;
  userId: string;
  notificationTypeId?: Maybe<string>;
  title?: Maybe<string>;
  body?: Maybe<string>;
  relatedEntityType?: Maybe<string>;
  relatedEntityId?: Maybe<string>;
  metadata?: unknown;
  isRead?: Maybe<boolean>;
  readAt?: Maybe<DbDate>;
  processingStatus?: Maybe<string>;
  scheduledFor?: Maybe<DbDate>;
  priority?: Maybe<string | number>;
  createdAt?: Maybe<DbDate>;
  notificationType?: Maybe<NotificationTypeRow>;
  pushSent?: Maybe<boolean>;
  pushSentAt?: Maybe<DbDate>;
  pushError?: Maybe<string>;
  pushRetryCount?: Maybe<number>;
  pushNextRetryAt?: Maybe<DbDate>;
  emailSent?: Maybe<boolean>;
  emailSentAt?: Maybe<DbDate>;
  emailError?: Maybe<string>;
  emailRetryCount?: Maybe<number>;
  emailNextRetryAt?: Maybe<DbDate>;
}

interface GlobalNotificationRow {
  globalNotificationId: string;
  notificationTypeId?: Maybe<string>;
  title?: Maybe<string>;
  body?: Maybe<string>;
  metadata?: unknown;
  sendPush?: Maybe<boolean>;
  sendEmail?: Maybe<boolean>;
  sendInApp?: Maybe<boolean>;
  isActive?: Maybe<boolean>;
  startsAt?: Maybe<DbDate>;
  endsAt?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
  notificationType?: Maybe<NotificationTypeRow>;
  totalTargetUsers?: Maybe<number>;
  pushSentCount?: Maybe<number>;
  emailSentCount?: Maybe<number>;
  pushProcessingStatus?: Maybe<string>;
  emailProcessingStatus?: Maybe<string>;
  processingStartedAt?: Maybe<DbDate>;
  processingCompletedAt?: Maybe<DbDate>;
  batchSize?: Maybe<number>;
  targetUserRole?: Maybe<string>;
  targetConditions?: unknown;
  createdBy?: Maybe<string>;
}

interface GlobalNotificationReadRow {
  globalNotificationId: string;
  userId: string;
  readAt?: Maybe<DbDate>;
}

interface UserPushTokenRow {
  userPushTokenId: string;
  userId: string;
  token: string;
  platform?: Maybe<string>;
  deviceId?: Maybe<string>;
  isActive?: Maybe<boolean>;
  lastUsedAt?: Maybe<DbDate>;
  createdAt?: Maybe<DbDate>;
}

interface UserNotificationPreferenceRow {
  userNotificationPreferenceId: string;
  userId: string;
  notificationCategoryCode?: Maybe<string>;
  allowPush?: Maybe<boolean>;
  allowEmail?: Maybe<boolean>;
  allowSms?: Maybe<boolean>;
  quietHoursStart?: Maybe<string>;
  quietHoursEnd?: Maybe<string>;
  notificationCategory?: Maybe<NotificationCategoryRow>;
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
      notificationCategoryId: category.notificationCategoryId,
      code: category.code,
      name: category.name,
      description: category.description || null,
      supportsPush: category.supportsPush,
      supportsEmail: category.supportsEmail,
      supportsSms: category.supportsSms,
      allowDnd: category.allowDnd,
      isCritical: category.isCritical,
      defaultQuietHoursStart: category.defaultQuietHoursStart || null,
      defaultQuietHoursEnd: category.defaultQuietHoursEnd || null,
      priority: category.priority,
      sortOrder: category.sortOrder,
      isActive: category.isActive
    };

    if (includeLayout) {
      dto.emailLayoutTemplate = category.emailLayoutTemplate || null;
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
      notificationTypeId: notificationType.notificationTypeId,
      code: notificationType.code,
      name: notificationType.name,
      description: notificationType.description || null,
      notificationCategoryId: notificationType.notificationCategoryId || null,
      priority: notificationType.priority,
      isActive: notificationType.isActive
    };

    // La categoría (canales/DND/criticidad) se expone si viene incluida en la asociación.
    if (notificationType.category) {
      dto.category = NotificationCategoryComponent.build(notificationType.category);
    }

    if (includeTemplates) {
      dto.titleTemplate = notificationType.titleTemplate;
      dto.bodyTemplate = notificationType.bodyTemplate;
      dto.emailSubjectTemplate = notificationType.emailSubjectTemplate || null;
      dto.emailBodyTemplate = notificationType.emailBodyTemplate || null;
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
      notificationId: notification.notificationId,
      userId: notification.userId,
      notificationTypeId: notification.notificationTypeId || null,
      title: notification.title,
      body: notification.body,
      relatedEntityType: notification.relatedEntityType || null,
      relatedEntityId: notification.relatedEntityId || null,
      // [RF-USR-01] | CA-06 | El metadata suele traer el correo/celular del titular → redactor profundo.
      metadata: MaskingUtil.redactPayload(notification.metadata) || null,
      isRead: notification.isRead,
      readAt: notification.readAt || null,
      processingStatus: notification.processingStatus,
      scheduledFor: notification.scheduledFor || null,
      priority: notification.priority,
      createdAt: notification.createdAt
    };

    if (includeType && notification.notificationType) {
      dto.notificationType = NotificationTypeComponent.build(notification.notificationType);
    }

    if (includeDelivery) {
      dto.delivery = {
        push: {
          sent: notification.pushSent,
          sentAt: notification.pushSentAt || null,
          error: notification.pushError || null,
          retryCount: notification.pushRetryCount,
          nextRetryAt: notification.pushNextRetryAt || null
        },
        email: {
          sent: notification.emailSent,
          sentAt: notification.emailSentAt || null,
          error: notification.emailError || null,
          retryCount: notification.emailRetryCount,
          nextRetryAt: notification.emailNextRetryAt || null
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
      globalNotificationId: globalNotification.globalNotificationId,
      notificationTypeId: globalNotification.notificationTypeId || null,
      title: globalNotification.title,
      body: globalNotification.body,
      metadata: MaskingUtil.redactPayload(globalNotification.metadata) || null,
      sendPush: globalNotification.sendPush,
      sendEmail: globalNotification.sendEmail,
      sendInApp: globalNotification.sendInApp,
      isActive: globalNotification.isActive,
      startsAt: globalNotification.startsAt,
      endsAt: globalNotification.endsAt || null,
      createdAt: globalNotification.createdAt
    };

    if (isRead !== null) {
      dto.isRead = isRead;
    }

    if (includeType && globalNotification.notificationType) {
      dto.notificationType = NotificationTypeComponent.build(globalNotification.notificationType);
    }

    if (includeStats) {
      dto.stats = {
        totalTargetUsers: globalNotification.totalTargetUsers,
        pushSentCount: globalNotification.pushSentCount,
        emailSentCount: globalNotification.emailSentCount,
        pushProcessingStatus: globalNotification.pushProcessingStatus,
        emailProcessingStatus: globalNotification.emailProcessingStatus,
        processingStartedAt: globalNotification.processingStartedAt || null,
        processingCompletedAt: globalNotification.processingCompletedAt || null,
        batchSize: globalNotification.batchSize
      };
    }

    if (includeTargeting) {
      dto.targeting = {
        targetUserRole: globalNotification.targetUserRole || null,
        targetConditions: globalNotification.targetConditions || null,
        createdByUserId: globalNotification.createdBy || null
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
      globalNotificationId: read.globalNotificationId,
      userId: read.userId,
      readAt: read.readAt
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
      userPushTokenId: pushToken.userPushTokenId,
      userId: pushToken.userId,
      token: pushToken.token,
      platform: pushToken.platform,
      deviceId: pushToken.deviceId || null,
      isActive: pushToken.isActive,
      lastUsedAt: pushToken.lastUsedAt,
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
      userNotificationPreferenceId: preference.userNotificationPreferenceId,
      userId: preference.userId,
      // null = preferencia global (afecta a todas las categorías)
      notificationCategoryCode: preference.notificationCategoryCode || null,
      allowPush: preference.allowPush,
      allowEmail: preference.allowEmail,
      allowSms: preference.allowSms,
      quietHoursStart: preference.quietHoursStart || null,
      quietHoursEnd: preference.quietHoursEnd || null,
      category: preference.notificationCategory
        ? NotificationCategoryComponent.build(preference.notificationCategory)
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

export default {
  NotificationCategoryComponent,
  NotificationTypeComponent,
  NotificationComponent,
  GlobalNotificationComponent,
  GlobalNotificationReadComponent,
  UserPushTokenComponent,
  UserNotificationPreferenceComponent
};
