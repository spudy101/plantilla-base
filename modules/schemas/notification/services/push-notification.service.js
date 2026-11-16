const { SNSClient, CreatePlatformEndpointCommand, DeleteEndpointCommand, PublishCommand } = require('@aws-sdk/client-sns');
const { logger } = require('../../../../shared/utils/logger.util');
const AppError = require('../../../../shared/utils/app-error.util');
const { notifications, aws } = require('../../../../shared/constants');
const { withRetry } = require('../../../../shared/utils/retry.util');
const ProviderApiLogger = require('../../../../shared/utils/integration-api-logger.util');
const { resolveAwsGate, awsErrorCode } = require('../../../../shared/utils/aws-provider-meta.util');

class PushNotificationService {
  /**
   * Dependencias inyectables (SOLID: D). Sin snsClient se crea el cliente real al primer uso.
   *   new PushNotificationService({ snsClient: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this._snsClient = deps.snsClient ?? null;
  }

  get snsClient() {
    if (!this._snsClient) {
      this._snsClient = new SNSClient({
        region: aws.region,
        credentials: {
          accessKeyId: aws.accessKeyId,
          secretAccessKey: aws.secretAccessKey
        },
        requestTimeout: 30_000
      });
    }
    return this._snsClient;
  }

  get PLATFORM_ARNS() {
    if (!this._PLATFORM_ARNS) {
      this._PLATFORM_ARNS = {
        ios: notifications.sns.platformArnIos,
        android: notifications.sns.platformArnAndroid
      };
    }
    return this._PLATFORM_ARNS;
  }

  /**
   * Registra un dispositivo para recibir push notifications
   * @param {string} deviceToken - Token del dispositivo
   * @param {string} platform    - 'ios' o 'android'
   * @param {string} userId      - ID del usuario
   * @returns {Promise<string>} EndpointArn
   */
  async registrarDispositivo(deviceToken, platform, userId) {
    // FIX: La validación de plataforma se hace ANTES del try/catch.
    // Si estuviera dentro, el catch la atrapaba y la reenvolvía como
    // AppError.internal (500), pisando el statusCode 400 original.
    const platformArn = this.PLATFORM_ARNS[platform.toLowerCase()];
    if (!platformArn) {
      throw AppError.badRequest(`Plataforma no soportada: ${platform}`);
    }

    try {
      const command = new CreatePlatformEndpointCommand({
        PlatformApplicationArn: platformArn,
        Token: deviceToken,
        CustomUserData: userId
      });
      const response = await withRetry(() => this._snsClient.send(command), {
        maxRetries: 3,
        baseDelayMs: 1000,
        label: 'SNS[registrarDispositivo]'
      });

      logger.info('Dispositivo registrado exitosamente', {
        userId,
        platform,
        endpointArn: response.EndpointArn
      });

      return response.EndpointArn;
    } catch (error) {
      logger.warn('Error al registrar dispositivo (reintentos agotados)', { error: error.message, userId, platform });
      throw AppError.internal('Error al registrar dispositivo para notificaciones');
    }
  }

  /**
   * Elimina un endpoint de SNS (desregistrar dispositivo)
   * @param {string} endpointArn - ARN del endpoint a eliminar
   */
  async eliminarDispositivo(endpointArn) {
    try {
      await withRetry(() => this.snsClient.send(new DeleteEndpointCommand({ EndpointArn: endpointArn })), {
        maxRetries: 3,
        baseDelayMs: 1000,
        label: 'SNS[eliminarDispositivo]'
      });
      logger.info('Dispositivo eliminado exitosamente', { endpointArn });
      return true;
    } catch (error) {
      logger.warn('Error al eliminar dispositivo (reintentos agotados)', { error: error.message, endpointArn });
      throw AppError.internal('Error al eliminar dispositivo');
    }
  }

  /**
   * Envía una notificación push a un dispositivo específico
   * @param {string} endpointArn - ARN del endpoint
   * @param {string} title       - Título de la notificación
   * @param {string} body        - Cuerpo de la notificación
   * @param {Object} data        - Datos adicionales (opcional)
   * @param {string} [notificationId] - Para correlacionar el log de integración con la notificación
   */
  async enviarPushIndividual(endpointArn, title, body, data = {}, notificationId = null) {
    const { integrationId, unitCost } = await resolveAwsGate('aws_sns');
    const startTime = Date.now();
    try {
      const message = this._construirMensajePush(title, body, data);

      const response = await withRetry(
        () =>
          this.snsClient.send(
            new PublishCommand({
              TargetArn: endpointArn,
              Message: JSON.stringify(message),
              MessageStructure: 'json'
            })
          ),
        { maxRetries: 3, baseDelayMs: 1000, label: 'SNS[enviarPushIndividual]' }
      );

      ProviderApiLogger.log({
        product: 'sns',
        endpoint: 'SNS:PublishCommand',
        result: 'success',
        responseTimeMs: Date.now() - startTime,
        integrationId,
        unitCost,
        notificationId
      });
      logger.info('Push individual enviado exitosamente', { endpointArn, title });
      return response;
    } catch (error) {
      ProviderApiLogger.log({
        product: 'sns',
        endpoint: 'SNS:PublishCommand',
        result: 'failed',
        responseTimeMs: Date.now() - startTime,
        integrationId,
        errorCode: awsErrorCode(error),
        errorMessage: error.message,
        notificationId
      });
      logger.warn('Error al enviar push individual (reintentos agotados)', { error: error.message, endpointArn });
      return null;
    }
  }

  /**
   * Envía notificaciones push masivas a múltiples dispositivos
   * @param {Array<string>} endpointArns - Array de ARNs de endpoints
   * @param {string} title              - Título
   * @param {string} body               - Cuerpo
   * @param {Object} data               - Datos adicionales (opcional)
   * @returns {Promise<{ success: number, failed: number }>}
   */
  async enviarPushMasivo(endpointArns, title, body, data = {}) {
    try {
      const promises = endpointArns.map(arn =>
        this.enviarPushIndividual(arn, title, body, data)
          .then(() => ({ success: true }))
          .catch(() => ({ success: false }))
      );

      const results = await Promise.allSettled(promises);

      const stats = {
        success: results.filter(r => r.status === 'fulfilled' && r.value.success !== false).length,
        failed: results.filter(r => r.status === 'rejected' || r.value.success === false).length
      };

      logger.info('Push masivo completado', { ...stats, total: endpointArns.length, title });
      return stats;
    } catch (error) {
      logger.warn('Error al enviar push masivo', { error: error.message });
      return { success: 0, failed: endpointArns.length };
    }
  }

  /**
   * Construye el mensaje en formato para iOS y Android
   * @private
   */
  _construirMensajePush(title, body, data = {}) {
    return {
      default: body,
      APNS: JSON.stringify({
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1
        },
        data
      }),
      GCM: JSON.stringify({
        notification: { title, body, sound: 'default' },
        data
      })
    };
  }
}

module.exports = new PushNotificationService();
module.exports.PushNotificationService = PushNotificationService;
