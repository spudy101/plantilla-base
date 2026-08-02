const EventEmitter = require('node:events');
const { logger } = require('../../../../shared/utils/logger.util');

class NotificationEmitter extends EventEmitter {
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
      const redisClient = require('../../../../shared/utils/redis.util');

      if (redisClient.isAvailable()) {
        this.publisherClient = redisClient.getClient();
        this.subscriberClient = redisClient.getClient().duplicate();

        await this.subscriberClient.connect();

        // ioredis entrega los mensajes publicados por el evento 'message', NO por el callback de
        // subscribe(): ese callback es la confirmación de suscripción (err, count) y se invoca UNA
        // sola vez, no por mensaje. Sin este handler, todo lo publicado a los canales se descarta en
        // silencio y los listeners locales (streams SSE, workers) nunca reciben el evento.
        this.subscriberClient.on('message', (channel, message) => {
          try {
            if (channel === this.CHANNEL_NAME) {
              super.emit('count-updated', JSON.parse(message));
            } else if (channel === this.WAKE_CHANNEL) {
              super.emit('worker:wake', JSON.parse(message));
            }
          } catch (error) {
            logger.warn('Error parsing Redis pub/sub message', { channel, error: error.message });
          }
        });

        await this.subscriberClient.subscribe(this.CHANNEL_NAME, this.WAKE_CHANNEL);

        this.useRedis = true;
        this.initialized = true;
        logger.info('✓ NotificationEmitter: Redis Pub/Sub habilitado');
      } else {
        logger.info('⚠ NotificationEmitter: Redis no disponible, usando EventEmitter local');
        this.initialized = true;
      }
    } catch (error) {
      logger.warn('Error initializing Redis Pub/Sub, using local EventEmitter', {
        error: error.message
      });
      this.useRedis = false;
      this.initialized = true;
    }
  }

  /**
   * Emite evento de actualización de contador
   */
  emit(event, data) {
    const channel = this._redisEvents[event];
    if (!channel) {
      return super.emit(event, data);
    }

    try {
      if (this.useRedis && this.publisherClient) {
        this.publisherClient.publish(channel, JSON.stringify(data));
        logger.debug('Event published to Redis', { event, channel });
        return true;
      }
      const result = super.emit(event, data);
      logger.debug('Event emitted locally', { event });
      return result;
    } catch (error) {
      logger.warn('Error emitting notification event', { event, error: error.message });
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
  publishWake(worker, hint = null) {
    return this.emit('worker:wake', { worker, hint });
  }

  /**
   * Registra un handler de señales de despertar. Funciona con o sin Redis (fallback a EventEmitter local).
   * @param {(data: {worker: string, hint: Object|null}) => void} handler
   */
  onWake(handler) {
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
      logger.warn('Error closing NotificationEmitter', { error: error.message });
    }
  }
}

// Singleton — initialize() debe llamarse explícitamente desde BaseServer.afterInfraReady(),
// DESPUÉS de que Redis esté conectado. No auto-inicializar aquí.
const notificationEmitter = new NotificationEmitter();

// Cleanup on process exit
process.on('SIGTERM', async () => {
  await notificationEmitter.close();
});
process.on('SIGINT', async () => {
  await notificationEmitter.close();
});

module.exports = notificationEmitter;
