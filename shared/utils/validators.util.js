// src/utils/validators.js
const { validationResult } = require('express-validator');
const AppError = require('./app-error.util');

class ValidatorUtil {
  /**
   * ✅ ACTUALIZADO: Lanza AppError en lugar de responder directamente
   * Esto permite que el error handler global maneje la respuesta
   * y agregue automáticamente el correlationId
   */
  // === RF-LP-03: Accesibilidad — Punto único de formateo
  // de errores de validación ===
  // [RF-LP-03] | CA-05 | Centraliza el formateo de errores
  // express-validator. Mapea field + message + value.
  // Todos los validators del proyecto pasan por aquí.
  // [RF-LP-03][CA-05 IMPLEMENTADO]: hint extraído de withMessage()
  // cuando está disponible como objeto {message, hint}.
  static handleValidationErrors(req, res, next) {
    const errors = validationResult(req);

    // console.log(req.body);
    // console.log(req.params);
    // console.log(req.query);
    // console.log(errors);

    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => {
        const msgObj = typeof err.msg === 'object' ? err.msg : { message: err.msg };
        return {
          field: err.path || err.param,
          message: msgObj.message,
          hint: msgObj.hint || null,
          value: err.value
        };
      });

      return next(AppError.unprocessableEntity('Error de validación', formattedErrors));
    }

    return next();
  }

  /**
   * ✅ MANTENER: Validate UUID
   */
  static isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

module.exports = ValidatorUtil;
