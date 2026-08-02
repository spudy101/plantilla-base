// shared/base/circuit-breaker.bootstrap.js
//
// Registro NEUTRAL de los callbacks de fallback del circuit breaker.
// Invocado una sola vez por servidor desde BaseServer. Cubre todas las integraciones externas
// (AWS: SES/S3/SNS/SMS, y cualquier proveedor que envuelvas con CircuitBreaker) bajo el
// mismo estándar de observabilidad:
//
//   onOpen  → abre una ventana en provider_fallback_events + audita PROVIDER_FALLBACK_ACTIVATED
//   onClose → cierra la ventana (duración + impacto) + audita PROVIDER_FALLBACK_RESOLVED
//
// Todo corre dentro de requestContext.runAsSystem (source:'system').

const CircuitBreaker = require('../utils/circuit-breaker.util');
const requestContext = require('../utils/request-context.util');
const { logger, logAudit } = require('../utils/logger.util');
const providerFallbackRepository = require('../../modules/schemas/integration/repositories/provider-fallback-event.repository');

const MS_PER_SECOND = 1000;

// circuit_product → nombre de proveedor legible para el historial/dashboard.
const CIRCUIT_PRODUCT_TO_PROVIDER = {
  ses: 'aws_ses',
  s3: 'aws_s3',
  sns: 'aws_sns',
  aws_sms: 'aws_sms'
};

function _providerName(product) {
  return CIRCUIT_PRODUCT_TO_PROVIDER[product] || product;
}

// Best-effort: cuántos procesos quedaron en fallo durante la ventana del fallback. Solo se cuenta
// para productos con una tabla de intentos propia (hoy aws_sms). Cualquier error → null.
async function _contarProcesosAfectados(product, startedAt, endedAt) {
  try {
    if (product !== 'aws_sms') {
      return null;
    }
    const { Op } = require('sequelize');
    const { SmsDeliveryAttempt } = require('../models');
    const windowFilter = startedAt ? { [Op.between]: [startedAt, endedAt] } : { [Op.lte]: endedAt };
    return await SmsDeliveryAttempt.count({ where: { status: 'failed', created_at: windowFilter } });
  } catch {
    return null;
  }
}

function _onOpen(product, openedAt) {
  return requestContext.runAsSystem('circuit-breaker.fallback-open', async () => {
    try {
      await providerFallbackRepository.openFallback({
        provider: _providerName(product),
        circuitProduct: product,
        startedAt: new Date(openedAt)
      });
      logAudit('PROVIDER_FALLBACK_ACTIVATED', null, {
        provider: _providerName(product),
        product,
        openedAt: new Date(openedAt).toISOString()
      });
      logger.warn(`[CircuitBreaker] Fallback activado para ${product}`);
    } catch (err) {
      logger.error('[CircuitBreaker] Error registrando apertura de fallback', { error: err.message });
    }
  });
}

function _onClose(product, openedAt) {
  return requestContext.runAsSystem('circuit-breaker.fallback-close', async () => {
    try {
      const endedAt = new Date();
      const startedAt = openedAt ? new Date(openedAt) : null;
      const affectedCount = await _contarProcesosAfectados(product, startedAt, endedAt);

      await providerFallbackRepository.closeFallback({
        provider: _providerName(product),
        startedAt,
        endedAt,
        affectedCount
      });

      const durationSeconds = startedAt ? Math.round((endedAt - startedAt) / MS_PER_SECOND) : null;
      logAudit('PROVIDER_FALLBACK_RESOLVED', null, {
        provider: _providerName(product),
        product,
        openedAt: startedAt?.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
        affectedCount
      });
      logger.info(`[CircuitBreaker] Fallback resuelto para ${product}`, { affectedCount });
    } catch (err) {
      logger.error('[CircuitBreaker] Error registrando cierre de fallback', { error: err.message });
    }
  });
}

// Registra los callbacks globales del circuit breaker. Idempotente: solo setea dos
// referencias en el singleton del breaker. Se invoca una vez por servidor en el arranque.
function registerCircuitBreakerCallbacks() {
  CircuitBreaker.registerCallbacks({ onOpen: _onOpen, onClose: _onClose });
  logger.info('✅ Circuit breaker fallback callbacks registrados');
}

module.exports = { registerCircuitBreakerCallbacks };
