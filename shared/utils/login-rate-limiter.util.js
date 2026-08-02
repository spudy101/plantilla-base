// shared/utils/login-rate-limiter.util.js
//
// === RF-AUTH-02: Login, Gestión de Sesión Segura y Recuperación de Contraseña ===
//
// Gestiona dos capas de rate limiting para el endpoint de login en Redis.
//
// Capa IP:
//   login:ip:attempts:{ip}          → contador de intentos (TTL = ventana 1 min)
//   login:ip:blocked:{ip}           → "1" cuando IP bloqueada (TTL = 10 min)
//
// Capa cuenta:
//   login:account:attempts:{hash}   → contador de intentos fallidos (TTL = ventana 30 min)
//   login:account:blocked:{hash}    → unix timestamp de bloqueo (TTL = 30 min)
//
// {hash} = SHA-256 hex del nationalId — nunca el valor en claro.
//
// Política fail-open:
//   Si Redis no está disponible, las verificaciones retornan null/false y las
//   escrituras se saltan silenciosamente. El request pasa — priorizamos disponibilidad.

// === RF-AUTH-01: Registro de Usuario (confirmación de correo y celular) ===

const crypto = require('node:crypto');
const redisClient = require('./redis.util');
const { logger } = require('./logger.util');
const { LOGIN_RATE_LIMIT } = require('../constants');

const KEY_IP_ATTEMPTS = 'login:ip:attempts';
const KEY_IP_BLOCKED = 'login:ip:blocked';
const KEY_ACCOUNT_ATTEMPTS = 'login:account:attempts';
const KEY_ACCOUNT_BLOCKED = 'login:account:blocked';

class LoginRateLimiterUtil {
  // ============================================================
  // CAPA IP
  // ============================================================

  /**
   * Verifica si la IP está bloqueada.
   * Fail-open: retorna null si Redis no disponible.
   *
   * @param {string} ip
   * @returns {Promise<number|null>} segundos restantes de bloqueo, o null si no bloqueada
   */
  // [RF-AUTH-02] | CA-05 | Rate limiting por IP en login: 10 intentos/min, bloqueo 10 min en Redis
  static async checkIpBlock(ip) {
    if (!ip || !redisClient.isAvailable()) {
      return null;
    }

    try {
      const client = redisClient.getClient();
      const blockedKey = `${KEY_IP_BLOCKED}:${ip}`;
      const ttl = await client.ttl(blockedKey);
      return ttl > 0 ? ttl : null;
    } catch (error) {
      logger.warn('LoginRateLimiter: error al verificar bloqueo IP en Redis', {
        error: error.message,
        ip
      });
      return null;
    }
  }

  /**
   * Incrementa el contador de intentos de la IP.
   * Si supera el límite, bloquea la IP.
   * Fail-open: si Redis no disponible, retorna null.
   *
   * @param {string} ip
   * @returns {Promise<number|null>} segundos de bloqueo aplicado, o null si no se bloqueó
   */
  // [RF-AUTH-02] | CA-05 | Rate limiting por IP en login: 10 intentos/min, bloqueo 10 min en Redis
  static async incrementIpAttempts(ip) {
    if (!ip || !redisClient.isAvailable()) {
      return null;
    }

    try {
      const client = redisClient.getClient();
      const attemptsKey = `${KEY_IP_ATTEMPTS}:${ip}`;
      const blockedKey = `${KEY_IP_BLOCKED}:${ip}`;

      const count = await client.incr(attemptsKey);
      if (count === 1) {
        await client.expire(attemptsKey, LOGIN_RATE_LIMIT.IP_WINDOW_SECS);
      }

      if (count > LOGIN_RATE_LIMIT.IP_MAX_ATTEMPTS) {
        await client.set(blockedKey, '1', 'EX', LOGIN_RATE_LIMIT.IP_BLOCK_SECS, 'NX');
        logger.warn('LoginRateLimiter: IP bloqueada por exceso de intentos', {
          ip,
          count,
          blockSecs: LOGIN_RATE_LIMIT.IP_BLOCK_SECS
        });
        return LOGIN_RATE_LIMIT.IP_BLOCK_SECS;
      }

      return null;
    } catch (error) {
      logger.warn('LoginRateLimiter: error al incrementar contador IP en Redis', {
        error: error.message,
        ip
      });
      return null;
    }
  }

  // ============================================================
  // CAPA CUENTA
  // ============================================================

  /**
   * Verifica si la cuenta (nationalId) está bloqueada.
   * Fail-open: retorna null si Redis no disponible.
   *
   * @param {string} nationalId
   * @returns {Promise<number|null>} segundos restantes de bloqueo, o null si no bloqueada
   */
  // [RF-AUTH-01] | CA-06 | Limiter primario en Redis.
  // Fallback a BD si Redis no disponible (fail-open
  // por decisión de diseño — revisar tolerancia).
  static async checkAccountBlock(nationalId) {
    if (!nationalId || !redisClient.isAvailable()) {
      return null;
    }

    try {
      const client = redisClient.getClient();
      const blockedKey = `${KEY_ACCOUNT_BLOCKED}:${LoginRateLimiterUtil._hash(nationalId)}`;
      const ttl = await client.ttl(blockedKey);
      return ttl > 0 ? ttl : null;
    } catch (error) {
      logger.warn('LoginRateLimiter: error al verificar bloqueo de cuenta en Redis', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Incrementa el contador de intentos fallidos de la cuenta.
   * Si supera el límite, bloquea la cuenta.
   * Fail-open: si Redis no disponible, retorna null.
   *
   * @param {string} nationalId
   * @returns {Promise<number|null>} segundos de bloqueo aplicado, o null si no se bloqueó
   */
  static async incrementAccountFailures(nationalId) {
    if (!nationalId || !redisClient.isAvailable()) {
      return null;
    }

    try {
      const client = redisClient.getClient();
      const hash = LoginRateLimiterUtil._hash(nationalId);
      const attemptsKey = `${KEY_ACCOUNT_ATTEMPTS}:${hash}`;
      const blockedKey = `${KEY_ACCOUNT_BLOCKED}:${hash}`;

      const count = await client.incr(attemptsKey);
      if (count === 1) {
        await client.expire(attemptsKey, LOGIN_RATE_LIMIT.ACCOUNT_WINDOW_SECS);
      }

      if (count >= LOGIN_RATE_LIMIT.ACCOUNT_MAX_ATTEMPTS) {
        await client.set(blockedKey, String(Math.floor(Date.now() / 1000)), 'EX', LOGIN_RATE_LIMIT.ACCOUNT_BLOCK_SECS, 'NX');
        logger.warn('LoginRateLimiter: cuenta bloqueada por intentos fallidos', {
          count,
          blockSecs: LOGIN_RATE_LIMIT.ACCOUNT_BLOCK_SECS
        });
        return LOGIN_RATE_LIMIT.ACCOUNT_BLOCK_SECS;
      }

      return null;
    } catch (error) {
      logger.warn('LoginRateLimiter: error al incrementar contador de cuenta en Redis', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Resetea los contadores de la cuenta tras un login exitoso.
   * Fire-and-forget — no bloquea el flujo de login.
   *
   * @param {string} nationalId
   */
  static async resetAccountCounters(nationalId) {
    if (!nationalId || !redisClient.isAvailable()) {
      return;
    }

    try {
      const client = redisClient.getClient();
      const hash = LoginRateLimiterUtil._hash(nationalId);
      await client.del(`${KEY_ACCOUNT_ATTEMPTS}:${hash}`, `${KEY_ACCOUNT_BLOCKED}:${hash}`);
    } catch (error) {
      logger.warn('LoginRateLimiter: error al resetear contadores de cuenta en Redis', {
        error: error.message
      });
    }
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  static _hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

module.exports = LoginRateLimiterUtil;
