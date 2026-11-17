import { body } from 'express-validator';

const MIN_RETENTION_YEARS = 1;
// Resiliencia homologada de integraciones (RF-INT-01 CA-6). Rangos amplios pero acotados por seguridad.
const MIN_TIMEOUT_MS = 1000; // 1s
const MAX_TIMEOUT_MS = 120000; // 2 min
const MIN_MAX_RETRIES = 0;
const MAX_MAX_RETRIES = 10;
const MIN_CB_FAILURE_THRESHOLD = 1;
const MAX_CB_FAILURE_THRESHOLD = 100;
const MIN_CB_RECOVERY_MS = 1000; // 1s
const MAX_CB_RECOVERY_MS = 600000; // 10 min
const MIN_CB_TTL_S = 10;
const MAX_CB_TTL_S = 3600; // 1h

class SystemGlobalConfigValidator {
  static update() {
    return [
      body('currency').optional().trim().isLength({ min: 1, max: 10 }).withMessage({
        message: 'currency debe ser un código ISO 4217 de máximo 10 caracteres',
        hint: 'Usá un código ISO 4217 de 1 a 10 caracteres, por ejemplo COP'
      }),

      body('auditRetentionHotYears')
        .optional()
        .isInt({ min: MIN_RETENTION_YEARS })
        .withMessage({
          message: `auditRetentionHotYears debe ser un entero mayor o igual a ${MIN_RETENTION_YEARS}`,
          hint: `Ingresá un entero mayor o igual a ${MIN_RETENTION_YEARS}`
        })
        .toInt(),

      body('auditRetentionColdYears')
        .optional()
        .isInt({ min: MIN_RETENTION_YEARS })
        .withMessage({
          message: `auditRetentionColdYears debe ser un entero mayor o igual a ${MIN_RETENTION_YEARS}`,
          hint: `Ingresá un entero mayor o igual a ${MIN_RETENTION_YEARS}`
        })
        .toInt(),

      body('auditHotPurgeEnabled')
        .optional()
        .isBoolean()
        .withMessage({
          message: 'auditHotPurgeEnabled debe ser booleano',
          hint: 'Enviá true o false'
        })
        .toBoolean(),

      ...SystemGlobalConfigValidator._integrationResilienceRules()
    ];
  }

  // Resiliencia homologada de integraciones (RF-INT-01 CA-6). Bloque JSONB de merge parcial:
  // cada campo es opcional; lo que no se envía conserva su valor actual.
  static _integrationResilienceRules() {
    return [
      body('integrationResilience')
        .optional()
        .isObject()
        .withMessage({ message: 'integrationResilience debe ser un objeto', hint: 'Enviá un objeto JSON válido' }),

      body('integrationResilience.timeoutMs')
        .optional()
        .isInt({ min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS })
        .withMessage({
          message: `integrationResilience.timeoutMs debe ser un entero entre ${MIN_TIMEOUT_MS} y ${MAX_TIMEOUT_MS}`,
          hint: `Ingresá el timeout en ms, entre ${MIN_TIMEOUT_MS} y ${MAX_TIMEOUT_MS}`
        })
        .toInt(),

      body('integrationResilience.manualReviewTimeoutMs')
        .optional()
        .isInt({ min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS })
        .withMessage({
          message: `integrationResilience.manualReviewTimeoutMs debe ser un entero entre ${MIN_TIMEOUT_MS} y ${MAX_TIMEOUT_MS}`,
          hint: `Ingresá el timeout fast-fail en ms, entre ${MIN_TIMEOUT_MS} y ${MAX_TIMEOUT_MS}`
        })
        .toInt(),

      body('integrationResilience.maxRetries')
        .optional()
        .isInt({ min: MIN_MAX_RETRIES, max: MAX_MAX_RETRIES })
        .withMessage({
          message: `integrationResilience.maxRetries debe ser un entero entre ${MIN_MAX_RETRIES} y ${MAX_MAX_RETRIES}`,
          hint: `Ingresá el número de reintentos, entre ${MIN_MAX_RETRIES} y ${MAX_MAX_RETRIES}`
        })
        .toInt(),

      body('integrationResilience.circuitBreaker')
        .optional()
        .isObject()
        .withMessage({ message: 'integrationResilience.circuitBreaker debe ser un objeto', hint: 'Enviá un objeto JSON válido' }),

      body('integrationResilience.circuitBreaker.failureThreshold')
        .optional()
        .isInt({ min: MIN_CB_FAILURE_THRESHOLD, max: MAX_CB_FAILURE_THRESHOLD })
        .withMessage({
          message: `circuitBreaker.failureThreshold debe ser un entero entre ${MIN_CB_FAILURE_THRESHOLD} y ${MAX_CB_FAILURE_THRESHOLD}`,
          hint: `Ingresá el número de fallos para abrir el breaker, entre ${MIN_CB_FAILURE_THRESHOLD} y ${MAX_CB_FAILURE_THRESHOLD}`
        })
        .toInt(),

      body('integrationResilience.circuitBreaker.recoveryTimeMs')
        .optional()
        .isInt({ min: MIN_CB_RECOVERY_MS, max: MAX_CB_RECOVERY_MS })
        .withMessage({
          message: `circuitBreaker.recoveryTimeMs debe ser un entero entre ${MIN_CB_RECOVERY_MS} y ${MAX_CB_RECOVERY_MS}`,
          hint: `Ingresá el tiempo de recuperación en ms, entre ${MIN_CB_RECOVERY_MS} y ${MAX_CB_RECOVERY_MS}`
        })
        .toInt(),

      body('integrationResilience.circuitBreaker.failuresTtlS')
        .optional()
        .isInt({ min: MIN_CB_TTL_S, max: MAX_CB_TTL_S })
        .withMessage({
          message: `circuitBreaker.failuresTtlS debe ser un entero entre ${MIN_CB_TTL_S} y ${MAX_CB_TTL_S}`,
          hint: `Ingresá el TTL de la ventana de fallos en segundos, entre ${MIN_CB_TTL_S} y ${MAX_CB_TTL_S}`
        })
        .toInt()
    ];
  }
}

export default SystemGlobalConfigValidator;
