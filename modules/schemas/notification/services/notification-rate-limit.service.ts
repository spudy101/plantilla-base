const ONE_MINUTE_MS = 60 * 1000;
const CACHE_TTL_SECONDS = 120; // 2 minutos

// SNS
const SNS_RATE_LIMIT_PER_MINUTE = 300;
const SNS_INCREMENT_PER_BATCH = 100;

// SES
const SES_RATE_LIMIT_PER_MINUTE = 200;
const SES_INCREMENT_PER_BATCH = 50;

import loggerUtilModule = require('../../../../shared/utils/logger.util');
import type { KeyValueCache } from '../../../../shared/types/cache';
const { logger } = loggerUtilModule;

class NotificationRateLimitService {
  async checkSNSRateLimit(cache: KeyValueCache) {
    const now = Date.now();
    const minute = Math.floor(now / ONE_MINUTE_MS);
    const key = `aws_sns_rate:${minute}`;

    const current = await cache.get(key);
    const count = current ? Number.parseInt(String(current), 10) : 0;

    if (count >= SNS_RATE_LIMIT_PER_MINUTE) {
      const waitTime = ONE_MINUTE_MS - (now % ONE_MINUTE_MS);
      logger.warn(`Rate limit SNS alcanzado, esperando ${waitTime}ms`);
      await this._sleep(waitTime);
    }

    await cache.set(key, count + SNS_INCREMENT_PER_BATCH, CACHE_TTL_SECONDS);
  }

  async checkSESRateLimit(cache: KeyValueCache) {
    const now = Date.now();
    const minute = Math.floor(now / ONE_MINUTE_MS);
    const key = `aws_ses_rate:${minute}`;

    const current = await cache.get(key);
    const count = current ? Number.parseInt(String(current), 10) : 0;

    if (count >= SES_RATE_LIMIT_PER_MINUTE) {
      const waitTime = ONE_MINUTE_MS - (now % ONE_MINUTE_MS);
      logger.warn(`Rate limit SES alcanzado, esperando ${waitTime}ms`);
      await this._sleep(waitTime);
    }

    await cache.set(key, count + SES_INCREMENT_PER_BATCH, CACHE_TTL_SECONDS);
  }

  _sleep(ms: number) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }
}

export = Object.assign(new NotificationRateLimitService(), { NotificationRateLimitService });
