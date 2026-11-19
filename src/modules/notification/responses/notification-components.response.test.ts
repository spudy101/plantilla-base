// La salida de cada constructor de notificaciones cumple su esquema (y por lo tanto su documentación).
import components, {
  GlobalNotificationSchema,
  NotificationCategorySchema,
  NotificationSchema,
  NotificationTypeSchema,
  UserNotificationPreferenceSchema
} from './notification-components.response';
import categoryDto, { NotificationCategoryAdminSchema } from './admin-notification-category.response';
import deliveryDto, {
  NotificationDeliveryDetailSchema,
  NotificationDeliveryItemSchema,
  NotificationDeliveryMetricsSchema
} from './admin-notification-delivery.response';
import typeDto, {
  DirectNotificationQueuedSchema,
  GlobalNotificationQueuedSchema,
  NotificationTypeAdminSchema
} from './admin-notification-type.response';
import preferenceDto, { CategoryPreferenceViewSchema } from './notification-preference.response';
import feedDto, { NotificationMixedItemSchema, UnreadCountSchema } from './notification.response';
import verificationDto, { SendVerificationSchema, VerifyCodeSchema } from './send-verification.response';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const at = new Date('2026-01-01T00:00:00Z');
const category = {
  notificationCategoryId: ID,
  code: 'SECURITY',
  name: 'Seguridad',
  description: null,
  supportsPush: true,
  supportsEmail: true,
  supportsSms: false,
  allowDnd: true,
  isCritical: false,
  defaultQuietHoursStart: '22:00:00',
  defaultQuietHoursEnd: null,
  priority: 'normal',
  sortOrder: 1,
  isActive: true,
  emailLayoutTemplate: '<p>{{content}}</p>',
  updatedAt: at
};
const type = {
  notificationTypeId: ID,
  code: 'OPERATION_APPROVED',
  name: 'Operación aprobada',
  description: null,
  notificationCategoryId: ID,
  priority: 'high',
  isActive: true,
  category,
  titleTemplate: 'Hola {{nombre}}',
  bodyTemplate: 'Cuerpo',
  emailSubjectTemplate: null,
  emailBodyTemplate: null,
  updatedAt: at
};
const notification = {
  notificationId: ID,
  userId: ID,
  notificationTypeId: ID,
  title: 'Título',
  body: 'Cuerpo',
  relatedEntityType: null,
  relatedEntityId: null,
  metadata: { email: 'ana@correo.co' },
  isRead: false,
  readAt: null,
  processingStatus: 'completed',
  scheduledFor: null,
  priority: 5,
  createdAt: at,
  updatedAt: at,
  notificationType: type,
  emailSent: true,
  emailSentAt: at,
  emailError: null,
  emailRetryCount: 0,
  emailNextRetryAt: null,
  pushSent: false,
  pushSentAt: null,
  pushError: 'sin token',
  pushRetryCount: 1,
  pushNextRetryAt: at,
  smsSent: false,
  smsSentAt: null,
  smsError: null,
  smsRetryCount: 0,
  smsNextRetryAt: null,
  retryCount: 1
};
const globalNotification = {
  globalNotificationId: ID,
  notificationTypeId: null,
  title: 'Aviso',
  body: 'Para todos',
  metadata: null,
  sendPush: true,
  sendEmail: false,
  sendInApp: true,
  isActive: true,
  startsAt: at,
  endsAt: null,
  createdAt: at,
  notificationType: type
};
const pagination = { page: 1, limit: 10, sortBy: 'createdAt', order: 'DESC' };

const ok = (schema: { safeParse(v: unknown): { error?: { issues: unknown[] } } }, value: unknown) =>
  expect(schema.safeParse(value).error?.issues ?? []).toEqual([]);

describe('esquemas de salida de notificaciones', () => {
  it('componentes: categoría, tipo, notificación, global y preferencia', () => {
    ok(NotificationCategorySchema, components.NotificationCategoryComponent.build(category));
    ok(NotificationTypeSchema, components.NotificationTypeComponent.build(type));
    ok(NotificationSchema, components.NotificationComponent.build(notification, { includeType: true }));
    ok(
      GlobalNotificationSchema,
      components.GlobalNotificationComponent.build(globalNotification, { includeType: true, isRead: true })
    );
    ok(
      UserNotificationPreferenceSchema,
      components.UserNotificationPreferenceComponent.build({
        userNotificationPreferenceId: ID,
        userId: ID,
        notificationCategoryCode: null,
        allowPush: true,
        allowEmail: true,
        allowSms: false,
        quietHoursStart: '22:00:00',
        quietHoursEnd: '07:00:00',
        notificationCategory: category,
        createdAt: at,
        updatedAt: at
      })
    );
  });

  it('admin: categoría, tipo y envíos encolados', () => {
    ok(NotificationCategoryAdminSchema, categoryDto.NotificationCategoryAdminDTO(category as never));
    ok(NotificationTypeAdminSchema, typeDto.NotificationTypeAdminDTO(type as never));
    ok(
      GlobalNotificationQueuedSchema,
      typeDto.CreateGlobalNotificationResponseDTO({ globalNotificationId: ID, titulo: 't', contenido: 'c', asunto: null })
    );
    ok(
      DirectNotificationQueuedSchema,
      typeDto.CreateDirectNotificationResponseDTO({ notificationId: ID, userId: ID, titulo: 't', contenido: 'c' })
    );
  });

  it('admin: entregas (ítem, detalle y métricas)', () => {
    ok(NotificationDeliveryItemSchema, deliveryDto.NotificationDeliveryListDTO(notification as never));
    ok(
      NotificationDeliveryDetailSchema,
      deliveryDto.NotificationDeliveryDetailDTO({ ...notification, notificationType: null } as never)
    );
    const row = {
      category_code: 'SECURITY',
      category_name: 'Seguridad',
      total: 4,
      status_completed: 3,
      status_failed: 1,
      email_attempted: 4,
      email_sent: 3,
      email_failed: 1
    };
    ok(
      NotificationDeliveryMetricsSchema,
      deliveryDto.NotificationDeliveryMetricsDTO([row as never], { from: '2026-01-01', to: null })
    );
  });

  it('cliente: bandeja, conteo, preferencias por categoría y verificación', () => {
    const feed = feedDto.NotificationsListResponseDTO({
      mixed: [
        { __type: 'personal', __instance: notification },
        { __type: 'global', __instance: globalNotification }
      ],
      readIds: [ID],
      totalItems: 2,
      paginationParams: pagination
    } as never);
    feed.data.forEach(item => ok(NotificationMixedItemSchema, item));
    ok(UnreadCountSchema, feedDto.UnreadCountResponseDTO(3));
    ok(
      CategoryPreferenceViewSchema,
      preferenceDto.CategoryPreferencesViewDTO.build(category as never, null, { allowPush: false } as never)
    );
    ok(
      SendVerificationSchema,
      verificationDto.SendVerificationResponseDTO({
        verificationCode: { verificationCodeId: ID, type: 'email', expiresAt: at } as never,
        truncatedCode: '12'
      })
    );
    ok(VerifyCodeSchema, verificationDto.VerifyCodeResponseDTO());
  });
});
