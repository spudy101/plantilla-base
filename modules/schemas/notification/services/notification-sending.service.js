const notificationRepo = require('../repositories/notification.repository');
const notificationTypeRepo = require('../repositories/notification-type.repository');
const userRepo = require('../../kyc/iam/repositories/user.repository');
const userPushTokenRepo = require('../repositories/user-push-token.repository');
const emailService = require('./email-notification.service');
const pushService = require('./push-notification.service');
const smsService = require('./sms.service');
const schedulerService = require('./notification-scheduler.service');
const EncryptionUtil = require('../../../../shared/utils/encryption.util');
const { Notification } = require('../../../../shared/models');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');

const TOKEN_LOG_PREVIEW_LENGTH = 20;
const SMS_MAX_LENGTH = 160;

class NotificationSendingService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationSendingService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.notificationTypeRepo = deps.notificationTypeRepo ?? notificationTypeRepo;
    this.userRepo = deps.userRepo ?? userRepo;
    this.userPushTokenRepo = deps.userPushTokenRepo ?? userPushTokenRepo;
    this.emailService = deps.emailService ?? emailService;
    this.pushService = deps.pushService ?? pushService;
    this.smsService = deps.smsService ?? smsService;
    this.schedulerService = deps.schedulerService ?? schedulerService;
  }

  async _procesarCanal(isQuietHours, isHighPriority, schedulerFn, enviarFn) {
    if (!isQuietHours || isHighPriority) {
      await enviarFn();
    } else {
      await schedulerFn();
    }
  }

  /**
   * Procesa envíos individuales (push y/o email) respetando preferencias y quiet hours
   * @param {string}  notificationId  - ID de la notificación
   * @param {string}  userId          - ID del usuario
   * @param {Object}  notificationType
   * @param {string}  title
   * @param {string}  body
   * @param {Object}  metadata
   * @param {Object}  userPreference  - Preferencias del usuario
   * @param {boolean} isQuietHours
   * @param {boolean} isHighPriority
   */
  async procesarEnviosIndividuales(
    notificationId,
    userId,
    notificationType,
    title,
    body,
    metadata,
    userPreference,
    isQuietHours,
    isHighPriority
  ) {
    try {
      // Los canales soportados los define la CATEGORÍA del tipo (fuente de verdad). Cada canal
      // registra su propio resultado (markSent / recordError) y NO aborta el flujo: un fallo de
      // push no debe impedir email/SMS, ni viceversa. El estado final se deriva de los flags
      // reales del registro en actualizarEstadoEntrega().
      const category = notificationType.category || null;

      if ((category?.supports_push ?? true) && (userPreference?.allow_push ?? true)) {
        await this._procesarCanal(
          isQuietHours,
          isHighPriority,
          () => this.schedulerService.programarEnvioPush(notificationId, userPreference),
          () => this.enviarPushIndividual(userId, title, body, metadata, notificationId)
        );
      }

      if ((category?.supports_email ?? true) && (userPreference?.allow_email ?? true)) {
        await this._procesarCanal(
          isQuietHours,
          isHighPriority,
          () => this.schedulerService.programarEnvioEmail(notificationId, userPreference),
          () => this.enviarEmailIndividual(userId, notificationType, metadata, notificationId)
        );
      }

      if ((category?.supports_sms ?? false) && (userPreference?.allow_sms ?? true)) {
        await this._procesarCanal(
          isQuietHours,
          isHighPriority,
          () => this.schedulerService.programarEnvioSms(notificationId, userPreference),
          () => this.enviarSmsIndividual(userId, body, metadata, notificationId)
        );
      }

      await this.actualizarEstadoEntrega(notificationId, notificationType);
    } catch (error) {
      logger.warn('Error en procesamiento individual', { error: error.message, notificationId });
      await this.notificationRepo.updateProcessingStatus(notificationId, Notification.PROCESSING_STATUS.FAILED);
    }
  }

  /**
   * Recalcula y persiste el processing_status real de una notificación a partir de los flags
   * de cada canal (email_sent/email_error, push_sent/push_error). Fuente única de verdad
   * usada tanto por el envío inicial como por el reintento del admin.
   *   - todos los canales intentados entregados      → completed
   *   - al menos uno entregado y al menos uno fallido → partial_failure
   *   - todos los canales intentados fallidos         → failed
   *   - ningún canal intentado (diferido/sin destino) → completed
   * @param {string} notificationId
   * @param {Object} notificationType
   */
  async actualizarEstadoEntrega(notificationId, notificationType) {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) {
      return null;
    }
    const status = this._resolverEstadoEntrega(notification, notificationType);
    await this.notificationRepo.updateProcessingStatus(notificationId, status);
    return status;
  }

  /** @private */
  _resolverEstadoEntrega(notification, notificationType) {
    const category = notificationType.category || null;
    const channels = [];
    if (category?.supports_push ?? true) {
      channels.push({ sent: notification.push_sent, error: notification.push_error });
    }
    if (category?.supports_email ?? true) {
      channels.push({ sent: notification.email_sent, error: notification.email_error });
    }
    if (category?.supports_sms ?? false) {
      channels.push({ sent: notification.sms_sent, error: notification.sms_error });
    }

    // Solo cuentan los canales realmente intentados (entregados o con error registrado).
    // Los diferidos por quiet hours aún no se intentaron → se ignoran.
    const attempted = channels.filter(channel => channel.sent || channel.error);
    if (attempted.length === 0) {
      return Notification.PROCESSING_STATUS.COMPLETED;
    }

    const anyFailed = attempted.some(channel => !channel.sent && channel.error);
    const anyDelivered = attempted.some(channel => channel.sent);

    if (!anyFailed) {
      return Notification.PROCESSING_STATUS.COMPLETED;
    }
    if (!anyDelivered) {
      return Notification.PROCESSING_STATUS.FAILED;
    }
    return Notification.PROCESSING_STATUS.PARTIAL_FAILURE;
  }

  /**
   * Envía push individual con manejo de errores
   * @param {string} userId          - ID del usuario
   * @param {string} title
   * @param {string} body
   * @param {Object} metadata
   * @param {string} notificationId
   */
  async enviarPushIndividual(userId, title, body, metadata, notificationId) {
    try {
      const tokens = await this.userPushTokenRepo.findActiveByUser(userId);

      if (tokens.length === 0) {
        logger.warn('Usuario sin tokens push activos', { userId });
        return;
      }

      const promises = tokens.map(tokenData =>
        this.pushService.enviarPushIndividual(tokenData.token, title, body, metadata, notificationId).catch(err => {
          logger.warn('Error enviando a token específico', {
            error: err.message,
            token: `${tokenData.token.slice(0, TOKEN_LOG_PREVIEW_LENGTH)}...`
          });
          return { success: false, error: err.message };
        })
      );

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value && r.value.success !== false).length;

      if (successCount > 0) {
        await this.notificationRepo.markPushSent(notificationId);
        logger.info('Push individual enviado', {
          userId,
          successCount,
          totalTokens: tokens.length
        });
      } else {
        await this.notificationRepo.recordPushError(notificationId, 'Todos los envíos fallaron');
        logAudit(
          'PUSH_DELIVERY_FAILED',
          null,
          { notificationId, userId, error: 'Todos los tokens fallaron' },
          { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
        );
      }
    } catch (error) {
      logger.warn('Error al enviar push individual', { error: error.message, userId });
      await this.notificationRepo.recordPushError(notificationId, error.message);
      logAudit(
        'PUSH_DELIVERY_FAILED',
        null,
        { notificationId, userId, error: error.message },
        { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
      );
      // error ya registrado en notificationRepo.recordPushError — no re-lanzar
    }
  }

  /**
   * Envía email individual con manejo de errores
   * @param {string} userId          - ID del usuario
   * @param {Object} notificationType
   * @param {Object} metadata
   * @param {string} notificationId
   */
  async enviarEmailIndividual(userId, notificationType, metadata, notificationId) {
    try {
      let email;

      if (metadata.email) {
        email = metadata.email;
      } else {
        const user = await this.userRepo.findById(userId, {
          include: [
            {
              association: 'person',
              include: [{ association: 'contact' }]
            }
          ]
        });

        if (!user?.person?.contact?.email) {
          logger.warn('Usuario sin email', { userId });
          return;
        }

        email = user.person.contact.email;
      }

      // El email puede llegar cifrado (formato GCM ivHex:authTagHex:cipherHex) tanto desde
      // metadata (construido antes de descifrar) como desde un include anidado donde el hook
      // afterFind de PersonContact no se ejecuta. Descifrar en ambos casos antes de enviar.
      email = EncryptionUtil.safeDecrypt(email);

      await this.emailService.enviarNotificacion(email, notificationType, metadata, notificationId);
      await this.notificationRepo.markEmailSent(notificationId);

      logger.info('Email individual enviado', { userId, email });
    } catch (error) {
      logger.warn('Error al enviar email individual', { error: error.message, userId });
      await this.notificationRepo.recordEmailError(notificationId, error.message);
      logAudit(
        'EMAIL_DELIVERY_FAILED',
        null,
        { notificationId, userId, error: error.message },
        { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
      );
    }
  }

  /**
   * Envía SMS individual con manejo de errores. El teléfono sale de metadata.phone o del contacto
   * del usuario (person.contact.phone_primary + su prefijo de país), se descifra y se normaliza a E.164.
   * @param {string} userId
   * @param {string} body            - Texto base del SMS (se recorta a 160 caracteres)
   * @param {Object} metadata
   * @param {string} notificationId
   */
  async enviarSmsIndividual(userId, body, metadata, notificationId) {
    try {
      let phoneNumber;
      let prefixId = null;

      if (metadata.phone) {
        phoneNumber = metadata.phone;
        prefixId = metadata.phonePrefixId || null;
      } else {
        const user = await this.userRepo.findById(userId, {
          include: [{ association: 'person', include: [{ association: 'contact' }] }]
        });
        const contact = user?.person?.contact;

        if (!contact?.phone_primary) {
          logger.warn('Usuario sin teléfono', { userId });
          return;
        }

        // El teléfono puede llegar cifrado (formato GCM) cuando el hook afterFind no corre en el
        // include anidado. safeDecrypt es idempotente si ya viene en claro.
        phoneNumber = EncryptionUtil.safeDecrypt(contact.phone_primary);
        prefixId = contact.phone_primary_prefix_id || null;
      }

      const e164 = await this.smsService.resolveE164(phoneNumber, prefixId);
      const message = (body || '').slice(0, SMS_MAX_LENGTH);

      const result = await this.smsService.enviarSms({ phoneNumber: e164, message, userId, purpose: 'notification' });

      if (result?.success) {
        await this.notificationRepo.markSmsSent(notificationId);
        logger.info('SMS individual enviado', { userId });
      } else {
        const errorMsg = result?.error || 'Envío SMS fallido';
        await this.notificationRepo.recordSmsError(notificationId, errorMsg);
        logAudit(
          'SMS_DELIVERY_FAILED',
          null,
          { notificationId, userId, error: errorMsg },
          { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
        );
      }
    } catch (error) {
      logger.warn('Error al enviar SMS individual', { error: error.message, userId });
      await this.notificationRepo.recordSmsError(notificationId, error.message);
      logAudit(
        'SMS_DELIVERY_FAILED',
        null,
        { notificationId, userId, error: error.message },
        { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
      );
    }
  }

  /**
   * Procesa una notificación programada (llamado por el scheduler)
   * @param {Object} notification - Notificación de BD
   */
  async procesarNotificacionProgramada(notification) {
    try {
      // FIX: notification.notification_id en vez de notification.id
      await this.notificationRepo.updateProcessingStatus(notification.notification_id, Notification.PROCESSING_STATUS.PROCESSING);

      const notificationType = await this.notificationTypeRepo.findById(notification.notification_type_id, {
        include: [{ association: 'category' }]
      });

      if (!notificationType) {
        logger.warn('Tipo de notificación no encontrado', {
          notification_type_id: notification.notification_type_id
        });
        return;
      }

      const category = notificationType.category || null;
      const metadata = notification.metadata || {};

      // Push
      if ((category?.supports_push ?? true) && !notification.push_sent) {
        await this.enviarPushIndividual(
          notification.user_id,
          notification.title,
          notification.body,
          metadata,
          // FIX: notification.notification_id en vez de notification.id
          notification.notification_id
        );
      }

      // Email
      if ((category?.supports_email ?? true) && !notification.email_sent) {
        await this.enviarEmailIndividual(
          notification.user_id,
          notificationType,
          metadata,
          // FIX: notification.notification_id en vez de notification.id
          notification.notification_id
        );
      }

      // SMS
      if ((category?.supports_sms ?? false) && !notification.sms_sent) {
        await this.enviarSmsIndividual(notification.user_id, notification.body, metadata, notification.notification_id);
      }

      // FIX: notification.notification_id en vez de notification.id
      await this.actualizarEstadoEntrega(notification.notification_id, notificationType);
    } catch (error) {
      logger.warn('Error procesando notificación programada', {
        error: error.message,
        // FIX: notification.notification_id en vez de notification.id
        notification_id: notification.notification_id
      });
      // FIX: notification.notification_id en vez de notification.id
      await this.notificationRepo.updateProcessingStatus(notification.notification_id, Notification.PROCESSING_STATUS.FAILED);
    }
  }
}

module.exports = new NotificationSendingService();
module.exports.NotificationSendingService = NotificationSendingService;
