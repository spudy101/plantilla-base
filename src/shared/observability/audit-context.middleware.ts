// src/middlewares/audit.middleware.ts

import type { NextFunction, Request, Response } from 'express';
import loggerUtilModule from './logger.util';
const { sanitizeForLog } = loggerUtilModule;
import DeviceFingerprintUtil from '../security/device-fingerprint.util';
import requestContext from './request-context.util';

/**
 * Audit Middleware
 *
 * Genera auditContext con la información de la request y lo adjunta a:
 *   - res.locals.auditContext   → acceso directo desde controllers (si se necesita)
 *   - res.locals.fingerprintHash
 *   - AsyncLocalStorage         → propagación automática a services y utils
 *
 * Debe ejecutarse DESPUÉS de CorrelationMiddleware y body parsers.
 *
 * Con AsyncLocalStorage ya NO es necesario pasar auditContext
 * manualmente desde controllers a services — logAudit lo obtiene solo.
 */
const auditMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const fingerprintHash = DeviceFingerprintUtil.generateFromRequest(req);

  const auditContext = {
    correlationId: req.correlationId,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'] || null,
    fingerprintHash,
    method: req.method,
    path: req.originalUrl || req.path,
    query: sanitizeForLog({ ...req.query }), // fix: sanitizar query params
    body: req.method !== 'GET' && req.body ? sanitizeForLog(req.body) : undefined,
    timestamp: new Date().toISOString(),
    source: 'http'
  };

  // Acceso directo desde controllers si alguno lo necesita explícitamente
  res.locals.auditContext = auditContext;
  res.locals.fingerprintHash = fingerprintHash;

  // Propagar automáticamente a toda la cadena async de esta request
  // Esto hace que logAudit() en cualquier service obtenga el contexto sin parámetros
  requestContext.run(auditContext, next);
};

export default auditMiddleware;
