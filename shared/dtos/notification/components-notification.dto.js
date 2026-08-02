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

const MaskingUtil = require('../../utils/masking.util');

// ============================================================
// NOTIFICATION CATEGORY
// ============================================================

class NotificationCategoryComponent {
  /**
   * @param {Object} category - Instancia de NotificationCategory
   * @param {boolean} includeLayout - Incluir el email_layout_template (solo admin/edición)
   */
  static build(category, includeLayout = false) {
    if (!category) {
      return null;
    }

    const dto = {
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

  static buildArray(categories, includeLayout = false) {
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
  static build(notificationType, includeTemplates = false) {
    if (!notificationType) {
      return null;
    }

    const dto = {
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
  static build(notification, options = {}) {
    if (!notification) {
      return null;
    }

    const { includeType = false, includeDelivery = false } = options;

    const dto = {
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

  static buildArray(notifications, options = {}) {
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
  static build(globalNotification, options = {}) {
    if (!globalNotification) {
      return null;
    }

    const { includeType = false, includeStats = false, includeTargeting = false, isRead = null } = options;

    const dto = {
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

  static buildArray(globalNotifications, options = {}) {
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
  static build(read) {
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
  static build(pushToken) {
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

  static buildArray(pushTokens) {
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
  static build(preference) {
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

  static buildArray(preferences) {
    if (!preferences || preferences.length === 0) {
      return [];
    }
    return preferences.map(p => UserNotificationPreferenceComponent.build(p));
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  NotificationCategoryComponent,
  NotificationTypeComponent,
  NotificationComponent,
  GlobalNotificationComponent,
  GlobalNotificationReadComponent,
  UserPushTokenComponent,
  UserNotificationPreferenceComponent
};
