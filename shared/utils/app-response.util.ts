// shared/utils/app-response.util.ts

import type { Response } from 'express';
import constantsModule = require('../constants');
const { HTTP_STATUS } = constantsModule;
import PiiMaskingMiddleware = require('../middlewares/pii-masking.middleware');

/**
 * Clase centralizada para respuestas HTTP estandarizadas.
 * Toda respuesta de la API pasa por aquí.
 *
 * Estructura de respuesta exitosa:
 * { success: true, statusCode, message, data, metadata, timestamp }
 *
 * Estructura de respuesta de error:
 * { success: false, statusCode, message, errorCode?, errors?, timestamp }
 */
class ApiResponse {
  success: boolean;
  statusCode: number;
  message: string;
  data: unknown;
  metadata: unknown;
  timestamp: string;
  // `declare`: sin esto (useDefineForClassFields) cada respuesta tendría errorCode/errors = undefined
  declare errorCode?: string;
  declare errors?: unknown;

  constructor(success: boolean, statusCode: number, message: string, data: unknown = null, metadata: unknown = null) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }

  // ==============================================
  // SUCCESS
  // ==============================================

  static success(res: Response, message: string, data: unknown = null, statusCode: number = HTTP_STATUS.OK, metadata: unknown = null): Response {
    // Si el DTO ya viene con { data, metadata }, aplanarlo al nivel raíz
    const isListResponse = (value: unknown): value is { data: unknown; metadata: unknown } =>
      value !== null && typeof value === 'object' && 'data' in value && 'metadata' in value;

    const finalData = isListResponse(data) ? data.data : data;
    const finalMetadata = isListResponse(data) ? data.metadata : metadata;

    // [RF-USR-01] | CA-06 | Red de seguridad PII: toda respuesta exitosa pasa por aquí, así que
    // este es el punto único donde garantizar que ningún dato sensible sale sin enmascarar.
    // El enmascaramiento real vive en los DTOs; esto solo cubre lo que se les escape.
    const response = new ApiResponse(
      true,
      statusCode,
      message,
      PiiMaskingMiddleware.apply(res, finalData),
      PiiMaskingMiddleware.apply(res, finalMetadata)
    );
    return res.status(statusCode).json(response);
  }

  static created(res: Response, message: string, data: unknown = null, metadata: unknown = null): Response {
    return ApiResponse.success(res, message, data, HTTP_STATUS.CREATED, metadata);
  }

  static accepted(res: Response, message: string, data: unknown = null, metadata: unknown = null): Response {
    return ApiResponse.success(res, message, data, HTTP_STATUS.ACCEPTED, metadata);
  }

  static noContent(res: Response): Response {
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  }

  // ==============================================
  // ERRORS
  // ==============================================

  // === RF-LP-03: Accesibilidad — Manejo de Errores ===
  // [RF-LP-03] | CA-05 | Estructura base de respuesta de error.
  // Incluye errorCode para que el front identifique el tipo
  // sin depender del color.
  static error(
    res: Response,
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    errorCode: string | null = null,
    errors: unknown = null
  ): Response {
    const response = new ApiResponse(false, statusCode, message);
    if (errorCode) {
      response.errorCode = errorCode;
    }
    if (errors) {
      response.errors = errors;
    }
    return res.status(statusCode).json(response);
  }

  static badRequest(res: Response, message: string, errors: unknown = null): Response {
    return ApiResponse.error(res, message, HTTP_STATUS.BAD_REQUEST, 'BAD_REQUEST', errors);
  }

  static unauthorized(res: Response, message = 'No autorizado'): Response {
    return ApiResponse.error(res, message, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  static forbidden(res: Response, message = 'Acceso denegado'): Response {
    return ApiResponse.error(res, message, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
  }

  static notFound(res: Response, message = 'Recurso no encontrado'): Response {
    return ApiResponse.error(res, message, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  static conflict(res: Response, message: string): Response {
    return ApiResponse.error(res, message, HTTP_STATUS.CONFLICT, 'CONFLICT');
  }

  static tooManyRequests(res: Response, message = 'Demasiadas peticiones'): Response {
    return ApiResponse.error(res, message, HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT');
  }

  // [RF-LP-03] | CA-05 | Helper de error de validación.
  // Adjunta array errors[] con field/message/value por campo.
  // [RF-LP-03][CA-05 IMPLEMENTADO]: campo hint incluido en errors[]
  // cuando el validator lo provee.
  static validationError(res: Response, errors: unknown): Response {
    return ApiResponse.error(res, 'Error de validación', HTTP_STATUS.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', errors);
  }
}

export = ApiResponse;
