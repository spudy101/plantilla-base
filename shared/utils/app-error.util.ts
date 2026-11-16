// shared/utils/app-error.util.ts

/**
 * Clase centralizada para manejo de errores operacionales.
 * Extiende Error nativo para mantener stack trace.
 *
 * isOperational = true  → error grave/inesperado → logger.error (5xx)
 * isOperational = false → error de negocio esperado → logger.warn (4xx)
 */
class AppError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  readonly details: AppError.Details;
  readonly isOperational: boolean;
  retryAfter: number | null;

  // === RF-LP-03: Accesibilidad — Factory de errores ===
  constructor(
    message: string,
    statusCode = 500,
    code: string | null = null,
    details: AppError.Details = null,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    this.retryAfter = null;

    Error.captureStackTrace(this, this.constructor);
  }

  // ==============================================
  // FACTORY METHODS
  // ==============================================

  // [RF-LP-03] | CA-05 | Solo acepta message string sin field.
  // TODO [RF-LP-03][CA-05]: extender firma para aceptar field
  // opcional en errores de negocio asociados a un campo específico.
  /** 400 — Parámetros incorrectos o faltantes */
  static badRequest(message: string, details: AppError.Details = null): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details, false);
  }

  /** 401 — No autenticado */
  static unauthorized(message = 'No autorizado', details: AppError.Details = null): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED', details, false);
  }

  /** 403 — Autenticado pero sin permiso */
  static forbidden(message = 'Acceso denegado', details: AppError.Details = null): AppError {
    return new AppError(message, 403, 'FORBIDDEN', details, false);
  }

  /** 404 — Recurso no encontrado */
  static notFound(message = 'Recurso no encontrado', details: AppError.Details = null): AppError {
    return new AppError(message, 404, 'NOT_FOUND', details, false);
  }

  // [RF-LP-03] | CA-05 | Solo acepta message string sin field.
  // TODO [RF-LP-03][CA-05]: extender firma para aceptar field
  // opcional en errores de negocio asociados a un campo específico.
  /** 409 — Conflicto de estado (ej: recurso ya existe) */
  static conflict(message: string, details: AppError.Details = null): AppError {
    return new AppError(message, 409, 'CONFLICT', details, false);
  }

  // [RF-LP-03] | CA-05 | Único factory que propaga details[]
  // con desglose por campo. Camino correcto para errores
  // de validación accesibles.
  /** 422 — Datos válidos sintácticamente pero incorrectos semánticamente */
  static unprocessableEntity(message: string, details: AppError.Details = null): AppError {
    return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details, false);
  }

  /** 429 — Rate limit excedido */
  static tooManyRequests(
    message = 'Demasiadas peticiones',
    details: AppError.Details = null,
    retryAfter: number | null = null
  ): AppError {
    const err = new AppError(message, 429, 'RATE_LIMIT', details, false);
    err.retryAfter = retryAfter;
    return err;
  }

  /** 500 — Error interno del servidor (bug real) */
  static internal(message = 'Error interno del servidor', details: AppError.Details = null): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR', details, true);
  }

  /** 503 — Servicio no disponible temporalmente (ej: configuración pendiente) */
  static serviceUnavailable(message = 'Servicio no disponible temporalmente', details: AppError.Details = null): AppError {
    return new AppError(message, 503, 'SERVICE_UNAVAILABLE', details, false);
  }
}

// Tipos asociados (fusión de declaraciones: permite `export =` + tipos en un módulo CommonJS).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AppError {
  /** Detalle adicional que acompaña al error (campos inválidos, códigos de negocio, etc.). */
  export type Details = Record<string, unknown> | unknown[] | null;
}

export = AppError;
