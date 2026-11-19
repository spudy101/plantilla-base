// Bloques reutilizables del módulo de notificaciones (client y admin): nunca duplicarlos.
// Cada constructor tiene su esquema Zod de salida al final del archivo (tipa y documenta la respuesta).

import MaskingUtil from '../../../shared/security/masking.util';
import { z } from '../../../shared/validation/z';
import { dateTime } from '../../../shared/validation/output';
import type { DbDate, Maybe } from '../../../shared/types/db-rows';

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
}

interface GlobalNotificationBuildOptions {
  includeType?: boolean;
  /** Si viene (true/false), se marca si el usuario actual ya la leyó. */
  isRead?: boolean | null;
}

// ============================================================
// NOTIFICATION CATEGORY
// ============================================================

class NotificationCategoryComponent {
  /** includeLayout: incluye email_layout_template (solo admin/edición). */
  static build(category: Maybe<NotificationCategoryRow>, includeLayout = false) {
    if (!category) {
      return null;
    }
    return {
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
      isActive: category.isActive,
      ...(includeLayout ? { emailLayoutTemplate: category.emailLayoutTemplate || null } : {})
    };
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
  static build(notificationType: Maybe<NotificationTypeRow>) {
    if (!notificationType) {
      return null;
    }
    return {
      notificationTypeId: notificationType.notificationTypeId,
      code: notificationType.code,
      name: notificationType.name,
      description: notificationType.description || null,
      notificationCategoryId: notificationType.notificationCategoryId || null,
      priority: notificationType.priority,
      isActive: notificationType.isActive,
      ...(notificationType.category ? { category: NotificationCategoryComponent.build(notificationType.category) } : {})
    };
  }
}

// ============================================================
// NOTIFICATION (personal)
// ============================================================

class NotificationComponent {
  static build(notification: Maybe<NotificationRow>, { includeType = false }: NotificationBuildOptions = {}) {
    if (!notification) {
      return null;
    }
    return {
      notificationId: notification.notificationId,
      userId: notification.userId,
      notificationTypeId: notification.notificationTypeId || null,
      title: notification.title,
      body: notification.body,
      relatedEntityType: notification.relatedEntityType || null,
      relatedEntityId: notification.relatedEntityId || null,
      // [RF-USR-01] | CA-06 | metadata es JSON libre: redactor profundo por key.
      metadata: MaskingUtil.redactPayload(notification.metadata) || null,
      isRead: notification.isRead,
      readAt: notification.readAt || null,
      processingStatus: notification.processingStatus,
      scheduledFor: notification.scheduledFor || null,
      priority: notification.priority,
      createdAt: notification.createdAt,
      ...(includeType && notification.notificationType
        ? { notificationType: NotificationTypeComponent.build(notification.notificationType) }
        : {})
    };
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
  static build(
    globalNotification: Maybe<GlobalNotificationRow>,
    { includeType = false, isRead = null }: GlobalNotificationBuildOptions = {}
  ) {
    if (!globalNotification) {
      return null;
    }
    return {
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
      createdAt: globalNotification.createdAt,
      ...(isRead !== null ? { isRead } : {}),
      ...(includeType && globalNotification.notificationType
        ? { notificationType: NotificationTypeComponent.build(globalNotification.notificationType) }
        : {})
    };
  }
}

// ============================================================
// USER NOTIFICATION PREFERENCE
// ============================================================

class UserNotificationPreferenceComponent {
  static build(preference: Maybe<UserNotificationPreferenceRow>) {
    if (!preference) {
      return null;
    }
    return {
      userNotificationPreferenceId: preference.userNotificationPreferenceId,
      userId: preference.userId,
      // null = preferencia global; con valor = override de esa categoría.
      notificationCategoryCode: preference.notificationCategoryCode || null,
      allowPush: preference.allowPush,
      allowEmail: preference.allowEmail,
      allowSms: preference.allowSms,
      quietHoursStart: preference.quietHoursStart || null,
      quietHoursEnd: preference.quietHoursEnd || null,
      category: preference.notificationCategory ? NotificationCategoryComponent.build(preference.notificationCategory) : null,
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
// ESQUEMAS DE SALIDA
// ============================================================

const PRIORITY_LEVELS = ['low', 'normal', 'high', 'urgent'] as const;
export const PROCESSING_STATUSES = ['pending', 'processing', 'completed', 'partial_failure', 'failed'] as const;
const maskedMetadata = z
  .record(z.string(), z.unknown())
  .nullable()
  .meta({ description: 'Variables del mensaje (JSON). Los datos personales salen enmascarados.' });
const timeOfDay = z.string().nullable().meta({ example: '22:00:00' });

export const NotificationCategorySchema = z.object({
  notificationCategoryId: z.uuid(),
  code: z.string().meta({ example: 'SECURITY' }),
  name: z.string().meta({ example: 'Seguridad' }),
  description: z.string().nullable(),
  supportsPush: z.boolean(),
  supportsEmail: z.boolean(),
  supportsSms: z.boolean(),
  allowDnd: z.boolean().meta({ description: 'false: el usuario no puede silenciarla (se ignoran sus horas de silencio).' }),
  isCritical: z.boolean().meta({ description: 'true: emergencia; ignora horas de silencio y no se puede silenciar.' }),
  defaultQuietHoursStart: timeOfDay,
  defaultQuietHoursEnd: timeOfDay,
  priority: z.enum(PRIORITY_LEVELS),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  emailLayoutTemplate: z.string().nullable().optional().meta({ description: 'Layout HTML del email. Solo en el panel admin.' })
});

export const NotificationTypeSchema = z.object({
  notificationTypeId: z.uuid(),
  code: z.string().meta({ example: 'OPERATION_APPROVED' }),
  name: z.string().meta({ example: 'Operación aprobada' }),
  description: z.string().nullable(),
  notificationCategoryId: z.uuid().nullable(),
  priority: z.enum(PRIORITY_LEVELS).nullable(),
  isActive: z.boolean(),
  category: NotificationCategorySchema.nullable()
    .optional()
    .meta({ description: 'Categoría: de ella salen los canales, el DND y el layout del email.' })
});

export const NotificationSchema = z.object({
  notificationId: z.uuid(),
  userId: z.uuid(),
  notificationTypeId: z.uuid().nullable(),
  title: z.string().meta({ example: 'Tu solicitud fue aprobada' }),
  body: z.string().meta({ example: 'Revisa los detalles en la app.' }),
  relatedEntityType: z.string().nullable().meta({ example: 'operation' }),
  relatedEntityId: z.string().nullable(),
  metadata: maskedMetadata,
  isRead: z.boolean(),
  readAt: dateTime().nullable(),
  processingStatus: z.enum(PROCESSING_STATUSES).nullable(),
  scheduledFor: dateTime().nullable(),
  priority: z.number().int().nullable().meta({ example: 5, description: 'Prioridad de envío: 1 (máxima) a 10.' }),
  createdAt: dateTime(),
  notificationType: NotificationTypeSchema.optional()
});

export const GlobalNotificationSchema = z.object({
  globalNotificationId: z.uuid(),
  notificationTypeId: z.uuid().nullable(),
  title: z.string(),
  body: z.string(),
  metadata: maskedMetadata,
  sendPush: z.boolean(),
  sendEmail: z.boolean(),
  sendInApp: z.boolean(),
  isActive: z.boolean(),
  startsAt: dateTime(),
  endsAt: dateTime().nullable(),
  createdAt: dateTime(),
  isRead: z.boolean().optional().meta({ description: 'Si el usuario actual ya la leyó.' }),
  notificationType: NotificationTypeSchema.optional()
});

export const UserNotificationPreferenceSchema = z.object({
  userNotificationPreferenceId: z.uuid(),
  userId: z.uuid(),
  notificationCategoryCode: z
    .string()
    .nullable()
    .meta({ description: 'null = preferencia global; con valor = ajuste de esa categoría.' }),
  allowPush: z.boolean(),
  allowEmail: z.boolean(),
  allowSms: z.boolean(),
  quietHoursStart: timeOfDay,
  quietHoursEnd: timeOfDay,
  category: NotificationCategorySchema.nullable(),
  createdAt: dateTime(),
  updatedAt: dateTime()
});

export default {
  NotificationCategoryComponent,
  NotificationTypeComponent,
  NotificationComponent,
  GlobalNotificationComponent,
  UserNotificationPreferenceComponent
};
