import type defineNotificationType = require('../models/notification-type.model');
import type { Transaction } from 'sequelize';
import notificationRepo = require('../repositories/notification.repository');
import globalNotificationRepo = require('../repositories/global-notification.repository');
import notificationTypeRepo = require('../repositories/notification-type.repository');
import userNotificationPreferenceRepo = require('../../kyc/person/repositories/user-notification-preference.repository');
import NotificationCountUtil = require('../utils/notification-count.util');
import notificationSchedulerService = require('./notification-scheduler.service');
import notificationSendingService = require('./notification-sending.service');
import NotificationContentUtil = require('../utils/notification-content.util');
import EncryptionUtil = require('../../../../shared/utils/encryption.util');
import loggerUtilModule = require('../../../../shared/utils/logger.util');
const { logger } = loggerUtilModule;
import AppError = require('../../../../shared/utils/app-error.util');
import domainEnumsModule = require('../../../../shared/constants/domain-enums');
const { NOTIFICATION_PROCESSING_STATUS } = domainEnumsModule;
import errorMessageModule = require('../../../../shared/utils/error-message.util');

const { errorMessage } = errorMessageModule;


class NotificationCreationService {
  notificationRepo: typeof notificationRepo;
  globalNotificationRepo: typeof globalNotificationRepo;
  notificationTypeRepo: typeof notificationTypeRepo;
  userNotificationPreferenceRepo: typeof userNotificationPreferenceRepo;
  notificationSchedulerService: typeof notificationSchedulerService;
  notificationSendingService: typeof notificationSendingService;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationCreationService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationCreationService.Deps = {}) {
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
  async crearNotificacionDirecta(data: { tipoNotificacion: string; email: string; metadata?: Record<string, unknown> }) {
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
      const emailService = require('./email-notification.service') as typeof import('./email-notification.service');
      await emailService.enviarNotificacion(emailDestino, notificationType, metadata);

      logger.info('Notificación directa enviada exitosamente', { tipo: tipoNotificacion, email: emailDestino });

      return {
        estado_solicitud: 1,
        message: 'Notificación enviada exitosamente por email.'
      };
    } catch (error) {
      logger.error('Error al enviar notificación directa', {
        error: errorMessage(error),
        stack: error instanceof Error ? error.stack : undefined
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
  async crearNotificacion(data: NotificationCreationService.CreateInput, transaction: Transaction | null = null) {
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
        notification_id: 'notification_id' in result ? result.notification_id : result.global_notification_id,
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
      logger.error('Error al crear notificación', { error: errorMessage(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  async _crearNotificacionIndividual(
    userId: string,
    notificationType: defineNotificationType.Instance,
    title: string,
    body: string,
    relatedEntity: NotificationCreationService.RelatedEntity | null | undefined,
    metadata: Record<string, unknown>,
    transaction: Transaction | null
  ) {
    // 1. Crear notificación in-app
    const notification = await this.notificationRepo.create(
      {
        user_id: userId,
        // FIX: notification_type_id usa notification_type_id (PK del modelo NotificationType)
        notification_type_id: notificationType.notification_type_id,
        title,
        body,
        // Antes relatedEntity_type/relatedEntity_id: columnas inexistentes que Sequelize descartaba en silencio
        related_entity_type: relatedEntity?.type || null,
        related_entity_id: relatedEntity?.id || null,
        metadata,
        processing_status: NOTIFICATION_PROCESSING_STATUS.PENDING,
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
  async _crearNotificacionGlobal(
    notificationType: defineNotificationType.Instance,
    title: string,
    body: string,
    metadata: Record<string, unknown>,
    transaction: Transaction | null
  ) {
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
    const batchService = require('./notification-batch.service') as typeof import('./notification-batch.service');

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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationCreationService {
  /** Entidad de dominio a la que apunta la notificación (p. ej. una ApprovalRequest). */
  export interface RelatedEntity {
    type?: string | null;
    id?: string | null;
  }

  export interface CreateInput {
    /** code del notification_type */
    tipoNotificacion: string;
    /** null → notificación global (a todos) */
    userId?: string | null;
    relatedEntity?: RelatedEntity | null;
    /** Variables de los templates ({{variable}}) */
    metadata?: Record<string, unknown>;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    notificationRepo?: typeof notificationRepo;
    globalNotificationRepo?: typeof globalNotificationRepo;
    notificationTypeRepo?: typeof notificationTypeRepo;
    userNotificationPreferenceRepo?: typeof userNotificationPreferenceRepo;
    notificationSchedulerService?: typeof notificationSchedulerService;
    notificationSendingService?: typeof notificationSendingService;
  }
}

export = Object.assign(new NotificationCreationService(), { NotificationCreationService });
