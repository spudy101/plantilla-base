import { interopDefault } from '../../../../shared/utils/interop.util';
import EventEmitter from 'node:events';
import type { Redis } from 'ioredis';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logger } = loggerUtilModule;
import errorMessageModule from '../../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


class NotificationEmitter extends EventEmitter {
  useRedis: boolean;
  subscriberClient: Redis | null;
  publisherClient: Redis | null;
  readonly CHANNEL_NAME: string;
  readonly WAKE_CHANNEL: string;
  /** Eventos que viajan por Redis: nombre de evento → canal */
  _redisEvents: Record<string, string>;
  initialized: boolean;

  constructor() {
    super();
    this.useRedis = false;
    this.subscriberClient = null;
    this.publisherClient = null;
    this.CHANNEL_NAME = 'notification:count-updated';
    // §7.5 — Canal genérico de "despertar worker". Transporta SOLO una señal ("hay trabajo nuevo,
    // revisá la tabla"), NUNCA el trabajo en sí: el trabajo vive en la tabla (screenings pending, etc.).
    // Si la señal se pierde (Pub/Sub no persiste), el cron la recoge → nunca hay trabajo perdido.
    this.WAKE_CHANNEL = 'worker:wake';
    // Eventos que viajan por Redis (nombre de evento → canal). El resto cae a EventEmitter local.
    this._redisEvents = { 'count-updated': this.CHANNEL_NAME, 'worker:wake': this.WAKE_CHANNEL };
    this.initialized = false;
  }

  /**
   * Inicializa Redis Pub/Sub — llamar DESPUÉS de conectar Redis
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const redisClient = interopDefault(require('../../../../shared/utils/redis.util') as typeof import('../../../../shared/utils/redis.util'));

      if (redisClient.isAvailable()) {
        const client = redisClient.getClient();
        if (!client) {
          throw new Error('Redis disponible pero sin cliente');
        }
        this.publisherClient = client;
        const subscriber = client.duplicate();
        this.subscriberClient = subscriber;

        await subscriber.connect();

        // ioredis entrega los mensajes publicados por el evento 'message', NO por el callback de
        // subscribe(): ese callback es la confirmación de suscripción (err, count) y se invoca UNA
        // sola vez, no por mensaje. Sin este handler, todo lo publicado a los canales se descarta en
        // silencio y los listeners locales (streams SSE, workers) nunca reciben el evento.
        subscriber.on('message', (channel: string, message: string) => {
          try {
            if (channel === this.CHANNEL_NAME) {
              super.emit('count-updated', JSON.parse(message));
            } else if (channel === this.WAKE_CHANNEL) {
              super.emit('worker:wake', JSON.parse(message));
            }
          } catch (error) {
            logger.warn('Error parsing Redis pub/sub message', { channel, error: errorMessage(error) });
          }
        });

        await subscriber.subscribe(this.CHANNEL_NAME, this.WAKE_CHANNEL);

        this.useRedis = true;
        this.initialized = true;
        logger.info('✓ NotificationEmitter: Redis Pub/Sub habilitado');
      } else {
        logger.info('⚠ NotificationEmitter: Redis no disponible, usando EventEmitter local');
        this.initialized = true;
      }
    } catch (error) {
      logger.warn('Error initializing Redis Pub/Sub, using local EventEmitter', {
        error: errorMessage(error)
      });
      this.useRedis = false;
      this.initialized = true;
    }
  }

  /**
   * Emite evento de actualización de contador
   */
  override emit(event: string | symbol, data?: unknown): boolean {
    const channel = typeof event === 'string' ? this._redisEvents[event] : undefined;
    if (!channel) {
      return super.emit(event, data);
    }

    try {
      if (this.useRedis && this.publisherClient) {
        this.publisherClient.publish(channel, JSON.stringify(data));
        logger.debug('Event published to Redis', { event: String(event), channel });
        return true;
      }
      const result = super.emit(event, data);
      logger.debug('Event emitted locally', { event: String(event) });
      return result;
    } catch (error) {
      logger.warn('Error emitting notification event', { event: String(event), error: errorMessage(error) });
      return super.emit(event, data);
    }
  }

  /**
   * §7.5 — Publica una señal de despertar para un worker. La señal NO transporta el trabajo (eso vive
   * en la tabla); solo dispara una corrida anticipada. Si nadie escucha, el cron recoge el trabajo igual.
   *
   * @param {'screening'|'profile-completeness'} worker
   * @param {Object|null} hint  pista opcional (p. ej. { userId } para procesar UN usuario en vez del barrido)
   */
  publishWake(worker: NotificationEmitter.WakeSignal['worker'], hint: NotificationEmitter.WakeSignal['hint'] = null) {
    return this.emit('worker:wake', { worker, hint });
  }

  /**
   * Registra un handler de señales de despertar. Funciona con o sin Redis (fallback a EventEmitter local).
   * @param {(data: {worker: string, hint: Object|null}) => void} handler
   */
  onWake(handler: (data: NotificationEmitter.WakeSignal) => void) {
    this.on('worker:wake', handler);
  }

  /**
   * Cleanup al cerrar la aplicación
   */
  async close() {
    try {
      if (this.subscriberClient) {
        await this.subscriberClient.unsubscribe(this.CHANNEL_NAME);
        await this.subscriberClient.unsubscribe(this.WAKE_CHANNEL);
        await this.subscriberClient.quit();
      }
      logger.info('NotificationEmitter closed successfully');
    } catch (error) {
      logger.warn('Error closing NotificationEmitter', { error: errorMessage(error) });
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace NotificationEmitter {
  /** Señal de despertar de un worker (no transporta trabajo, solo dispara una corrida). */
  export interface WakeSignal {
    worker: string;
    /** Pista opcional, p. ej. { userId } para procesar un solo usuario */
    hint: Record<string, unknown> | null;
  }
}

// Singleton — initialize() debe llamarse explícitamente desde src/server.ts,
// DESPUÉS de que Redis esté conectado. No auto-inicializar aquí.
const notificationEmitter = new NotificationEmitter();

// Cleanup on process exit
process.on('SIGTERM', async () => {
  await notificationEmitter.close();
});
process.on('SIGINT', async () => {
  await notificationEmitter.close();
});

export default notificationEmitter;
