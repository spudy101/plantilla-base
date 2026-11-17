// === RF-OPS-01: Pipeline DevSecOps, Infraestructura Base ===
// shared/middlewares/error.middleware.ts

import type { NextFunction, Request, Response } from 'express';
import ApiResponse from '../utils/app-response.util';
import AppError from '../utils/app-error.util';
import loggerUtilModule from '../utils/logger.util';
const { logger, logAudit, sanitizeForLog } = loggerUtilModule;
import constantsModule from '../constants';
const { HTTP_STATUS, ERROR_CODES, ERROR_MESSAGES, server, FIELD_LABELS, DEFAULT_FIELD_LABEL } = constantsModule;

/**
 * Lo que el handler lee de un error. Puede llegar cualquier cosa lanzada (AppError, errores de
 * Sequelize/Multer/JWT, Error nativo): todos los campos son opcionales.
 */
interface HandledError {
  name?: string;
  message?: string;
  stack?: string;
  statusCode?: number;
  code?: string;
  details?: unknown;
  retryAfter?: number | null;
  isOperational?: boolean;
  /** SequelizeValidationError / UniqueConstraintError */
  errors?: Array<{ path?: string; message?: string; value?: unknown }>;
  /** PrismaClientKnownRequestError: campos de la restricción violada (según versión/adaptador) */
  meta?: {
    target?: string[] | string;
    driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } };
  };
}

/** Campos de la restricción que violó un error de Prisma, en snake_case (como FIELD_LABELS). */
function _prismaConstraintFields(err: HandledError): string[] {
  const target = err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields ?? [];
  const fields = Array.isArray(target) ? target : [target];
  return fields.map(f => String(f).replace(/"/g, '').replace(/[A-Z]/g, c => `_${c.toLowerCase()}`));
}

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;

// ==============================================
// MAPEO DE ERRORES → AUDIT ACTION
// ==============================================
//
// Granularidad por tipo de error para que la SFC pueda filtrar
// por acción sin necesidad de inspeccionar http_status o error_code.
//
//   AUTH_FAILURE    — 401 · token inválido, expirado, faltante
//   ACCESS_DENIED   — 403 · autenticado pero sin permiso de rol
//   VALIDATION_FAILURE — 400 · parámetros incorrectos o faltantes
//                     422 · error de validación semántica (Joi, Sequelize)
//   RESOURCE_NOT_FOUND — 404 · entidad no encontrada
//   BUSINESS_RULE_VIOLATION — 409/429 · conflicto de estado, rate limit,
//                              y cualquier AppError de negocio no clasificado
//   SYSTEM_ERROR    — 5xx · errores inesperados / bugs / caídas
//
const _resolveAuditAction = (err: HandledError): string => {
  const status = err.statusCode || 500;

  if (status === 401 || err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 'AUTH_FAILURE';
  }
  if (status === 403) {
    return 'ACCESS_DENIED';
  }
  if (status === 400 || status === 422 || err.name === 'SequelizeValidationError') {
    return 'VALIDATION_FAILURE';
  }
  if (status === 404) {
    return 'RESOURCE_NOT_FOUND';
  }
  if (status === 409 || status === 429 || (err instanceof AppError && !err.isOperational)) {
    return 'BUSINESS_RULE_VIOLATION';
  }

  // 5xx — Sequelize inesperado, MulterError, o cualquier no controlado
  return 'SYSTEM_ERROR';
};

// Nivel de log para un AppError de negocio (isOperational=false, 4xx):
//   400/404/422 → info  (el usuario lo resuelve solo: corrige input, recurso ausente)
//   resto (401/403/409/429…) → warn  (admin/seguridad/infra resuelve la causa raíz)
const USER_RESOLVABLE_STATUSES = new Set([400, 404, 422]);
const _resolveBusinessLogLevel = (statusCode: number) => (USER_RESOLVABLE_STATUSES.has(statusCode) ? 'info' : 'warn');

class ErrorMiddleware {
  // === RF-LP-03: Accesibilidad — Middleware global de errores ===
  /**
   * Manejador global de errores — debe registrarse al final del pipeline en app.js.
   * app.use(ErrorMiddleware.handleError)
   */
  // [RF-LP-03] | CA-05 | UNPROCESSABLE_ENTITY con details[]
  // preserva field/message/value → cumple identificación de campo.
  // Otros AppError (badRequest, conflict) solo propagan message
  // sin field → incumplimiento parcial CA-05.
  // TODO [RF-LP-03][CA-05]: estandarizar errores de negocio
  // para incluir field cuando el error está asociado a un campo.
  static _handleAppError(err: AppError, res: Response, req: Request): Response {
    if (err.code === 'UNPROCESSABLE_ENTITY' && Array.isArray(err.details)) {
      return ApiResponse.validationError(res, err.details);
    }

    if (err.retryAfter) {
      res.set('Retry-After', String(err.retryAfter));
    }

    return ApiResponse.error(res, err.message, err.statusCode, err.code, {
      ...(err.details && typeof err.details === 'object' ? err.details : {}),
      correlationId: req.correlationId
    });
  }

  // [RF-LP-03] | CA-05 | JWT, RateLimit, Multer con mensajes
  // genéricos. Aceptable para errores de sistema, no de formulario.
  static _handleKnownErrors(err: HandledError, res: Response, req: Request): Response | null {
    if (err.name?.startsWith('Sequelize')) {
      return ErrorMiddleware._handleSequelizeError(err, res, req.correlationId);
    }
    if (err.name === 'PrismaClientKnownRequestError') {
      return ErrorMiddleware._handlePrismaError(err, res, req.correlationId);
    }
    if (err.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, ERROR_MESSAGES.TOKEN_INVALID);
    }
    if (err.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, ERROR_MESSAGES.TOKEN_EXPIRED);
    }
    if (err.statusCode === 429 || err.name === 'RateLimitError') {
      return ApiResponse.tooManyRequests(res, err.message || ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
    }
    if (err.name === 'MulterError') {
      return ApiResponse.badRequest(res, `Error de carga: ${err.message}`);
    }
    return null;
  }

  // [RF-OPS-01] | CA-03 | Registra errores con contexto completo:
  // correlationId, path, method, statusCode, userId, ip.
  // En producción incluye primera línea del stack saneada.
  static _logError(err: HandledError, req: Request, statusCode: number, errorCode: string): void {
    const errorContext = {
      correlationId: req.correlationId,
      message: err.message,
      // [RF-OPS-01][CA-03]: en producción se incluye solo la primera
      // línea del stack saneada para trazabilidad sin exponer internos.
      // TODO [RF-OPS-01][CA-03]: evaluar exponer stack completo saneado
      // con sanitizeForLog para mejor trazabilidad en producción.
      stack: server.nodeEnv === 'production' ? err.stack?.split('\n')[1]?.trim() : err.stack,
      statusCode,
      code: errorCode,
      isOperational: err.isOperational || false,
      path: req.path,
      method: req.method,
      userId: req.user?.userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      body: req.method === 'GET' ? undefined : sanitizeForLog(req.body),
      params: sanitizeForLog(req.params),
      query: sanitizeForLog(req.query)
    };

    if (err instanceof AppError && err.isOperational) {
      logger.error('Operational error', errorContext);
    } else if (err instanceof AppError) {
      const level = _resolveBusinessLogLevel(statusCode);
      logger[level]('Business error', {
        correlationId: req.correlationId,
        message: err.message,
        statusCode,
        code: errorCode,
        path: req.path,
        userId: req.user?.userId
      });
    } else {
      logger.error('Unexpected error', errorContext);
    }
  }

  // 👇 handleError queda limpio y dentro del límite de líneas
  static handleError(rawError: unknown, req: Request, res: Response, _next: NextFunction): Response {
    // 👈 _next para satisfacer no-unused-vars (Express reconoce el handler de errores por sus 4 parámetros)
    const err = (rawError ?? {}) as HandledError;
    const statusCode = err.statusCode || 500;
    const errorCode = err.code || ERROR_CODES.INTERNAL_ERROR;

    ErrorMiddleware._logError(err, req, statusCode, errorCode);

    // La route puede declarar su acción de dominio (AuditAction.declare). Si el
    // fallo ocurrió ya dentro del handler, se audita ESA acción con outcome
    // failure. Si no hay declaración (o el fallo fue pre-handler: 401/403/422/429),
    // cae al mapeo genérico por status.
    const declared = res.locals?.auditAction;
    const action = declared?.action ?? _resolveAuditAction(err);

    logAudit(
      action,
      req.user?.userId ?? null,
      {
        path: req.path,
        method: req.method,
        originalError: err.message,
        ...(server.nodeEnv !== 'production' && { stack: err.stack?.split('\n')[1]?.trim() })
      },
      {
        outcome: 'failure',
        httpStatus: statusCode,
        errorCode,
        errorMessage: err.message,
        entityType: declared?.entityType ?? null,
        entityTable: declared?.entityTable ?? null
      }
    );

    if (rawError instanceof AppError) {
      return ErrorMiddleware._handleAppError(rawError, res, req);
    }

    const knownResponse = ErrorMiddleware._handleKnownErrors(err, res, req);
    if (knownResponse) {
      return knownResponse;
    }

    return ApiResponse.error(
      res,
      server.nodeEnv === 'production' ? ERROR_MESSAGES.INTERNAL_ERROR : (err.message ?? ERROR_MESSAGES.INTERNAL_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      { correlationId: req.correlationId }
    );
  }

  /**
   * Handler para rutas no encontradas — registrar antes del handleError.
   * app.use(ErrorMiddleware.handleNotFound)
   */
  static handleNotFound(req: Request, res: Response): Response {
    logger.warn('Route not found', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip
    });

    // Auditar intento de acceso a ruta inexistente — puede indicar
    // exploración de endpoints o configuración incorrecta del cliente.
    logAudit(
      'RESOURCE_NOT_FOUND',
      req.user?.userId ?? null,
      { path: req.path, method: req.method },
      {
        outcome: 'failure',
        httpStatus: 404,
        errorCode: 'NOT_FOUND',
        errorMessage: `Ruta no encontrada: ${req.method} ${req.path}`
      }
    );

    return ApiResponse.notFound(res, `Ruta no encontrada: ${req.method} ${req.path}`);
  }

  /**
   * Wrapper para controllers async — elimina la necesidad de try/catch en cada uno.
   *
   * @example
   * router.get('/users', asyncHandler(UserController.getAll));
   */
  /** Envuelve un handler async para que sus rechazos lleguen a next(err). */
  static asyncHandler(fn: AsyncRequestHandler) {
    return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
  }

  // ==============================================
  // PRIVATE
  // ==============================================

  // Mismas respuestas que con Sequelize para las restricciones de la base (docs/prisma-migration.md, fase 5):
  // P2002 UNIQUE → 409 con la etiqueta del campo; P2003 FK → 400; P2025 fila inexistente → 404.
  static _handlePrismaError(err: HandledError, res: Response, correlationId: string | undefined): Response {
    switch (err.code) {
      case 'P2002': {
        const field = _prismaConstraintFields(err).find(f => FIELD_LABELS[f]);
        const label = (field && FIELD_LABELS[field]) || DEFAULT_FIELD_LABEL;
        return ApiResponse.conflict(res, `Ya existe un registro con ese ${label}`);
      }
      case 'P2003':
        return ApiResponse.badRequest(res, 'Referencia inválida');
      case 'P2025':
        return ApiResponse.notFound(res, 'Recurso no encontrado');
      default:
        return ApiResponse.error(
          res,
          'Error de base de datos',
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_CODES.DATABASE_ERROR,
          correlationId ? { correlationId } : null
        );
    }
  }

  static _handleSequelizeError(err: HandledError, res: Response, correlationId: string | undefined): Response {
    switch (err.name) {
      case 'SequelizeValidationError': {
        const errors = (err.errors ?? []).map(e => ({
          field: e.path,
          message: e.message,
          value: e.value
        }));
        return ApiResponse.validationError(res, errors);
      }

      // [RF-LP-03][HALLAZGO CORREGIDO]: e.path mapeado a label amigable via FIELD_LABELS.
      // Campos no mapeados usan DEFAULT_FIELD_LABEL para no filtrar nombres internos de BD.
      case 'SequelizeUniqueConstraintError': {
        const rawPath = err.errors?.[0]?.path || 'unknown';
        const label = FIELD_LABELS[rawPath] || DEFAULT_FIELD_LABEL;
        return ApiResponse.conflict(res, `Ya existe un registro con ese ${label}`);
      }

      // TODO [RF-LP-03][CA-05]: error de FK no identifica campo
      // afectado. Agregar field con nombre de relación cuando
      // esté disponible.
      case 'SequelizeForeignKeyConstraintError':
        return ApiResponse.badRequest(res, 'Referencia inválida');

      default:
        return ApiResponse.error(
          res,
          'Error de base de datos',
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_CODES.DATABASE_ERROR,
          correlationId ? { correlationId } : null
        );
    }
  }
}

export default ErrorMiddleware;
