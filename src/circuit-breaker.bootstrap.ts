// shared/base/circuit-breaker.bootstrap.ts
//
// Registro NEUTRAL de los callbacks de fallback del circuit breaker.
// Invocado una sola vez al arrancar, desde src/server.ts. Cubre todas las integraciones externas
// (AWS: SES/S3/SNS/SMS, y cualquier proveedor que envuelvas con CircuitBreaker) bajo el
// mismo estándar de observabilidad:
//
//   onOpen  → abre una ventana en provider_fallback_events + audita PROVIDER_FALLBACK_ACTIVATED
//   onClose → cierra la ventana (duración + impacto) + audita PROVIDER_FALLBACK_RESOLVED
//
// Todo corre dentro de runOperation({ source: 'system' }).

import { interopDefault } from './shared/utils/interop.util';
import CircuitBreaker from './shared/infra/circuit-breaker.util';
import { runOperation } from './shared/observability/operation';
import loggerUtilModule from './shared/observability/logger.util';
const { logger, logAudit } = loggerUtilModule;
import providerFallbackRepository from './modules/integration/repositories/provider-fallback-event.repository';
import errorMessageModule from './shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


const MS_PER_SECOND = 1000;

// circuit_product → nombre de proveedor legible para el historial/dashboard.
const CIRCUIT_PRODUCT_TO_PROVIDER: Record<string, string> = {
  ses: 'aws_ses',
  s3: 'aws_s3',
  sns: 'aws_sns',
  aws_sms: 'aws_sms'
};

function _providerName(product: string) {
  return CIRCUIT_PRODUCT_TO_PROVIDER[product] || product;
}

// Best-effort: cuántos procesos quedaron en fallo durante la ventana del fallback. Solo se cuenta
// para productos con una tabla de intentos propia (hoy aws_sms). Cualquier error → null.
async function _contarProcesosAfectados(product: string, startedAt: Date | null, endedAt: Date): Promise<number | null> {
  try {
    if (product !== 'aws_sms') {
      return null;
    }
    // require diferido: como antes con shared/models, no cargar repositorios al importar el bootstrap
    const smsDeliveryAttemptRepository = interopDefault(
      require('./modules/notification/repositories/sms-delivery-attempt.repository') as typeof import('./modules/notification/repositories/sms-delivery-attempt.repository')
    );
    return await smsDeliveryAttemptRepository.countFailedBetween(startedAt, endedAt);
  } catch {
    return null;
  }
}

function _onOpen(product: string, openedAt: number | null) {
  return runOperation({ source: 'system', name: 'circuit-breaker.fallback-open' }, async () => {
    try {
      await providerFallbackRepository.openFallback({
        provider: _providerName(product),
        circuitProduct: product,
        startedAt: new Date(openedAt ?? Date.now())
      });
      logAudit('PROVIDER_FALLBACK_ACTIVATED', null, {
        provider: _providerName(product),
        product,
        openedAt: new Date(openedAt ?? Date.now()).toISOString()
      });
      logger.warn(`[CircuitBreaker] Fallback activado para ${product}`);
    } catch (err) {
      logger.error('[CircuitBreaker] Error registrando apertura de fallback', { error: errorMessage(err) });
    }
  });
}

function _onClose(product: string, openedAt: number | null) {
  return runOperation({ source: 'system', name: 'circuit-breaker.fallback-close' }, async () => {
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

      const durationSeconds = startedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / MS_PER_SECOND) : null;
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
      logger.error('[CircuitBreaker] Error registrando cierre de fallback', { error: errorMessage(err) });
    }
  });
}

// Registra los callbacks globales del circuit breaker. Idempotente: solo setea dos
// referencias en el singleton del breaker. Se invoca una vez por servidor en el arranque.
function registerCircuitBreakerCallbacks() {
  CircuitBreaker.registerCallbacks({ onOpen: _onOpen, onClose: _onClose });
  logger.info('✅ Circuit breaker fallback callbacks registrados');
}

export default { registerCircuitBreakerCallbacks };
