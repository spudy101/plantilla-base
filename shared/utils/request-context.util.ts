// === RF-OPS-01: Pipeline DevSecOps, Infraestructura Base ===
import { interopDefault } from './interop.util';
import asyncHooksModule from 'node:async_hooks';
const { AsyncLocalStorage } = asyncHooksModule;
import crypto from 'node:crypto';
import errorMessageModule from './error-message.util';

const { errorMessage } = errorMessageModule;


// [RF-OPS-01] | CA-03 | AsyncLocalStorage propaga el contexto
// del request (correlationId, userId) a través de toda la cadena
// de llamadas sin necesidad de pasarlo como parámetro.
/**
 * Contexto de la operación en curso (petición HTTP, worker o tarea de sistema).
 * Lo crea audit.middleware (source 'http') o runAsWorker / runAsSystem; auth.middleware le agrega
 * sessionId/userId al autenticar (la referencia es viva: la mutación se propaga a toda la cadena).
 */
interface RequestContext {
  /** undefined solo si audit.middleware corre sin correlation.middleware antes. */
  correlationId: string | undefined;
  ip: string | null | undefined;
  userAgent: string | null;
  fingerprintHash: string | null;
  method: string | null;
  path: string | null;
  source: 'http' | 'worker' | 'system' | 'unknown' | string;
  query?: unknown;
  body?: unknown;
  timestamp?: string;
  sessionId?: string | null;
  userId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Construye el contexto sintético de un proceso SIN request HTTP
 * (cron/worker o evento de infraestructura). Mantiene la MISMA forma que el
 * auditContext de las rutas para que logAudit/logger lo consuman igual, pero con
 * un correlationId estable por ciclo y un source explícito.
 *
 * @param {'worker'|'system'} source - origen del proceso
 * @param {string} label             - etiqueta del ciclo (ej: 'screening.pending')
 * @returns {Object}
 */
const _buildInternalContext = (source: string, label: string): RequestContext => ({
  correlationId: `${source}-${label}-${crypto.randomUUID().slice(0, 8)}`,
  ip: 'internal',
  userAgent: null,
  fingerprintHash: null,
  method: null,
  path: label,
  source
});

// Ejecuta el ciclo de un worker capturando cualquier excepción que escape: deja
// un logAudit('WORKER_CYCLE_FAILED') con outcome failure y traga el error para no
// tumbar el proceso del cron. Es el ÚNICO punto de captura del ciclo — los
// callbacks de cron ya no llevan try/catch propio.
// require lazy de logger.util para evitar la dependencia circular en la carga.
const _runWorkerGuarded = async <T>(label: string, fn: () => T | Promise<T>): Promise<T | undefined> => {
  try {
    return await fn();
  } catch (error) {
    const { logger, logAudit } = interopDefault(require('./logger.util') as typeof import('./logger.util'));
    logger.error(`[worker] Ciclo abortado por excepción no controlada: ${label}`, {
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    logAudit(
      'WORKER_CYCLE_FAILED',
      'system',
      { worker: label, error: errorMessage(error) },
      { outcome: 'failure', entityType: 'Worker', errorMessage: errorMessage(error) }
    );
    return undefined;
  }
};

export default {
  /**
   * Inicia el contexto para una request HTTP.
   * Llamado desde audit.middleware — propaga el auditContext
   * automáticamente a toda la cadena async de esa request.
   *
   * @param {Object} context - auditContext generado por audit.middleware
   * @param {Function} fn    - next() de Express
   */
  run: <T>(context: RequestContext, fn: () => T): T => storage.run(context, fn),

  /**
   * Obtiene el contexto de la request actual.
   * Retorna undefined si se llama desde un worker o contexto sin request.
   *
   * @returns {Object|undefined}
   */
  get: (): RequestContext | undefined => storage.getStore(),

  /**
   * Envuelve UN ciclo de ejecución de un cron/worker en su propio contexto.
   * Todos los logger y logAudit dentro de fn comparten el mismo correlationId
   * (`worker-<label>-<rand>`) y quedan con source 'worker'.
   *
   * @param {string}   label - etiqueta del ciclo (ej: 'notification.scheduled')
   * @param {Function} fn    - cuerpo del ciclo (async)
   * @returns {*} lo que retorne fn
   */
  runAsWorker: <T>(label: string, fn: () => T | Promise<T>): Promise<T | undefined> =>
    storage.run(_buildInternalContext('worker', label), () => _runWorkerGuarded(label, fn)),

  /**
   * Igual que runAsWorker pero para procesos de sistema/infraestructura
   * (callbacks de circuit breaker, eventos de Redis): source 'system' y
   * correlationId `system-<label>-<rand>`.
   *
   * @param {string}   label - etiqueta del evento (ej: 'redis.outage')
   * @param {Function} fn    - cuerpo del evento (async)
   * @returns {*} lo que retorne fn
   */
  runAsSystem: <T>(label: string, fn: () => T): T => storage.run(_buildInternalContext('system', label), fn),

  /**
   * Fallback para logAudit fuera de cualquier contexto activo. Nunca retorna
   * undefined. source 'unknown' (NO 'system'): los eventos de sistema legítimos
   * (circuit breaker, Redis) ya pasan por runAsSystem y traen su propio contexto,
   * así que este fallback solo lo toca un logAudit que se escapó sin envolver.
   * Marcarlo 'unknown' lo hace detectable en BD (WHERE source='unknown') como
   * termómetro de cobertura — en operación normal debería dar cero filas.
   *
   * @returns {Object}
   */
  /**
   * Fotografía la sesión de origen de una acción del usuario, para persistirla en la
   * fila que esa acción crea. Es el puente entre la fila de dominio y `user_sessions`
   * (y con `audit_logs.session_id`): ante una reclamación ata el acto a una sesión, y
   * la sesión a su dispositivo, IP y ventana temporal.
   *
   * Se llama al CREAR la fila, nunca al actualizarla — un retry de admin o de worker
   * corre en otro contexto y no debe pisar el origen real.
   *
   * Ambos campos son null en workers (`runAsWorker`/`runAsSystem`) y en cualquier
   * creación sistémica: por eso las columnas son nullable.
   *
   * @returns {{ origin_session_id: string|null, origin_correlation_id: string|null }}
   */
  originFromContext: (): { origin_session_id: string | null; origin_correlation_id: string | null } => {
    const ctx = storage.getStore();
    return {
      origin_session_id: ctx?.sessionId ?? null,
      origin_correlation_id: ctx?.correlationId ?? null
    };
  },

  getSafe: (): RequestContext =>
    storage.getStore() ?? {
      correlationId: `internal-${crypto.randomUUID().slice(0, 8)}`,
      ip: 'internal',
      userAgent: null,
      fingerprintHash: null,
      method: null,
      path: null,
      source: 'unknown'
    }
};
