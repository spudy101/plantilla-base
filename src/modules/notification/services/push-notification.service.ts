import { SNSClient, CreatePlatformEndpointCommand, DeleteEndpointCommand, PublishCommand } from '@aws-sdk/client-sns';
/** Lo único que se usa del cliente SNS (un doble de test solo necesita send). */
type SnsSender = Pick<InstanceType<typeof SNSClient>, 'send'>;
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = loggerUtilModule;
import AppError from '../../../shared/http/app-error.util';
import constantsModule from '../../../shared/constants';
const { notifications, aws } = constantsModule;
import retryUtilModule from '../../../shared/infra/retry.util';
const { withRetry } = retryUtilModule;
import ProviderApiLogger from '../../../shared/observability/integration-api-logger.util';
import awsProviderMetaUtilModule from '../../../shared/infra/aws-provider-meta.util';
const { resolveAwsGate, awsErrorCode } = awsProviderMetaUtilModule;
import errorMessageModule from '../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


class PushNotificationService {
  _snsClient: SnsSender | null;
  declare _PLATFORM_ARNS?: { ios: string; android: string };

  /**
   * Dependencias inyectables (SOLID: D). Sin snsClient se crea el cliente real al primer uso.
   *   new PushNotificationService({ snsClient: fake })
   * @param {object} [deps]
   */
  constructor(deps: PushNotificationService.Deps = {}) {
    this._snsClient = deps.snsClient ?? null;
  }

  get snsClient(): SnsSender {
    if (!this._snsClient) {
      this._snsClient = new SNSClient({
        region: aws.region,
        credentials: {
          accessKeyId: aws.accessKeyId,
          secretAccessKey: aws.secretAccessKey
        },
        // El timeout va en el handler HTTP: como opción directa del cliente el SDK v3 lo ignoraba
        requestHandler: { requestTimeout: 30_000 }
      });
    }
    return this._snsClient;
  }

  get PLATFORM_ARNS(): { ios: string; android: string } {
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
  async registrarDispositivo(deviceToken: string, platform: string, userId: string) {
    // FIX: La validación de plataforma se hace ANTES del try/catch.
    // Si estuviera dentro, el catch la atrapaba y la reenvolvía como
    // AppError.internal (500), pisando el statusCode 400 original.
    const platformArn = (this.PLATFORM_ARNS as Record<string, string | undefined>)[platform.toLowerCase()];
    if (!platformArn) {
      throw AppError.badRequest(`Plataforma no soportada: ${platform}`);
    }

    try {
      const command = new CreatePlatformEndpointCommand({
        PlatformApplicationArn: platformArn,
        Token: deviceToken,
        CustomUserData: userId
      });
      // getter (no el campo): el campo es null hasta el primer uso y registrar fallaba siempre en frío
      const response = await withRetry(() => this.snsClient.send(command), {
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
      logger.warn('Error al registrar dispositivo (reintentos agotados)', { error: errorMessage(error), userId, platform });
      throw AppError.internal('Error al registrar dispositivo para notificaciones');
    }
  }

  /**
   * Elimina un endpoint de SNS (desregistrar dispositivo)
   * @param {string} endpointArn - ARN del endpoint a eliminar
   */
  async eliminarDispositivo(endpointArn: string) {
    try {
      await withRetry(() => this.snsClient.send(new DeleteEndpointCommand({ EndpointArn: endpointArn })), {
        maxRetries: 3,
        baseDelayMs: 1000,
        label: 'SNS[eliminarDispositivo]'
      });
      logger.info('Dispositivo eliminado exitosamente', { endpointArn });
      return true;
    } catch (error) {
      logger.warn('Error al eliminar dispositivo (reintentos agotados)', { error: errorMessage(error), endpointArn });
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
  async enviarPushIndividual(
    endpointArn: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    notificationId: string | null = null
  ) {
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
        errorMessage: errorMessage(error),
        notificationId
      });
      logger.warn('Error al enviar push individual (reintentos agotados)', { error: errorMessage(error), endpointArn });
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
  async enviarPushMasivo(endpointArns: string[], title: string, body: string, data: Record<string, unknown> = {}) {
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
      logger.warn('Error al enviar push masivo', { error: errorMessage(error) });
      return { success: 0, failed: endpointArns.length };
    }
  }

  /**
   * Construye el mensaje en formato para iOS y Android
   * @private
   */
  _construirMensajePush(title: string, body: string, data = {}) {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PushNotificationService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    snsClient?: SnsSender;
  }
}

export default Object.assign(new PushNotificationService(), { PushNotificationService });
