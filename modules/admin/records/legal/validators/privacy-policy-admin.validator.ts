// modules/admin/privacy-policy/validators/privacy-policy-admin.validator.ts

import expressValidatorModule = require('express-validator');
const { body, check } = expressValidatorModule;
import BaseValidator = require('../../../../../shared/validators/base.validator');

/**
 * Valida que la versión siga el formato semántico simple: N.N (ej: 1.0, 1.1, 2.0)
 * Acepta también versiones con más de un dígito: 10.0, 1.10
 */
const VERSION_REGEX = /^\d+\.\d+$/;

class PrivacyPolicyAdminValidator {
  /**
   * Validación para GET /admin/api/privacy-policies (paginación + filtro isActive)
   */
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),

      ...BaseValidator.optionalBoolean('isActive', 'El estado', 'query')
    ];
  }

  /**
   * Validación para POST /admin/api/privacy-policies (multipart/form-data)
   * Mismo patrón que InstitutionalEmailValidator — usa req.files (uploadFields),
   * no req.file (single), para ser consistente en todo el proyecto.
   */
  static createVersion() {
    return [
      // ── Archivo PDF (obligatorio) ──────────────────────────────────────
      // req.files.policyDocument[0] — igual que req.files.studentCertificate[0]
      check('policyDocument').custom((_value, { req }) => {
        if (!req.files?.policyDocument?.[0]) {
          throw new Error('El archivo PDF de la política de privacidad es requerido');
        }
        if (req.files.policyDocument[0].mimetype !== 'application/pdf') {
          throw new Error('Solo se permiten archivos PDF');
        }
        const MAX_SIZE_MB = 20;
        if (req.files.policyDocument[0].size > MAX_SIZE_MB * 1024 * 1024) {
          throw new Error(`El archivo no puede superar ${MAX_SIZE_MB}MB`);
        }
        return true;
      }),

      // ── Versión (obligatoria) ──────────────────────────────────────────
      body('version')
        .notEmpty()
        .withMessage({
          message: 'La versión es requerida',
          hint: 'Usá el formato N.N (ej: 1.0, 1.1, 2.0)'
        })
        .isString()
        .withMessage({
          message: 'La versión debe ser un string',
          hint: 'Usá el formato N.N (ej: 1.0, 1.1, 2.0)'
        })
        .matches(VERSION_REGEX)
        .withMessage({
          message: 'La versión debe tener el formato N.N (ej: 1.0, 1.1, 2.0)',
          hint: 'Usá el formato N.N (ej: 1.0, 1.1, 2.0)'
        })
        .isLength({ max: 20 })
        .withMessage({
          message: 'La versión no puede superar 20 caracteres',
          hint: 'Usá hasta 20 caracteres'
        }),

      // ── Resumen de cambios (opcional) ─────────────────────────────────
      body('summary')
        .optional({ nullable: true })
        .isString()
        .withMessage({
          message: 'El resumen debe ser un texto',
          hint: 'Escribí un resumen de hasta 1000 caracteres'
        })
        .isLength({ max: 1000 })
        .withMessage({
          message: 'El resumen no puede superar 1000 caracteres',
          hint: 'Usá hasta 1000 caracteres'
        })
        .trim(),

      // ── Fecha de vigencia (opcional, default: ahora) ──────────────────
      ...BaseValidator.optionalIsoDate('effectiveDate', 'La fecha de vigencia', 'body')
    ];
  }
}

export = PrivacyPolicyAdminValidator;
