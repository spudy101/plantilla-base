import type { Notification } from '../../../shared/database/generated/prisma/client';
import type * as Types from '../notification.types';

/** 'email' → 'Email': sufijo de los campos supports<Canal> / allow<Canal> / <canal>Sent. */
const cap = <K extends string>(key: K) => (key.charAt(0).toUpperCase() + key.slice(1)) as Capitalize<K>;
import notificationRepo from '../repositories/notification.repository';
import notificationTypeRepo from '../repositories/notification-type.repository';
import userRepo from '../../iam/repositories/user.repository';
import userPushTokenRepo from '../repositories/user-push-token.repository';
import emailService from './email-notification.service';
import pushService from './push-notification.service';
import smsService from './sms.service';
import schedulerService from './notification-scheduler.service';
import EncryptionUtil from '../../../shared/security/encryption.util';
import domainEnumsModule from '../../../shared/constants/domain-enums';
const { NOTIFICATION_PROCESSING_STATUS } = domainEnumsModule;
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger, logAudit } = loggerUtilModule;
import errorMessageModule from '../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


const TOKEN_LOG_PREVIEW_LENGTH = 20;
const SMS_MAX_LENGTH = 160;

class NotificationSendingService {
  notificationRepo: typeof notificationRepo;
  notificationTypeRepo: typeof notificationTypeRepo;
  userRepo: typeof userRepo;
  userPushTokenRepo: typeof userPushTokenRepo;
  emailService: typeof emailService;
  pushService: typeof pushService;
  smsService: typeof smsService;
  schedulerService: typeof schedulerService;
  channels: NotificationSendingService.Channel[];

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationSendingService({ notificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationSendingService.Deps = {}) {
    this.notificationRepo = deps.notificationRepo ?? notificationRepo;
    this.notificationTypeRepo = deps.notificationTypeRepo ?? notificationTypeRepo;
    this.userRepo = deps.userRepo ?? userRepo;
    this.userPushTokenRepo = deps.userPushTokenRepo ?? userPushTokenRepo;
    this.emailService = deps.emailService ?? emailService;
    this.pushService = deps.pushService ?? pushService;
    this.smsService = deps.smsService ?? smsService;
    this.schedulerService = deps.schedulerService ?? schedulerService;
    // Canales de entrega (SOLID: O). Agregar un canal nuevo = sumar un descriptor aquí
    // (o inyectarlo por `deps.channels`), sin tocar el flujo de envío ni el cálculo de estado.
    this.channels = deps.channels ?? this._defaultChannels();
  }

  /**
   * Descriptor de canal:
   *   key                → nombre del canal; define las columnas `<key>_sent` / `<key>_error`,
   *                        el flag de categoría `supports_<key>` y la preferencia `allow_<key>`
   *   supportedByDefault → valor si la categoría no declara `supports_<key>`
   *   send(ctx)          → envía ahora
   *   schedule(ctx)      → difiere el envío (quiet hours)
   * ctx = { notificationId, userId, notificationType, title, body, metadata, userPreference }
   * @private
   */
  _defaultChannels(): NotificationSendingService.Channel[] {
    return [
      {
        key: 'push',
        supportedByDefault: true,
        send: ctx => this.enviarPushIndividual(ctx.userId, ctx.title, ctx.body, ctx.metadata, ctx.notificationId),
        schedule: ctx => this.schedulerService.programarEnvioPush(ctx.notificationId, ctx.userPreference)
      },
      {
        key: 'email',
        supportedByDefault: true,
        send: ctx => this.enviarEmailIndividual(ctx.userId, ctx.notificationType, ctx.metadata, ctx.notificationId),
        schedule: ctx => this.schedulerService.programarEnvioEmail(ctx.notificationId, ctx.userPreference)
      },
      {
        key: 'sms',
        supportedByDefault: false,
        send: ctx => this.enviarSmsIndividual(ctx.userId, ctx.body, ctx.metadata, ctx.notificationId),
        schedule: ctx => this.schedulerService.programarEnvioSms(ctx.notificationId, ctx.userPreference)
      }
    ];
  }

  /** @private — ¿la categoría del tipo soporta este canal? */
  _categorySupports(category: NotificationSendingService.CategoryChannels | null | undefined, channel: NotificationSendingService.Channel) {
    return category?.[`supports${cap(channel.key)}` as const] ?? channel.supportedByDefault;
  }

  async _procesarCanal(isQuietHours: boolean, isHighPriority: boolean, schedulerFn: () => Promise<unknown>, enviarFn: () => Promise<unknown>) {
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
    notificationId: string,
    userId: string,
    notificationType: NotificationSendingService.NotificationTypeSource,
    title: string,
    body: string,
    metadata: Record<string, unknown>,
    userPreference: NotificationSendingService.UserPreference,
    isQuietHours: boolean,
    isHighPriority: boolean
  ) {
    try {
      // Los canales soportados los define la CATEGORÍA del tipo (fuente de verdad). Cada canal
      // registra su propio resultado (markSent / recordError) y NO aborta el flujo: un fallo de
      // push no debe impedir email/SMS, ni viceversa. El estado final se deriva de los flags
      // reales del registro en actualizarEstadoEntrega().
      const category = notificationType.category || null;
      const ctx: NotificationSendingService.ChannelContext = { notificationId, userId, notificationType, title, body, metadata, userPreference };

      for (const channel of this.channels) {
        const allowedByUser = userPreference?.[`allow${cap(channel.key)}` as const] ?? true;
        if (this._categorySupports(category, channel) && allowedByUser) {
          await this._procesarCanal(
            isQuietHours,
            isHighPriority,
            () => channel.schedule(ctx),
            () => channel.send(ctx)
          );
        }
      }

      await this.actualizarEstadoEntrega(notificationId, notificationType);
    } catch (error) {
      logger.warn('Error en procesamiento individual', { error: errorMessage(error), notificationId });
      await this.notificationRepo.updateProcessingStatus(notificationId, NOTIFICATION_PROCESSING_STATUS.FAILED);
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
  async actualizarEstadoEntrega(notificationId: string, notificationType: NotificationSendingService.NotificationTypeSource) {
    const notification = await this.notificationRepo.findById(notificationId);
    if (!notification) {
      return null;
    }
    const status = this._resolverEstadoEntrega(notification, notificationType);
    await this.notificationRepo.updateProcessingStatus(notificationId, status);
    return status;
  }

  /** @private */
  _resolverEstadoEntrega(notification: Notification, notificationType: NotificationSendingService.NotificationTypeSource) {
    const category = notificationType.category || null;
    const channels = this.channels
      .filter(channel => this._categorySupports(category, channel))
      .map(channel => ({ sent: notification[`${channel.key}Sent` as const], error: notification[`${channel.key}Error` as const] }));

    // Solo cuentan los canales realmente intentados (entregados o con error registrado).
    // Los diferidos por quiet hours aún no se intentaron → se ignoran.
    const attempted = channels.filter(channel => channel.sent || channel.error);
    if (attempted.length === 0) {
      return NOTIFICATION_PROCESSING_STATUS.COMPLETED;
    }

    const anyFailed = attempted.some(channel => !channel.sent && channel.error);
    const anyDelivered = attempted.some(channel => channel.sent);

    if (!anyFailed) {
      return NOTIFICATION_PROCESSING_STATUS.COMPLETED;
    }
    if (!anyDelivered) {
      return NOTIFICATION_PROCESSING_STATUS.FAILED;
    }
    return NOTIFICATION_PROCESSING_STATUS.PARTIAL_FAILURE;
  }

  /**
   * Envía push individual con manejo de errores
   * @param {string} userId          - ID del usuario
   * @param {string} title
   * @param {string} body
   * @param {Object} metadata
   * @param {string} notificationId
   */
  async enviarPushIndividual(userId: string, title: string, body: string, metadata: Record<string, unknown>, notificationId: string) {
    try {
      const tokens = await this.userPushTokenRepo.findActiveByUser(userId);

      if (tokens.length === 0) {
        logger.warn('Usuario sin tokens push activos', { userId });
        return;
      }

      const promises = tokens.map(tokenData =>
        this.pushService.enviarPushIndividual(tokenData.token, title, body, metadata, notificationId).catch((err: unknown) => {
          logger.warn('Error enviando a token específico', {
            error: errorMessage(err),
            token: `${tokenData.token.slice(0, TOKEN_LOG_PREVIEW_LENGTH)}...`
          });
          return { success: false, error: errorMessage(err) };
        })
      );

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(
        r => r.status === 'fulfilled' && r.value && (r.value as { success?: boolean }).success !== false
      ).length;

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
      logger.warn('Error al enviar push individual', { error: errorMessage(error), userId });
      await this.notificationRepo.recordPushError(notificationId, errorMessage(error));
      logAudit(
        'PUSH_DELIVERY_FAILED',
        null,
        { notificationId, userId, error: errorMessage(error) },
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
  async enviarEmailIndividual(userId: string, notificationType: NotificationSendingService.NotificationTypeSource, metadata: Record<string, unknown>, notificationId: string) {
    try {
      let email: string;

      if (typeof metadata.email === 'string' && metadata.email) {
        email = metadata.email;
      } else {
        const user = await this.userRepo.findByUserId(userId, 'minimal');

        if (!user?.person?.contact?.email) {
          logger.warn('Usuario sin email', { userId });
          return;
        }

        email = user.person.contact.email;
      }

      // El de metadata puede llegar cifrado (formato GCM ivHex:authTagHex:cipherHex) si se armó antes
      // de descifrar; el del contacto ya llega en claro (piiExtension). safeDecrypt deja intacto el claro.
      email = EncryptionUtil.safeDecrypt(email);

      await this.emailService.enviarNotificacion(email, notificationType, metadata, notificationId);
      await this.notificationRepo.markEmailSent(notificationId);

      logger.info('Email individual enviado', { userId, email });
    } catch (error) {
      logger.warn('Error al enviar email individual', { error: errorMessage(error), userId });
      await this.notificationRepo.recordEmailError(notificationId, errorMessage(error));
      logAudit(
        'EMAIL_DELIVERY_FAILED',
        null,
        { notificationId, userId, error: errorMessage(error) },
        { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
      );
    }
  }

  /**
   * Envía SMS individual con manejo de errores. El teléfono sale de metadata.phone o del contacto
   * del usuario (person.contact.phonePrimary + su prefijo de país), se descifra y se normaliza a E.164.
   * @param {string} userId
   * @param {string} body            - Texto base del SMS (se recorta a 160 caracteres)
   * @param {Object} metadata
   * @param {string} notificationId
   */
  async enviarSmsIndividual(userId: string, body: string, metadata: Record<string, unknown>, notificationId: string) {
    try {
      let phoneNumber: string;
      let prefixId: string | null = null;

      if (typeof metadata.phone === 'string' && metadata.phone) {
        phoneNumber = metadata.phone;
        prefixId = typeof metadata.phonePrefixId === 'string' && metadata.phonePrefixId ? metadata.phonePrefixId : null;
      } else {
        const user = await this.userRepo.findByUserId(userId, 'minimal');
        const contact = user?.person?.contact;

        if (!contact?.phonePrimary) {
          logger.warn('Usuario sin teléfono', { userId });
          return;
        }

        // Ya llega descifrado (piiExtension); safeDecrypt es idempotente si viene en claro.
        phoneNumber = EncryptionUtil.safeDecrypt(contact.phonePrimary);
        prefixId = contact.phonePrimaryPrefixId || null;
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
      logger.warn('Error al enviar SMS individual', { error: errorMessage(error), userId });
      await this.notificationRepo.recordSmsError(notificationId, errorMessage(error));
      logAudit(
        'SMS_DELIVERY_FAILED',
        null,
        { notificationId, userId, error: errorMessage(error) },
        { entityId: notificationId, entityType: 'Notification', entityTable: 'notifications', outcome: 'failure' }
      );
    }
  }

  /**
   * Procesa una notificación programada (llamado por el scheduler)
   * @param {Object} notification - Notificación de BD
   */
  async procesarNotificacionProgramada(notification: Notification) {
    try {
      await this.notificationRepo.updateProcessingStatus(notification.notificationId, NOTIFICATION_PROCESSING_STATUS.PROCESSING);

      const notificationType = notification.notificationTypeId ? await this.notificationTypeRepo.findById(notification.notificationTypeId) : null;

      if (!notificationType) {
        logger.warn('Tipo de notificación no encontrado', {
          notificationTypeId: notification.notificationTypeId
        });
        return;
      }

      const category = notificationType.category || null;
      const ctx: NotificationSendingService.ChannelContext = {
        notificationId: notification.notificationId,
        userId: notification.userId,
        notificationType,
        title: notification.title,
        body: notification.body,
        metadata: (notification.metadata as Record<string, unknown> | null) || {}
      };

      // Reenvía solo los canales soportados que aún no se entregaron.
      for (const channel of this.channels) {
        if (this._categorySupports(category, channel) && !notification[`${channel.key}Sent` as const]) {
          await channel.send(ctx);
        }
      }

      await this.actualizarEstadoEntrega(notification.notificationId, notificationType);
    } catch (error) {
      logger.warn('Error procesando notificación programada', {
        error: errorMessage(error),
        notificationId: notification.notificationId
      });
      await this.notificationRepo.updateProcessingStatus(notification.notificationId, NOTIFICATION_PROCESSING_STATUS.FAILED);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationSendingService {
  export type ChannelKey = Types.ChannelKey;
  export type CategoryChannels = Types.CategoryChannels;
  export type NotificationTypeSource = Types.NotificationTypeSource;
  export type UserPreference = Types.UserPreference;

  export interface ChannelContext {
    notificationId: string;
    userId: string;
    notificationType: NotificationTypeSource;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
    userPreference?: UserPreference;
  }

  /** Descriptor de canal (SOLID: O): agregar un canal = agregar un descriptor. */
  export interface Channel {
    key: ChannelKey;
    /** valor si la categoría no declara supports<Key> */
    supportedByDefault: boolean;
    send(ctx: ChannelContext): Promise<unknown>;
    schedule(ctx: ChannelContext): Promise<unknown>;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    channels?: Channel[];
    notificationRepo?: typeof notificationRepo;
    notificationTypeRepo?: typeof notificationTypeRepo;
    userRepo?: typeof userRepo;
    userPushTokenRepo?: typeof userPushTokenRepo;
    emailService?: typeof emailService;
    pushService?: typeof pushService;
    smsService?: typeof smsService;
    schedulerService?: typeof schedulerService;
  }
}

export default Object.assign(new NotificationSendingService(), { NotificationSendingService });
