// shared/base/base.server.ts
import type { Server } from 'node:http';
import type { Express } from 'express';
import db = require('../models');
import redisClient = require('../utils/redis.util');
import loggerUtilModule = require('../utils/logger.util');
const { logger } = loggerUtilModule;
import NotificationWorker = require('../../modules/schemas/notification/workers/notification-worker');
import SessionExpirationWorker = require('../../modules/schemas/kyc/iam/workers/session-expiration.worker');
import AuditArchiveWorker = require('../../modules/schemas/records/audit/workers/audit-archive.worker');
import DualApprovalExpirationWorker = require('../../modules/schemas/core/workers/dual-approval-expiration.worker');
import dualApprovalBootstrapModule = require('../../modules/schemas/core/dual-approval.bootstrap');
const { registerDualApprovalHandlers } = dualApprovalBootstrapModule;
import circuitBreakerBootstrapModule = require('./circuit-breaker.bootstrap');
const { registerCircuitBreakerCallbacks } = circuitBreakerBootstrapModule;
import NotificationEmitter = require('../../modules/schemas/notification/utils/notification-emitter.util');
import constantsModule = require('../constants');
const { server, workers } = constantsModule;
import errorMessageModule = require('../utils/error-message.util');

const { errorMessage } = errorMessageModule;


/**
 * Base class for Node.js HTTP servers (admin, client, monolith).
 *
 * Handles all infrastructure wiring that is identical across servers:
 *   - Redis connection
 *   - Database authentication
 *   - Background worker startup
 *   - Graceful shutdown (SIGTERM / SIGINT / uncaughtException / unhandledRejection)
 *
 * Subclasses must implement:
 *   - get port()          → number   (which port to bind)
 *   - get serverLabel()   → string   (e.g. 'ADMIN SERVER')
 *   - createHttpServer()  → Express  (the app to listen on)
 *
 * Subclasses may override:
 *   - afterInfraReady()   → async hook called after Redis + DB + workers are up,
 *                           before the HTTP server starts. No-op by default.
 */
class BaseServer {
  #httpServer: Server | null = null;

  // ─── Abstract getters ─────────────────────────────────────────────────────

  /** @returns {number} */
  get port(): number {
    throw new Error(`${this.constructor.name} must implement get port()`);
  }

  /** @returns {string} Human-readable label used in log lines, e.g. 'ADMIN SERVER' */
  get serverLabel(): string {
    throw new Error(`${this.constructor.name} must implement get serverLabel()`);
  }

  /** @returns {import('express').Express} */
  createHttpServer(): Express {
    throw new Error(`${this.constructor.name} must implement createHttpServer()`);
  }

  // ─── Optional hook ────────────────────────────────────────────────────────

  /** Called after infra is ready, before HTTP listen. Override if needed. */
  // eslint-disable-next-line class-methods-use-this
  async afterInfraReady() {
    await NotificationEmitter.initialize();
    logger.info('✅ NotificationEmitter initialized');
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  async start() {
    try {
      this.#logBanner('STARTING');

      await this.#connectRedis();
      await this.#connectDatabase();
      registerDualApprovalHandlers();
      registerCircuitBreakerCallbacks();
      await this.#startWorkers();
      await this.afterInfraReady();
      await this.#startHttpServer();

      this.#setupGracefulShutdown();
    } catch (error) {
      logger.error(`❌ Failed to start ${this.serverLabel}`, {
        error: errorMessage(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      process.exit(1);
    }
  }

  // ─── Private — infrastructure ─────────────────────────────────────────────

  async #connectRedis() {
    logger.info('Connecting to Redis...');
    await redisClient.connect();

    if (redisClient.isAvailable()) {
      logger.info('✅ Redis connected');
    } else {
      logger.warn('⚠️  Running WITHOUT Redis (single-instance mode)');
    }
  }

  async #connectDatabase() {
    logger.info('Connecting to database...');
    await db.sequelize.authenticate();
    logger.info('✅ Database connection established');
  }

  #startWorkers() {
    if (workers.enabled) {
      NotificationWorker.iniciar();
      SessionExpirationWorker.iniciar();
      AuditArchiveWorker.iniciar();
      DualApprovalExpirationWorker.iniciar();
      logger.info('✅ Workers enabled');
    } else {
      logger.info('ℹ️  Workers disabled');
    }
  }

  async #startHttpServer() {
    const app = this.createHttpServer();

    await new Promise<void>((resolve, reject) => {
      const httpServer = app.listen(this.port, server.host, () => {
        resolve();
      });
      httpServer.once('error', reject);
      this.#httpServer = httpServer;
    });

    this.#logBanner('RUNNING');
    logger.info(`🌐 http://${server.host}:${this.port}`);
    logger.info(`❤️  Health: http://${server.host}:${this.port}/health`);
    logger.info(`📊 Environment: ${server.nodeEnv}`);
    logger.info('=================================================');
  }

  // ─── Private — graceful shutdown ──────────────────────────────────────────

  #setupGracefulShutdown() {
    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info(`\n${signal} received — starting graceful shutdown...`);
      const httpServer = this.#httpServer;
      if (!httpServer) {
        return;
      }

      // Force-kill timeout (registered first so it always fires even if close() hangs)
      const forceKill = setTimeout(() => {
        logger.error('❌ Forced shutdown due to timeout');
        process.exit(1);
      }, 10_000);
      forceKill.unref(); // don't keep the event loop alive just for this timer

      try {
        await new Promise<void>((resolve, reject) => {
          httpServer.close(err => (err ? reject(err) : resolve()));
        });
        logger.info('✅ HTTP server closed');

        await db.sequelize.close();
        logger.info('✅ Database connection closed');

        await redisClient.disconnect();
        logger.info('✅ Redis connection closed');

        await NotificationEmitter.close();
        logger.info('✅ NotificationEmitter closed');

        clearTimeout(forceKill);
        logger.info('🎉 Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during graceful shutdown', { error: errorMessage(error) });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', error => {
      logger.error('❌ Uncaught Exception', { message: error?.message, stack: error?.stack });
      if (server.nodeEnv === 'production') {
        process.exit(1);
      }
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('❌ Unhandled Rejection', {
        reasonMessage: reason instanceof Error ? reason.message : String(reason),
        reasonStack: reason instanceof Error ? reason.stack : undefined
      });
      if (server.nodeEnv === 'production') {
        process.exit(1);
      }
    });
  }

  // ─── Private — helpers ────────────────────────────────────────────────────

  #logBanner(state: 'STARTING' | 'RUNNING') {
    logger.info('=================================================');
    logger.info(`🚀 ${state} ${this.serverLabel}`);
    logger.info('=================================================');
    logger.info(`Environment : ${server.nodeEnv}`);
    logger.info(`Port        : ${this.port}`);
    logger.info(`Host        : ${server.host}`);
    logger.info('=================================================');
  }
}

export = BaseServer;
