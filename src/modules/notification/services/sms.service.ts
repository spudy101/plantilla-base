import type { SmsDeliveryAttempt } from '../../../shared/database/generated/prisma/client';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
/** Lo único que se usa del cliente SNS (un doble de test solo necesita send). */
type SnsSender = Pick<InstanceType<typeof SNSClient>, 'send'>;
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logger } = loggerUtilModule;
import retryUtilModule from '../../../shared/infra/retry.util';
const { withRetry } = retryUtilModule;
import CircuitBreaker from '../../../shared/infra/circuit-breaker.util';
import ProviderApiLogger from '../../../shared/observability/integration-api-logger.util';
import awsProviderMetaUtilModule from '../../../shared/infra/aws-provider-meta.util';
const { awsErrorCode } = awsProviderMetaUtilModule;
import EncryptionUtil from '../../../shared/security/encryption.util';
import constantsModule from '../../../shared/constants';
const { MOCKS, aws } = constantsModule;
import smsDeliveryAttemptRepository from '../repositories/sms-delivery-attempt.repository';
import catalogsModule from '../../catalogs';
const { phonePrefixRepository } = catalogsModule;
import errorMessageModule from '../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


// === Envío de SMS vía AWS SNS ===
// Canal de SMS transaccional / OTP. Proveedor: AWS SNS. AWS es infraestructura fail-open: no se
// gatea por estado. El circuit breaker sobre el producto 'aws_sms' protege ante fallos de envío, y
// cada intento queda en sms_delivery_attempts + integration_api_logs (dashboard de monitoreo).

const CB_PRODUCT = 'aws_sms';
const PROVIDER = 'aws_sms';
const ENDPOINT = 'SNS:PublishCommand:SMS';
const SMS_TIMEOUT_MS = 30_000;
const SMS_MAX_RETRIES = 3;
const SMS_RETRY_BASE_MS = 1000;

class SmsService {
  smsDeliveryAttemptRepository: typeof smsDeliveryAttemptRepository;
  phonePrefixRepository: typeof phonePrefixRepository;
  _snsClient: SnsSender | null;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new SmsService({ smsDeliveryAttemptRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: SmsService.Deps = {}) {
    this.smsDeliveryAttemptRepository = deps.smsDeliveryAttemptRepository ?? smsDeliveryAttemptRepository;
    this.phonePrefixRepository = deps.phonePrefixRepository ?? phonePrefixRepository;
    // Sin snsClient se crea el cliente real al primer uso (getter snsClient)
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
        requestHandler: { requestTimeout: SMS_TIMEOUT_MS }
      });
    }
    return this._snsClient;
  }

  /**
   * Envía un SMS de verificación OTP.
   *
   * @param {Object}  params
   * @param {string}  params.phoneNumber  - Número en formato E.164 (+573001234567)
   * @param {string}  params.message      - Texto del SMS (máx 160 caracteres)
   * @param {string}  [params.userId]     - ID del usuario receptor (para trazabilidad)
   * @param {string}  [params.purpose]    - 'otp_verification' | 'mfa_login'
   * @returns {Promise<{success: boolean, attemptId: string, error?: string}>}
   */
  async enviarSmsOtp({
    phoneNumber,
    message,
    userId = null,
    purpose = 'otp_verification'
  }: {
    phoneNumber: string;
    message: string;
    userId?: string | null;
    purpose?: SmsService.Purpose;
  }): Promise<SmsService.SendResult> {
    const phoneHash = EncryptionUtil.generateHash(phoneNumber);

    const attempt = await this.smsDeliveryAttemptRepository.createAttempt({
      userId,
      phoneHash,
      provider: PROVIDER,
      purpose
    });

    // Modo mock (no-producción): no se golpea AWS SNS. El OTP ya se generó fijo (123456) en el
    // flujo que llama; aquí marcamos el intento como enviado y registramos el consumo simulado.
    if (MOCKS.EXTERNAL_PROVIDERS) {
      return this._mockEnvio(attempt);
    }

    // Circuit breaker (protege ante fallos repetidos de envío SNS).
    const allowed = await CircuitBreaker.canCall(CB_PRODUCT);
    if (!allowed) {
      await this.smsDeliveryAttemptRepository.markFailed(attempt.smsAttemptId, {
        lastError: 'Circuit breaker abierto — SMS (AWS SNS) no disponible'
      });
      ProviderApiLogger.log({
        product: CB_PRODUCT,
        endpoint: ENDPOINT,
        result: 'circuit_open',
        requestPayload: { phoneHash, purpose, provider: PROVIDER }
      });
      return {
        success: false,
        attemptId: attempt.smsAttemptId,
        error: 'Servicio SMS no disponible temporalmente',
        circuitOpen: true
      };
    }

    const startTime = Date.now();

    try {
      const result = await withRetry(() => this._ejecutarEnvio({ phoneNumber, message }), {
        maxRetries: SMS_MAX_RETRIES,
        baseDelayMs: SMS_RETRY_BASE_MS,
        label: `AWS-SMS[${CB_PRODUCT}]`
      });

      const responseTimeMs = Date.now() - startTime;
      await CircuitBreaker.recordSuccess(CB_PRODUCT);
      await this.smsDeliveryAttemptRepository.markSent(attempt.smsAttemptId, {
        providerMessageId: result.messageId || null
      });
      ProviderApiLogger.log({
        product: CB_PRODUCT,
        endpoint: ENDPOINT,
        result: 'success',
        responseTimeMs,
        requestPayload: { phoneHash, purpose, provider: PROVIDER },
        responsePayload: { messageId: result.messageId || null }
      });

      return { success: true, attemptId: attempt.smsAttemptId };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      await CircuitBreaker.recordFailure(CB_PRODUCT);
      await this.smsDeliveryAttemptRepository.markFailed(attempt.smsAttemptId, {
        lastError: errorMessage(error),
        retryCount: SMS_MAX_RETRIES
      });
      ProviderApiLogger.log({
        product: CB_PRODUCT,
        endpoint: ENDPOINT,
        result: 'failed',
        responseTimeMs,
        errorCode: awsErrorCode(error),
        errorMessage: errorMessage(error),
        requestPayload: { phoneHash, purpose, provider: PROVIDER },
        responsePayload: { message: errorMessage(error) }
      });

      return {
        success: false,
        attemptId: attempt.smsAttemptId,
        error: errorMessage(error),
        serviceUnavailable: true
      };
    }
  }

  /**
   * Envía un SMS transaccional genérico (no OTP). Alias semántico de enviarSmsOtp: reutiliza toda
   * la infraestructura (mock, circuit breaker, retry, tabla de intentos y logs).
   *
   * @param {Object} params
   * @param {string} params.phoneNumber  - Teléfono en formato E.164
   * @param {string} params.message      - Texto del SMS (máx 160 caracteres)
   * @param {string|null} [params.userId] - ID del receptor (null si no tiene cuenta)
   * @param {string} params.purpose      - Propósito para trazabilidad
   */
  enviarSms({
    phoneNumber,
    message,
    userId = null,
    purpose
  }: {
    phoneNumber: string;
    message: string;
    userId?: string | null;
    purpose: SmsService.Purpose;
  }) {
    return this.enviarSmsOtp({ phoneNumber, message, userId, purpose });
  }

  /**
   * Envío simulado: marca el intento como enviado y registra el consumo mock. NO llama a AWS SNS
   * ni al circuit breaker.
   * @private
   */
  async _mockEnvio(attempt: Pick<SmsDeliveryAttempt, 'smsAttemptId' | 'purpose'>) {
    logger.warn('[SMS] MODO MOCK ACTIVO — SMS no enviado realmente (OTP fijo en entornos no productivos)', {
      attemptId: attempt.smsAttemptId,
      purpose: attempt.purpose
    });

    await this.smsDeliveryAttemptRepository.markSent(attempt.smsAttemptId, {
      providerMessageId: `MOCK-${attempt.smsAttemptId}`
    });

    ProviderApiLogger.log({
      product: CB_PRODUCT,
      endpoint: 'mock',
      responsePayload: { providerMessageId: `MOCK-${attempt.smsAttemptId}` },
      result: 'success',
      responseTimeMs: 0
    });

    return { success: true, attemptId: attempt.smsAttemptId, mock: true };
  }

  /**
   * Ejecuta el envío real por AWS SNS (SMS transaccional).
   * @returns {Promise<{ messageId: string }>}
   * @private
   */
  async _ejecutarEnvio({ phoneNumber, message }: { phoneNumber: string; message: string }) {
    const response = await this.snsClient.send(
      new PublishCommand({
        Message: message,
        PhoneNumber: phoneNumber,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' }
        }
      })
    );
    return { messageId: response.MessageId || null };
  }

  /**
   * Construye el número en formato E.164 a partir del número local + el id de prefijo del país.
   * Si el número ya viene en E.164 (empieza con +) o no hay prefijo resoluble, se devuelve tal cual.
   *
   * @param {string} localNumber - Número local (o ya E.164)
   * @param {string} [prefixId]  - phone_prefix_id del país (ej: resuelve a '+56')
   * @returns {Promise<string>}
   */
  async resolveE164(localNumber: string, prefixId: string | null = null) {
    if (!localNumber || localNumber.startsWith('+')) {
      return localNumber;
    }
    if (!prefixId) {
      return localNumber;
    }
    const prefix = await this.phonePrefixRepository.findById(prefixId);
    return prefix?.prefix ? `${prefix.prefix}${localNumber}` : localNumber;
  }

  /**
   * Timeout configurado para la llamada (ms).
   */
  get timeoutMs() {
    return SMS_TIMEOUT_MS;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SmsService {
  /** Propósito del SMS, para trazabilidad en sms_delivery_attempts (texto libre en la columna). */
  export type Purpose = string;

  export interface SendResult {
    success: boolean;
    attemptId: string;
    error?: string;
    mock?: boolean;
    circuitOpen?: boolean;
    serviceUnavailable?: boolean;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    smsDeliveryAttemptRepository?: typeof smsDeliveryAttemptRepository;
    phonePrefixRepository?: typeof phonePrefixRepository;
    snsClient?: SnsSender;
  }
}

export default Object.assign(new SmsService(), { SmsService });
