// src/utils/response.util.js

const { HTTP_STATUS } = require('../constants');
const PiiMaskingMiddleware = require('../middlewares/pii-masking.middleware');

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
  constructor(success, statusCode, message, data = null, metadata = null) {
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

  static success(res, message, data = null, statusCode = HTTP_STATUS.OK, metadata = null) {
    // Si el DTO ya viene con { data, metadata }, aplanarlo al nivel raíz
    const isListResponse = data !== null && typeof data === 'object' && 'data' in data && 'metadata' in data;

    const finalData = isListResponse ? data.data : data;
    const finalMetadata = isListResponse ? data.metadata : metadata;

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

  static created(res, message, data = null, metadata = null) {
    return ApiResponse.success(res, message, data, HTTP_STATUS.CREATED, metadata);
  }

  static accepted(res, message, data = null, metadata = null) {
    return ApiResponse.success(res, message, data, HTTP_STATUS.ACCEPTED, metadata);
  }

  static noContent(res) {
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  }

  // ==============================================
  // ERRORS
  // ==============================================

  // === RF-LP-03: Accesibilidad — Manejo de Errores ===
  // [RF-LP-03] | CA-05 | Estructura base de respuesta de error.
  // Incluye errorCode para que el front identifique el tipo
  // sin depender del color.
  static error(res, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode = null, errors = null) {
    const response = new ApiResponse(false, statusCode, message);
    if (errorCode) {
      response.errorCode = errorCode;
    }
    if (errors) {
      response.errors = errors;
    }
    return res.status(statusCode).json(response);
  }

  static badRequest(res, message, errors = null) {
    return ApiResponse.error(res, message, HTTP_STATUS.BAD_REQUEST, 'BAD_REQUEST', errors);
  }

  static unauthorized(res, message = 'No autorizado') {
    return ApiResponse.error(res, message, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  }

  static forbidden(res, message = 'Acceso denegado') {
    return ApiResponse.error(res, message, HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
  }

  static notFound(res, message = 'Recurso no encontrado') {
    return ApiResponse.error(res, message, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND');
  }

  static conflict(res, message) {
    return ApiResponse.error(res, message, HTTP_STATUS.CONFLICT, 'CONFLICT');
  }

  static tooManyRequests(res, message = 'Demasiadas peticiones') {
    return ApiResponse.error(res, message, HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMIT');
  }

  // [RF-LP-03] | CA-05 | Helper de error de validación.
  // Adjunta array errors[] con field/message/value por campo.
  // [RF-LP-03][CA-05 IMPLEMENTADO]: campo hint incluido en errors[]
  // cuando el validator lo provee.
  static validationError(res, errors) {
    return ApiResponse.error(res, 'Error de validación', HTTP_STATUS.UNPROCESSABLE_ENTITY, 'VALIDATION_ERROR', errors);
  }
}

module.exports = ApiResponse;
