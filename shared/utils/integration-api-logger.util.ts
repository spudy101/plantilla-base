/**
 * IntegrationApiLogger — logger no bloqueante para todos los consumos de integraciones externas
 * (en este template: solo AWS — SES / S3 / SNS / SMS por SNS).
 *
 * Uso:
 *   ProviderApiLogger.log({ product, endpoint, result, responseTimeMs, errorCode, errorMessage, ... })
 *
 * El log se persiste en `integration_api_logs` con setImmediate para no bloquear el flujo principal.
 * Los errores de persistencia solo se loguean — nunca propagan.
 *
 * Anclaje de sesión: si el call-site no pasa userId/sessionId explícitos, se auto-capturan del
 * request-context (AsyncLocalStorage) — así el dashboard sabe QUIÉN llamó y en QUÉ sesión sin que
 * cada wrapper AWS tenga que propagarlos a mano. En workers/procesos de sistema quedan en null.
 *
 * Productos válidos (ENUM del modelo): 'ses' | 's3' | 'sns' | 'aws_sms'
 */

import { interopDefault } from './interop.util';
import loggerUtilModule from './logger.util';
const { logger } = loggerUtilModule;
import requestContext from './request-context.util';
import errorMessageModule from './error-message.util';
import type DomainEnums from '../constants/domain-enums';

// Se usa como errorMessageModule.errorMessage(…): `log()` recibe un parámetro llamado errorMessage.

interface ApiLogEntry {
  product: DomainEnums.IntegrationProduct;
  endpoint: string;
  userId?: string | null;
  sessionId?: string | null;
  result: DomainEnums.IntegrationResult;
  responseTimeMs?: number | null;
  errorCode?: string | number | null;
  errorMessage?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  isSystemError?: boolean;
  notificationId?: string | null;
  /** Metadatos de gating/costo del proveedor (resolveAwsGate). Hoy no se persisten. */
  integrationId?: string | null;
  unitCost?: number | null;
}


// Claves cuyo valor NUNCA debe persistirse (credenciales/secretos). Defensa en profundidad:
// aunque el call-site pase un body crudo, el logger lo redacta antes de guardar.
const SENSITIVE_KEY = /pass(word)?|secret|authorization|access_token|client_secret|api_?key|token/i;
const MAX_DEPTH = 12;

/**
 * Clona en profundidad un payload redactando claves sensibles. Protege contra
 * referencias circulares (seen) y estructuras muy profundas (MAX_DEPTH).
 */
/** Copia sin secretos (redacta claves sensibles) y sin ciclos; profundidad acotada. */
function _sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH || seen.has(value)) {
    return '[truncated]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => _sanitize(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : _sanitize(val, depth + 1, seen);
  }
  return out;
}

// Toma el userId/sessionId del contexto de la request activa (si no vienen explícitos).
function _resolveOrigin(userId: string | null, sessionId: string | null): { userId: string | null; sessionId: string | null } {
  if (userId && sessionId) {
    return { userId, sessionId };
  }
  const ctx = requestContext.get();
  return {
    userId: userId ?? ctx?.userId ?? null,
    sessionId: sessionId ?? ctx?.sessionId ?? null
  };
}

class IntegrationApiLogger {
  /**
   * Registra un consumo de una integración externa de forma no bloqueante.
   *
   * @param {Object}  params
   * @param {string}  params.product          - 'ses' | 's3' | 'sns' | 'aws_sms'
   * @param {string}  params.endpoint         - Operación/endpoint invocado
   * @param {string}  [params.userId]         - Usuario que originó la llamada (default: request-context)
   * @param {string}  [params.sessionId]      - Sesión anclada a la llamada (default: request-context)
   * @param {string}  params.result           - 'success' | 'failed' | 'circuit_open'
   * @param {number}  [params.responseTimeMs] - Tiempo de respuesta en ms
   * @param {string}  [params.errorCode]      - Código de error del proveedor
   * @param {string}  [params.errorMessage]   - Mensaje de error
   * @param {Object}  [params.requestPayload]  - Payload enviado (se sanitiza)
   * @param {Object}  [params.responsePayload] - Respuesta cruda del proveedor (se sanitiza)
   * @param {boolean} [params.isSystemError]   - true = payload inválido señalado por el proveedor (bug nuestro)
   * @param {string}  [params.notificationId]  - Notificación asociada (SES/SNS), para correlacionar reintentos
   *
   * Nota: se aceptan (e ignoran) `integrationId`, `unitCost`, `personId`, `queryNumber` por
   * compatibilidad con call-sites heredados; este template no gestiona catálogo de integraciones.
   */
  log({
    product,
    endpoint,
    userId = null,
    sessionId = null,
    result,
    responseTimeMs = null,
    errorCode = null,
    errorMessage = null,
    requestPayload = null,
    responsePayload = null,
    isSystemError = false,
    notificationId = null
  }: ApiLogEntry): void {
    const origin = _resolveOrigin(userId, sessionId);

    setImmediate(async () => {
      try {
        // Carga lazy: el repositorio (y los modelos) dependen del logger
        const integrationApiLogRepository = interopDefault(
          require('../../modules/schemas/integration/repositories/integration-api-log.repository') as typeof import('../../modules/schemas/integration/repositories/integration-api-log.repository')
        );

        await integrationApiLogRepository.create({
          product,
          endpoint,
          user_id: origin.userId,
          session_id: origin.sessionId,
          result,
          response_time_ms: responseTimeMs ?? null,
          error_code: errorCode ? String(errorCode) : null,
          error_message: errorMessage || null,
          request_payload: requestPayload ? _sanitize(requestPayload) : null,
          response_payload: responsePayload ? _sanitize(responsePayload) : null,
          is_system_error: isSystemError === true,
          notification_id: notificationId || null
        });
      } catch (err) {
        logger.warn('[IntegrationApiLogger] Error persistiendo log de API', {
          product,
          result,
          error: errorMessageModule.errorMessage(err)
        });
      }
    });
  }
}

export default Object.assign(new IntegrationApiLogger(), { IntegrationApiLogger });
