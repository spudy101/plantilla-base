const globalNotificationRepo = require('../repositories/global-notification.repository');
const userNotificationPreferenceRepo = require('../../kyc/person/repositories/user-notification-preference.repository');
const userPushTokenRepo = require('../repositories/user-push-token.repository');
const redisClient = require('../../../../shared/utils/redis.util');
const localCache = require('../../../../shared/utils/cache.util');
const emailService = require('./email-notification.service');
const pushService = require('./push-notification.service');
const rateLimitService = require('./notification-rate-limit.service');
const { logger } = require('../../../../shared/utils/logger.util');
const { CLIENT_ROLE_NAMES } = require('../../../../shared/constants');

const CACHE_TTL_24H = 24 * 60 * 60; // segundos
const CACHE_CLEANUP_DELAY = 60 * 60 * 1000; // 1 hora en ms
const PUSH_BATCH_SIZE = 100;
const EMAIL_BATCH_SIZE = 50;
const BATCH_SLEEP_MS = 1000;

class NotificationBatchService {
  async _initBatchState(cache, globalNotificationId, totalUsers) {
    await cache.set(
      `global_notif:${globalNotificationId}:batch_state`,
      JSON.stringify({
        total_users: totalUsers,
        processed_users: 0,
        current_batch: 0,
        batch_size: PUSH_BATCH_SIZE,
        status: 'processing',
        started_at: new Date().toISOString()
      }),
      CACHE_TTL_24H
    );
  }

  _scheduleCacheCleanup(cache, globalNotificationId) {
    setTimeout(() => {
      cache
        .del(`global_notif:${globalNotificationId}:batch_state`)
        .catch(err => logger.warn('Error limpiando cache', { error: err.message }));
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
  async procesarNotificacionGlobal(globalNotificationId, notificationType, title, body, metadata) {
    try {
      const cache = redisClient.isAvailable() ? redisClient : localCache;
      const UserRepository = require('../../kyc/iam/repositories/user.repository');

      // Las notificaciones globales solo se envían a clientes finales (CLIENTE /
      // CLIENTE_VERIFICADO), nunca a usuarios internos ni entidades externas.
      const allUsers = await UserRepository.findActiveUsersByRoleNamesDetailed(CLIENT_ROLE_NAMES, {
        attributes: ['user_id']
      });
      const totalUsers = allUsers.length;

      await globalNotificationRepo.update(globalNotificationId, {
        total_target_users: totalUsers,
        processing_started_at: new Date()
      });

      await this._initBatchState(cache, globalNotificationId, totalUsers);

      // Los canales soportados los define la categoría del tipo. El filtrado de preferencias del
      // usuario también es por categoría (o global).
      const categoryCode = notificationType.category?.code ?? null;

      if (notificationType.category?.supports_push ?? true) {
        await globalNotificationRepo.updatePushProcessingStatus(globalNotificationId, 'processing');
        await this.enviarPushGlobalPorLotes(globalNotificationId, allUsers, title, body, metadata, categoryCode, cache);
        await globalNotificationRepo.updatePushProcessingStatus(globalNotificationId, 'completed');
      }

      if (notificationType.category?.supports_email ?? true) {
        await globalNotificationRepo.updateEmailProcessingStatus(globalNotificationId, 'processing');
        await this.enviarEmailGlobalPorLotes(globalNotificationId, allUsers, notificationType, metadata, categoryCode, cache);
        await globalNotificationRepo.updateEmailProcessingStatus(globalNotificationId, 'completed');
      }

      await globalNotificationRepo.update(globalNotificationId, {
        processing_completed_at: new Date()
      });
      this._scheduleCacheCleanup(cache, globalNotificationId);
    } catch (error) {
      logger.warn('Error en procesamiento global', { error: error.message, globalNotificationId });
      await globalNotificationRepo.update(globalNotificationId, {
        push_processing_status: 'failed',
        email_processing_status: 'failed'
      });
    }
  }

  /**
   * Envía push global por lotes con rate limiting
   */
  async enviarPushGlobalPorLotes(globalNotificationId, users, title, body, metadata, notificationTypeCode, cache) {
    try {
      const usersAllowingPush = await this._filtrarUsuariosPush(users, notificationTypeCode);

      logger.info('Usuarios que permiten push', {
        total: users.length,
        allowing: usersAllowingPush.length
      });

      const userIds = usersAllowingPush.map(u => u.user_id);
      const allTokens = await userPushTokenRepo.findActiveByUsers(userIds);

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

        await rateLimitService.checkSNSRateLimit(cache);

        logger.info(`Procesando lote push ${i + 1}/${totalBatches}`, {
          globalNotificationId,
          tokensEnLote: endpointArns.length
        });

        const stats = await pushService.enviarPushMasivo(endpointArns, title, body, metadata);

        totalSuccess += stats.success;
        totalFailed += stats.failed;

        await globalNotificationRepo.incrementPushSentCount(globalNotificationId, stats.success);
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
      logger.warn('Error al enviar push global', { error: error.message, globalNotificationId });
      throw error;
    }
  }

  async _procesarLoteEmail(batch, notificationType, metadata, globalNotificationId) {
    const EncryptionUtil = require('../../../../shared/utils/encryption.util');
    const GCM_PARTS_COUNT = 3;

    const promises = batch.map(user => {
      // Descifrar email si viene en formato GCM cifrado (ivHex:authTagHex:cipherHex)
      const rawEmail = user.person.contact.email;
      const parts = rawEmail?.split(':') ?? [];
      const email = parts.length === GCM_PARTS_COUNT ? EncryptionUtil.decrypt(rawEmail) : rawEmail;

      return emailService
        .enviarNotificacion(email, notificationType, metadata)
        .then(() => ({ success: true }))
        .catch(err => {
          logger.warn('Error enviando email', {
            error: err.message,
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
  async enviarEmailGlobalPorLotes(globalNotificationId, users, notificationType, metadata, notificationTypeCode, cache) {
    try {
      const usersAllowingEmail = await this._filtrarUsuariosEmail(users, notificationTypeCode);

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

        await rateLimitService.checkSESRateLimit(cache);
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

        await globalNotificationRepo.incrementEmailSentCount(globalNotificationId, successCount);

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
      logger.warn('Error al enviar email global', { error: error.message, globalNotificationId });
      throw error;
    }
  }

  /** @private */
  async _filtrarUsuariosPush(users, notificationTypeCode) {
    const allowed = [];
    for (const user of users) {
      const allowsPush = await userNotificationPreferenceRepo.userAllowsPush(user.user_id, notificationTypeCode);
      if (allowsPush) {
        allowed.push(user);
      }
    }
    return allowed;
  }

  /** @private */
  async _filtrarUsuariosEmail(users, notificationTypeCode) {
    const allowed = [];
    for (const user of users) {
      const allowsEmail = await userNotificationPreferenceRepo.userAllowsEmail(user.user_id, notificationTypeCode);
      if (allowsEmail && user.person?.contact?.email) {
        allowed.push(user);
      }
    }
    return allowed;
  }

  /** @private */
  async _actualizarEstadoLote(cache, globalNotificationId, batchNumber, batchSize) {
    try {
      const stateKey = `global_notif:${globalNotificationId}:batch_state`;
      const stateRaw = await cache.get(stateKey);

      if (stateRaw) {
        const state = typeof stateRaw === 'string' ? JSON.parse(stateRaw) : stateRaw;

        state.processed_users += batchSize;
        state.current_batch = batchNumber;
        state.last_batch_at = new Date().toISOString();

        await cache.set(stateKey, JSON.stringify(state), CACHE_TTL_24H);
      }
    } catch (error) {
      logger.warn('Error actualizando estado de lote en Redis', { error: error.message });
    }
  }

  /** @private */
  _sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}

module.exports = new NotificationBatchService();
