import { interopDefault } from '../../../shared/utils/interop.util';
import type { KeyValueCache } from '../../../shared/types/cache';
import type iamModule from '../../iam';
type UserRepositoryPort = (typeof iamModule)['userRepository'];
import type { UserProfileRow } from '../../iam';
import type { NotificationTypeWithCategory } from '../repositories/notification-type.repository';
import globalNotificationRepo from '../repositories/global-notification.repository';
import userNotificationPreferenceRepo from '../repositories/user-notification-preference.repository';
import userPushTokenRepo from '../repositories/user-push-token.repository';
import redisClient from '../../../shared/infra/redis.util';
import localCache from '../../../shared/infra/cache.util';
import emailService from './email-notification.service';
import pushService from './push-notification.service';
import rateLimitService from './notification-rate-limit.service';
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = loggerUtilModule;
import constantsModule from '../../../shared/constants';
const { CLIENT_ROLE_NAMES } = constantsModule;
import errorMessageModule from '../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


const CACHE_TTL_24H = 24 * 60 * 60; // segundos
const CACHE_CLEANUP_DELAY = 60 * 60 * 1000; // 1 hora en ms
const PUSH_BATCH_SIZE = 100;
const EMAIL_BATCH_SIZE = 50;
const BATCH_SLEEP_MS = 1000;

class NotificationBatchService {
  globalNotificationRepo: typeof globalNotificationRepo;
  userNotificationPreferenceRepo: typeof userNotificationPreferenceRepo;
  userPushTokenRepo: typeof userPushTokenRepo;
  emailService: typeof emailService;
  pushService: typeof pushService;
  rateLimitService: typeof rateLimitService;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new NotificationBatchService({ globalNotificationRepo: fake })
   * @param {object} [deps]
   */
  constructor(deps: NotificationBatchService.Deps = {}) {
    this.globalNotificationRepo = deps.globalNotificationRepo ?? globalNotificationRepo;
    this.userNotificationPreferenceRepo = deps.userNotificationPreferenceRepo ?? userNotificationPreferenceRepo;
    this.userPushTokenRepo = deps.userPushTokenRepo ?? userPushTokenRepo;
    this.emailService = deps.emailService ?? emailService;
    this.pushService = deps.pushService ?? pushService;
    this.rateLimitService = deps.rateLimitService ?? rateLimitService;
  }

  async _initBatchState(cache: KeyValueCache, globalNotificationId: string, totalUsers: number) {
    await cache.set(
      `global_notif:${globalNotificationId}:batch_state`,
      JSON.stringify({
        totalUsers,
        processedUsers: 0,
        currentBatch: 0,
        batchSize: PUSH_BATCH_SIZE,
        status: 'processing',
        startedAt: new Date().toISOString()
      }),
      CACHE_TTL_24H
    );
  }

  _scheduleCacheCleanup(cache: KeyValueCache, globalNotificationId: string) {
    setTimeout(() => {
      // Promise.resolve: la caché local es síncrona (del() devuelve un número) y encadenar .catch
      // directo lanzaba TypeError dentro del timer → uncaughtException → process.exit en producción.
      Promise.resolve()
        .then(() => cache.del(`global_notif:${globalNotificationId}:batch_state`))
        .catch((err: unknown) => logger.warn('Error limpiando cache', { error: errorMessage(err) }));
    }, CACHE_CLEANUP_DELAY);
  }

  /**
   * Procesa notificación global por lotes (push + email)
   * @param {string} globalNotificationId
   * @param {Object} notificationType
   * @param {string} title
   * @param {string} body
   * @param {Object} metadata
   */
  async procesarNotificacionGlobal(globalNotificationId: string, notificationType: NotificationTypeWithCategory, title: string, body: string, metadata: Record<string, unknown>) {
    try {
      const cache: KeyValueCache = redisClient.isAvailable() ? redisClient : localCache;
      const UserRepository = interopDefault(require('../../iam') as typeof import('../../iam')).userRepository as UserRepositoryPort;

      // Las notificaciones globales solo se envían a clientes finales (CLIENTE /
      // CLIENTE_VERIFICADO), nunca a usuarios internos ni entidades externas.
      const allUsers = await UserRepository.findActiveUsersByRoleNamesDetailed(CLIENT_ROLE_NAMES);
      const totalUsers = allUsers.length;

      await this.globalNotificationRepo.update(globalNotificationId, {
        totalTargetUsers: totalUsers,
        processingStartedAt: new Date()
      });

      await this._initBatchState(cache, globalNotificationId, totalUsers);

      // Los canales soportados los define la categoría del tipo; cada usuario filtra con su preferencia.

      if (notificationType.category?.supportsPush ?? true) {
        await this.globalNotificationRepo.updatePushProcessingStatus(globalNotificationId, 'processing');
        await this.enviarPushGlobalPorLotes(globalNotificationId, allUsers, title, body, metadata, cache);
        await this.globalNotificationRepo.updatePushProcessingStatus(globalNotificationId, 'completed');
      }

      if (notificationType.category?.supportsEmail ?? true) {
        await this.globalNotificationRepo.updateEmailProcessingStatus(globalNotificationId, 'processing');
        await this.enviarEmailGlobalPorLotes(globalNotificationId, allUsers, notificationType, metadata, cache);
        await this.globalNotificationRepo.updateEmailProcessingStatus(globalNotificationId, 'completed');
      }

      await this.globalNotificationRepo.update(globalNotificationId, {
        processingCompletedAt: new Date()
      });
      this._scheduleCacheCleanup(cache, globalNotificationId);
    } catch (error) {
      logger.warn('Error en procesamiento global', { error: errorMessage(error), globalNotificationId });
      await this.globalNotificationRepo.update(globalNotificationId, {
        pushProcessingStatus: 'failed',
        emailProcessingStatus: 'failed'
      });
    }
  }

  /**
   * Envía push global por lotes con rate limiting
   */
  async enviarPushGlobalPorLotes(
    globalNotificationId: string,
    users: UserProfileRow[],
    title: string,
    body: string,
    metadata: Record<string, unknown>,
    cache: KeyValueCache
  ) {
    try {
      const usersAllowingPush = await this._filtrarUsuariosPush(users);

      logger.info('Usuarios que permiten push', {
        total: users.length,
        allowing: usersAllowingPush.length
      });

      const userIds = usersAllowingPush.map(u => u.userId);
      const allTokens = await this.userPushTokenRepo.findActiveByUsers(userIds);

      if (allTokens.length === 0) {
        logger.warn('No hay tokens activos para push global');
        return;
      }

      const totalBatches = Math.ceil(allTokens.length / PUSH_BATCH_SIZE);

      logger.info('Iniciando envío push global por lotes', {
        globalNotificationId,
        totalTokens: allTokens.length,
        batchSize: PUSH_BATCH_SIZE,
        totalBatches
      });

      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < totalBatches; i++) {
        const batch = allTokens.slice(i * PUSH_BATCH_SIZE, (i + 1) * PUSH_BATCH_SIZE);
        const endpointArns = batch.map(t => t.token);

        await this.rateLimitService.checkSNSRateLimit(cache);

        logger.info(`Procesando lote push ${i + 1}/${totalBatches}`, {
          globalNotificationId,
          tokensEnLote: endpointArns.length
        });

        const stats = await this.pushService.enviarPushMasivo(endpointArns, title, body, metadata);

        totalSuccess += stats.success;
        totalFailed += stats.failed;

        await this.globalNotificationRepo.incrementPushSentCount(globalNotificationId, stats.success);
        await this._actualizarEstadoLote(cache, globalNotificationId, i + 1, batch.length);

        if (i < totalBatches - 1) {
          await this._sleep(BATCH_SLEEP_MS);
        }
      }

      logger.info('Push global completado', {
        globalNotificationId,
        totalTokens: allTokens.length,
        success: totalSuccess,
        failed: totalFailed
      });
    } catch (error) {
      logger.warn('Error al enviar push global', { error: errorMessage(error), globalNotificationId });
      throw error;
    }
  }

  async _procesarLoteEmail(
    batch: UserProfileRow[],
    notificationType: NotificationTypeWithCategory,
    metadata: Record<string, unknown>,
    globalNotificationId: string
  ) {
    const EncryptionUtil = interopDefault(
      require('../../../shared/security/encryption.util') as typeof import('../../../shared/security/encryption.util')
    );
    const GCM_PARTS_COUNT = 3;

    const promises = batch.map(user => {
      // Descifrar email si viene en formato GCM cifrado (ivHex:authTagHex:cipherHex)
      // _filtrarUsuariosEmail ya descartó a quien no tiene email
      const rawEmail = user.person?.contact?.email ?? '';
      const parts = rawEmail.split(':');
      const email = parts.length === GCM_PARTS_COUNT ? EncryptionUtil.decrypt(rawEmail) : rawEmail;

      return this.emailService
        .enviarNotificacion(email, notificationType, metadata)
        .then(() => ({ success: true }))
        .catch((err: unknown) => {
          logger.warn('Error enviando email', {
            error: errorMessage(err),
            email, // ahora loguea el email real, no el cifrado
            globalNotificationId
          });
          return { success: false };
        });
    });

    const results = await Promise.allSettled(promises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failedCount = batch.length - successCount;

    return { successCount, failedCount };
  }

  /**
   * Envía email global por lotes con rate limiting
   */
  async enviarEmailGlobalPorLotes(
    globalNotificationId: string,
    users: UserProfileRow[],
    notificationType: NotificationTypeWithCategory,
    metadata: Record<string, unknown>,
    cache: KeyValueCache
  ) {
    try {
      const usersAllowingEmail = await this._filtrarUsuariosEmail(users);

      logger.info('Usuarios que permiten email', {
        total: users.length,
        allowing: usersAllowingEmail.length
      });

      if (usersAllowingEmail.length === 0) {
        logger.warn('No hay usuarios con email habilitado');
        return;
      }

      const totalBatches = Math.ceil(usersAllowingEmail.length / EMAIL_BATCH_SIZE);

      logger.info('Iniciando envío email global por lotes', {
        globalNotificationId,
        totalEmails: usersAllowingEmail.length,
        batchSize: EMAIL_BATCH_SIZE,
        totalBatches
      });

      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < totalBatches; i++) {
        const batch = usersAllowingEmail.slice(i * EMAIL_BATCH_SIZE, (i + 1) * EMAIL_BATCH_SIZE);

        await this.rateLimitService.checkSESRateLimit(cache);
        logger.info(`Procesando lote email ${i + 1}/${totalBatches}`, {
          globalNotificationId,
          emailsEnLote: batch.length
        });

        const { successCount, failedCount } = await this._procesarLoteEmail(
          batch,
          notificationType,
          metadata,
          globalNotificationId
        );

        totalSuccess += successCount;
        totalFailed += failedCount;

        await this.globalNotificationRepo.incrementEmailSentCount(globalNotificationId, successCount);

        if (i < totalBatches - 1) {
          await this._sleep(BATCH_SLEEP_MS);
        }
      }

      logger.info('Email global completado', {
        globalNotificationId,
        totalEmails: usersAllowingEmail.length,
        success: totalSuccess,
        failed: totalFailed
      });
    } catch (error) {
      logger.warn('Error al enviar email global', { error: errorMessage(error), globalNotificationId });
      throw error;
    }
  }

  /** @private */
  async _filtrarUsuariosPush(users: UserProfileRow[]) {
    const allowed: UserProfileRow[] = [];
    for (const user of users) {
      const allowsPush = (await this.userNotificationPreferenceRepo.findByUser(user.userId))?.allowPush ?? true;
      if (allowsPush) {
        allowed.push(user);
      }
    }
    return allowed;
  }

  /** @private */
  async _filtrarUsuariosEmail(users: UserProfileRow[]) {
    const allowed: UserProfileRow[] = [];
    for (const user of users) {
      const allowsEmail = (await this.userNotificationPreferenceRepo.findByUser(user.userId))?.allowEmail ?? true;
      if (allowsEmail && user.person?.contact?.email) {
        allowed.push(user);
      }
    }
    return allowed;
  }

  /** @private */
  async _actualizarEstadoLote(cache: KeyValueCache, globalNotificationId: string, batchNumber: number, batchSize: number) {
    try {
      const stateKey = `global_notif:${globalNotificationId}:batch_state`;
      const stateRaw = await cache.get(stateKey);

      if (stateRaw) {
        const state = (typeof stateRaw === 'string' ? JSON.parse(stateRaw) : stateRaw) as Record<string, unknown> & { processedUsers?: number };

        // Un estado escrito antes de pasar a camelCase (TTL 24 h) arranca la cuenta desde 0
        state.processedUsers = (state.processedUsers ?? 0) + batchSize;
        state.currentBatch = batchNumber;
        state.lastBatchAt = new Date().toISOString();

        await cache.set(stateKey, JSON.stringify(state), CACHE_TTL_24H);
      }
    } catch (error) {
      logger.warn('Error actualizando estado de lote en Redis', { error: errorMessage(error) });
    }
  }

  /** @private */
  _sleep(ms: number) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationBatchService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    globalNotificationRepo?: typeof globalNotificationRepo;
    userNotificationPreferenceRepo?: typeof userNotificationPreferenceRepo;
    userPushTokenRepo?: typeof userPushTokenRepo;
    emailService?: typeof emailService;
    pushService?: typeof pushService;
    rateLimitService?: typeof rateLimitService;
  }
}

export default Object.assign(new NotificationBatchService(), { NotificationBatchService });
