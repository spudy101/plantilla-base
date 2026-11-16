// shared/base/base.app.ts
import type { Express, NextFunction, Request, Response } from 'express';
import express = require('express');
import compression = require('compression');

import SecurityMiddleware = require('../middlewares/security.middleware');
import CorrelationMiddleware = require('../middlewares/correlation.middleware');
import ErrorMiddleware = require('../middlewares/error.middleware');
import auditContextMiddleware = require('../middlewares/audit.middleware');
import loggerUtilModule = require('../utils/logger.util');
const { httpLogger } = loggerUtilModule;
import redisClient = require('../utils/redis.util');
import db = require('../models');
import packageModule = require('../../package.json');
const { version } = packageModule;

/**
 * Base class for Express apps (admin, client, etc.)
 *
 * Subclasses must implement:
 *   - setupSwagger()   → mount Swagger docs
 *   - setupRoutes()    → mount business routes
 *
 * Subclasses receive:
 *   - this.app         → Express instance
 *   - this.serviceName → string passed in constructor
 */
/** Resultado de un chequeo de dependencia en /health. */
interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTimeMs?: number;
  note?: string;
}

/**
 * App Express base de cada servicio (admin / client). Las subclases implementan setupSwagger() y
 * setupRoutes(); el constructor arma el pipeline en orden fijo.
 */
class BaseApp {
  readonly serviceName: string;
  readonly app: Express;

  /**
   * @param serviceName - e.g. 'admin' | 'client'
   */
  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.app = express();

    this._setupCore();
    this.setupSwagger();
    this.setupRoutes();
    this._setupErrorHandlers();
  }

  // ─── Private (framework wiring) ───────────────────────────────────────────

  _setupCore() {
    // Trust proxy — needed to get real IP behind nginx / Cloudflare
    // [RF-LP-01] | CA-05 | Confía en X-Forwarded-Proto del reverse proxy — redirección
    // HTTP→HTTPS delegada a infraestructura (Fargate/ALB)
    this.app.set('trust proxy', 1);

    // ⚠️ CRITICAL MIDDLEWARE ORDER — do not reorder
    this.app.use(CorrelationMiddleware.addCorrelationId); // 1. Correlation ID (must be first)
    this.app.use(SecurityMiddleware.helmet()); // 2. Security headers
    this.app.use(SecurityMiddleware.cors());
    this.app.use(SecurityMiddleware.addSecurityHeaders);
    this.app.use(express.json({ limit: '10mb' })); // 3. Body parsers
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(this._handleMalformedJson.bind(this)); //    ↳ Captura JSON inválido del cliente (400 controlado)
    this.app.use(auditContextMiddleware); // 4. Audit context (needs body + correlationId)
    // [RF-LP-01] | CA-01 | Compresión gzip global — reduce payload en endpoints públicos
    this.app.use(compression()); // 5. Compression
    this.app.use(httpLogger); // 6. HTTP logger (needs correlationId)

    // Built-in routes available to every service
    this.app.get('/health', this._healthHandler.bind(this));
    this.app.get('/', this._rootHandler.bind(this));
  }

  _setupErrorHandlers() {
    this.app.use(ErrorMiddleware.handleNotFound);
    this.app.use(ErrorMiddleware.handleError);
  }

  // ─── JSON parse error handler ─────────────────────────────────────────────

  /**
   * Captura errores de JSON malformado lanzados por body-parser.
   * Al ser un error del cliente (4xx) no debe tratarse como INTERNAL_ERROR
   * ni generar ruido en los logs de auditoría como fallo operacional.
   */
  _handleMalformedJson(err: unknown, req: Request, res: Response, next: NextFunction) {
    if ((err as { type?: string } | null)?.type === 'entity.parse.failed') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_JSON_BODY',
        message: 'El cuerpo de la solicitud contiene JSON inválido. Verifica la sintaxis y el Content-Type.',
        correlationId: req.correlationId ?? null
      });
    }
    return next(err);
  }

  // ─── Built-in route handlers ──────────────────────────────────────────────

  /**
   * Professional health check.
   *
   * Returns 200 when the service is healthy, 503 when a critical dependency
   * (DB or Redis) is unavailable.
   *
   * Response shape follows the informal "health check response format" draft:
   *   status  : 'healthy' | 'degraded' | 'unhealthy'
   *   checks  : map of dependency name → { status, responseTime? }
   */
  async _healthHandler(req: Request, res: Response) {
    const start = Date.now();

    const checks: Record<string, HealthCheck> = {};

    // ── Database ────────────────────────────────────────────────────────────
    const dbStart = Date.now();
    try {
      await db.sequelize.authenticate();
      checks.database = { status: 'healthy', responseTimeMs: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'unhealthy', responseTimeMs: Date.now() - dbStart };
    }

    // ── Redis ────────────────────────────────────────────────────────────────
    const redisStart = Date.now();
    if (redisClient.isAvailable()) {
      checks.redis = { status: 'healthy', responseTimeMs: Date.now() - redisStart };
    } else {
      checks.redis = { status: 'degraded', note: 'running in single-instance mode' };
    }

    // ── Overall status ───────────────────────────────────────────────────────
    const hasUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy');
    const hasDegraded = Object.values(checks).some(c => c.status === 'degraded');

    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';
    const httpStatus = hasUnhealthy ? 503 : 200;

    return res.status(httpStatus).json({
      status: overallStatus,
      service: this.serviceName,
      version,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - start,
      correlationId: req.correlationId,
      checks
    });
  }

  _rootHandler(req: Request, res: Response) {
    return res.status(200).json({
      success: true,
      message: `Welcome to Base Project — ${this.serviceName} API`,
      version,
      service: this.serviceName,
      documentation: `/${this.serviceName}/docs`,
      correlationId: req.correlationId
    });
  }

  // ─── Abstract — subclasses must override ──────────────────────────────────

  /** Mount Swagger docs for this service. */
  setupSwagger(): void {
    throw new Error(`${this.constructor.name} must implement setupSwagger()`);
  }

  /** Mount business routes for this service. */
  setupRoutes(): void {
    throw new Error(`${this.constructor.name} must implement setupRoutes()`);
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  getApp(): Express {
    return this.app;
  }
}

export = BaseApp;
