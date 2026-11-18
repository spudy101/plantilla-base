// === RF-OPS-01: Pipeline DevSecOps, Infraestructura Base ===
// src/middlewares/correlation.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const CORRELATION_ID_SUFFIX_LENGTH = 8;

/**
 * Agrega un Correlation ID único a cada request.
 *
 * Permite trazar una request a través de todos los logs y servicios.
 * Si el cliente envía X-Correlation-Id o X-Request-Id, se respeta.
 * Si no, se genera uno nuevo con formato: req-{timestamp}-{uuid-corto}
 *
 * El ID se devuelve en el header X-Correlation-Id de la respuesta
 * para que el frontend pueda reportarlo en caso de error.
 */
class CorrelationMiddleware {
  /**
   * Middleware principal — agregar al inicio del pipeline en app.js.
   */
  // [RF-OPS-01] | CA-03 | Genera o propaga Correlation ID único
  // por request (req-{timestamp}-{uuid}). Respeta X-Correlation-Id
  // y X-Request-Id entrantes. Retorna el ID en header de respuesta.
  static addCorrelationId(req: Request, res: Response, next: NextFunction) {
    // Un header repetido llega como string[]: se toma el primero
    const incoming = req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const correlationId = (Array.isArray(incoming) ? incoming[0] : incoming) || CorrelationMiddleware._generateId();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    next();
  }

  /**
   * Retorna los headers necesarios para propagar el Correlation ID
   * cuando se llama a un servicio externo o microservicio.
   *
   * @param {import('express').Request} req
   * @returns {{ 'X-Correlation-Id': string, 'X-Request-Id': string }}
   *
   * @example
   * const headers = CorrelationMiddleware.getPropagationHeaders(req);
   * await axios.post('https://otro-servicio.com/endpoint', data, { headers });
   */
  static getPropagationHeaders(req: Request) {
    return {
      'X-Correlation-Id': req.correlationId,
      'X-Request-Id': req.correlationId
    };
  }

  /**
   * @returns {string} req-{timestamp}-{uuid-corto}
   * @private
   */
  static _generateId() {
    return `req-${Date.now()}-${uuidv4().slice(0, CORRELATION_ID_SUFFIX_LENGTH)}`;
  }
}

export default CorrelationMiddleware;
