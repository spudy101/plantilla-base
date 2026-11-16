const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { logger } = require('../../../../shared/utils/logger.util');
const { withRetry } = require('../../../../shared/utils/retry.util');
const CircuitBreaker = require('../../../../shared/utils/circuit-breaker.util');
const ProviderApiLogger = require('../../../../shared/utils/integration-api-logger.util');
const { awsErrorCode } = require('../../../../shared/utils/aws-provider-meta.util');
const EncryptionUtil = require('../../../../shared/utils/encryption.util');
const { MOCKS, aws } = require('../../../../shared/constants');
const smsDeliveryAttemptRepository = require('../repositories/sms-delivery-attempt.repository');
const phonePrefixRepository = require('../../kyc/maintainers/repositories/phone-prefix.repository');

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
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new SmsService({ smsDeliveryAttemptRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.smsDeliveryAttemptRepository = deps.smsDeliveryAttemptRepository ?? smsDeliveryAttemptRepository;
    this.phonePrefixRepository = deps.phonePrefixRepository ?? phonePrefixRepository;
    // Sin snsClient se crea el cliente real al primer uso (getter snsClient)
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
        requestTimeout: SMS_TIMEOUT_MS
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
  async enviarSmsOtp({ phoneNumber, message, userId = null, purpose = 'otp_verification' }) {
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
      await this.smsDeliveryAttemptRepository.markFailed(attempt.sms_attempt_id, {
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
        attemptId: attempt.sms_attempt_id,
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
      await this.smsDeliveryAttemptRepository.markSent(attempt.sms_attempt_id, {
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

      return { success: true, attemptId: attempt.sms_attempt_id };
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      await CircuitBreaker.recordFailure(CB_PRODUCT);
      await this.smsDeliveryAttemptRepository.markFailed(attempt.sms_attempt_id, {
        lastError: error.message,
        retryCount: SMS_MAX_RETRIES
      });
      ProviderApiLogger.log({
        product: CB_PRODUCT,
        endpoint: ENDPOINT,
        result: 'failed',
        responseTimeMs,
        errorCode: awsErrorCode(error),
        errorMessage: error.message,
        requestPayload: { phoneHash, purpose, provider: PROVIDER },
        responsePayload: { message: error.message }
      });

      return {
        success: false,
        attemptId: attempt.sms_attempt_id,
        error: error.message,
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
  enviarSms({ phoneNumber, message, userId = null, purpose }) {
    return this.enviarSmsOtp({ phoneNumber, message, userId, purpose });
  }

  /**
   * Envío simulado: marca el intento como enviado y registra el consumo mock. NO llama a AWS SNS
   * ni al circuit breaker.
   * @private
   */
  async _mockEnvio(attempt) {
    logger.warn('[SMS] MODO MOCK ACTIVO — SMS no enviado realmente (OTP fijo en entornos no productivos)', {
      attemptId: attempt.sms_attempt_id,
      purpose: attempt.purpose
    });

    await this.smsDeliveryAttemptRepository.markSent(attempt.sms_attempt_id, {
      providerMessageId: `MOCK-${attempt.sms_attempt_id}`
    });

    ProviderApiLogger.log({
      product: CB_PRODUCT,
      endpoint: 'mock',
      queryNumber: `MOCK-${attempt.sms_attempt_id}`,
      result: 'success',
      responseTimeMs: 0
    });

    return { success: true, attemptId: attempt.sms_attempt_id, mock: true };
  }

  /**
   * Ejecuta el envío real por AWS SNS (SMS transaccional).
   * @returns {Promise<{ messageId: string }>}
   * @private
   */
  async _ejecutarEnvio({ phoneNumber, message }) {
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
  async resolveE164(localNumber, prefixId = null) {
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

module.exports = new SmsService();
module.exports.SmsService = SmsService;
