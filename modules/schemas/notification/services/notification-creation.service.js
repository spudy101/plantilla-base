const notificationRepo = require('../repositories/notification.repository');
const globalNotificationRepo = require('../repositories/global-notification.repository');
const notificationTypeRepo = require('../repositories/notification-type.repository');
const userNotificationPreferenceRepo = require('../../kyc/person/repositories/user-notification-preference.repository');
const NotificationCountUtil = require('../utils/notification-count.util');
const notificationSchedulerService = require('./notification-scheduler.service');
const notificationSendingService = require('./notification-sending.service');
const NotificationContentUtil = require('../utils/notification-content.util');
const EncryptionUtil = require('../../../../shared/utils/encryption.util');
const { logger } = require('../../../../shared/utils/logger.util');
const AppError = require('../../../../shared/utils/app-error.util');
const { Notification } = require('../../../../shared/models');

class NotificationCreationService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationCreationService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.globalNotificationRepo = deps.globalNotificationRepo ?? globalNotificationRepo;
    this.notificationTypeRepo = deps.notificationTypeRepo ?? notificationTypeRepo;
    this.userNotificationPreferenceRepo = deps.userNotificationPreferenceRepo ?? userNotificationPreferenceRepo;
    this.notificationSchedulerService = deps.notificationSchedulerService ?? notificationSchedulerService;
    this.notificationSendingService = deps.notificationSendingService ?? notificationSendingService;
  }

  /**
   * Crea y envía una notificación directa por email sin guardarla en BD
   * Útil para cuentas eliminadas u otros casos donde el usuario ya no existe
   *
   * @param {Object} data
   * @param {string} data.tipoNotificacion
   * @param {string} data.email
   * @param {Object} [data.metadata]
   */
  async crearNotificacionDirecta(data) {
    try {
      const { tipoNotificacion, email, metadata = {} } = data;

      if (!tipoNotificacion) {
        throw AppError.badRequest('tipoNotificacion es requerido');
      }
      if (!email) {
        throw AppError.badRequest('email es requerido');
      }

      const notificationType = await this.notificationTypeRepo.findByCode(tipoNotificacion);
      if (!notificationType) {
        throw AppError.notFound(`Tipo de notificación no encontrado: ${tipoNotificacion}`);
      }

      // El email puede llegar cifrado (formato GCM ivHex:authTagHex:cipherHex) cuando proviene
      // de un include anidado donde el hook afterFind de PersonContact no se ejecuta (ej:
      // deleteAccount). SES interpreta los ':' como grupos anidados → 'Nested group'. Descifrar
      // antes de enviar; safeDecrypt es idempotente si ya viene en claro.
      const emailDestino = EncryptionUtil.safeDecrypt(email);

      // FIX: nombre de archivo corregido de emailNotification.service → email-notification.service
      const emailService = require('./email-notification.service');
      await emailService.enviarNotificacion(emailDestino, notificationType, metadata);

      logger.info('Notificación directa enviada exitosamente', { tipo: tipoNotificacion, email: emailDestino });

      return {
        estado_solicitud: 1,
        message: 'Notificación enviada exitosamente por email.'
      };
    } catch (error) {
      logger.error('Error al enviar notificación directa', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Crea y envía una notificación (individual o global)
   *
   * @param {Object}      data
   * @param {string}      data.tipoNotificacion
   * @param {string|null} data.userId           - null → notificación global
   * @param {Object}      [data.relatedEntity]  - { type, id }
   * @param {Object}      [data.metadata]
   * @param {Object}      transaction            - Transacción de Sequelize
   */
  async crearNotificacion(data, transaction = null) {
    try {
      const { tipoNotificacion, userId = null, relatedEntity = {}, metadata = {} } = data;

      if (!tipoNotificacion) {
        throw AppError.badRequest('tipoNotificacion es requerido');
      }

      const notificationType = await this.notificationTypeRepo.findByCode(tipoNotificacion);
      if (!notificationType) {
        throw AppError.notFound(`Tipo de notificación no encontrado: ${tipoNotificacion}`);
      }

      // Generar contenido desde templates
      const generated = NotificationContentUtil.generarContenido(notificationType, metadata);

      let result;
      if (userId) {
        result = await this._crearNotificacionIndividual(
          userId,
          notificationType,
          generated.title,
          generated.body,
          relatedEntity,
          metadata,
          transaction
        );
      } else {
        result = await this._crearNotificacionGlobal(notificationType, generated.title, generated.body, metadata, transaction);
      }

      logger.info('Notificación creada exitosamente', {
        notification_id: result.notification_id || result.global_notification_id,
        tipo: tipoNotificacion,
        userId,
        is_global: !userId
      });

      return {
        estado_solicitud: 1,
        message: 'Notificación creada exitosamente.',
        ...result
      };
    } catch (error) {
      logger.error('Error al crear notificación', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  async _crearNotificacionIndividual(userId, notificationType, title, body, relatedEntity, metadata, transaction) {
    // 1. Crear notificación in-app
    const notification = await this.notificationRepo.create(
      {
        user_id: userId,
        // FIX: notification_type_id usa notification_type_id (PK del modelo NotificationType)
        notification_type_id: notificationType.notification_type_id,
        title,
        body,
        relatedEntity_type: relatedEntity?.type || null,
        relatedEntity_id: relatedEntity?.id || null,
        metadata,
        processing_status: Notification.PROCESSING_STATUS.PENDING,
        priority: NotificationContentUtil.mapPriority(notificationType.priority)
      },
      { transaction }
    );

    // 2. Preferencias del usuario — atadas a la CATEGORÍA del tipo (o global si no tiene categoría)
    const category = notificationType.category || null;
    const categoryCode = category?.code ?? null;
    const userPreference = categoryCode
      ? await this.userNotificationPreferenceRepo.findByUserAndCategory(userId, categoryCode)
      : await this.userNotificationPreferenceRepo.findGlobalByUser(userId);

    // 3. Quiet hours y prioridad — la categoría manda. Una categoría crítica o no silenciable
    //    ignora el quiet hours del usuario.
    const isCritical = category?.is_critical === true;
    const allowDnd = category?.allow_dnd !== false;
    const isQuietHours = allowDnd && !isCritical && this.notificationSchedulerService.isInQuietHours(userPreference);
    const isHighPriority = isCritical || category?.priority === 'urgent' || notificationType.priority === 'high';

    // 4. Programar envíos en background
    setImmediate(() => {
      this.notificationSendingService
        .procesarEnviosIndividuales(
          // FIX: notification.notification_id en vez de notification.id
          notification.notification_id,
          userId,
          notificationType,
          title,
          body,
          metadata,
          userPreference,
          isQuietHours,
          isHighPriority
        )
        .catch(err => {
          logger.error('Error procesando envíos individuales', {
            error: err.message,
            // FIX: notification.notification_id en vez de notification.id
            notification_id: notification.notification_id
          });
        });
    });

    // 5. Refrescar el contador SSE del destinatario (side-effect de fondo, nunca en el flujo principal)
    setImmediate(() => NotificationCountUtil.emitCountUpdate(userId));

    // FIX: retornar notification_id (PK real) en vez de id
    return { notification_id: notification.notification_id };
  }

  /** @private */
  async _crearNotificacionGlobal(notificationType, title, body, metadata, transaction) {
    // 1. Crear notificación global
    const globalNotification = await this.globalNotificationRepo.create(
      {
        // FIX: notification_type_id usa notification_type_id (PK del modelo NotificationType)
        notification_type_id: notificationType.notification_type_id,
        title,
        body,
        metadata,
        send_push: notificationType.category?.supports_push ?? true,
        send_email: notificationType.category?.supports_email ?? true,
        send_in_app: true,
        batch_size: 100,
        is_active: true
      },
      { transaction }
    );

    // 2. Programar procesamiento masivo en background
    // FIX: nombre de archivo corregido de notificationBatch.service → notification-batch.service
    const batchService = require('./notification-batch.service');

    setImmediate(() => {
      batchService
        .procesarNotificacionGlobal(
          // FIX: global_notification_id (PK real) en vez de id
          globalNotification.global_notification_id,
          notificationType,
          title,
          body,
          metadata
        )
        .catch(err => {
          logger.error('Error procesando notificación global', {
            error: err.message,
            // FIX: global_notification_id (PK real) en vez de id
            global_notification_id: globalNotification.global_notification_id
          });
        });
    });

    // 3. Aviso broadcast del contador: la global es una sola fila para todos, así que cada
    // conexión SSE abierta recalcula su propio count al recibir { global: true }.
    setImmediate(() => NotificationCountUtil.emitGlobalCountInvalidation());

    // FIX: retornar global_notification_id (PK real) en vez de id
    return { global_notification_id: globalNotification.global_notification_id };
  }
}

module.exports = new NotificationCreationService();
module.exports.NotificationCreationService = NotificationCreationService;
