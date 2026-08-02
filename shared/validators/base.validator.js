// === RF-LP-03: Accesibilidad — Validators base reutilizables ===
// [RF-LP-03] | CA-05 | Chains base compartidas por 40+ validators.
// Todos los .withMessage() deben identificar campo y restricción.
// [RF-LP-03][CA-05 IMPLEMENTADO]: todos los métodos base
// incluyen hint. Validators de dominio heredan hint automáticamente.
const { body, param, query, header } = require('express-validator');
const { REGEX } = require('../constants');

class BaseValidator {
  // ============================================================
  // IDENTITY
  // ============================================================

  static nationalId(field = 'nationalId') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El número de documento es requerido',
          hint: 'Ingresá entre 4 y 20 dígitos sin espacios ni guiones'
        })
        // [RF-LP-03][HALLAZGO CORREGIDO]: mensaje corregido de
        // "entre 6 y 20" a "entre 4 y 20" para coincidir con min: 4.
        .isLength({ min: 4, max: 20 })
        .withMessage({
          message: 'El número de documento debe tener entre 4 y 20 caracteres',
          hint: 'Ingresá entre 4 y 20 dígitos sin espacios ni guiones'
        })
    ];
  }

  static firstName(field = 'firstName') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El nombre es requerido',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .isLength({ min: 2, max: 50 })
        .withMessage({
          message: 'El nombre debe tener entre 2 y 50 caracteres',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/)
        .withMessage({
          message: 'El nombre solo puede contener letras',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
    ];
  }

  static lastName(field = 'lastName') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El apellido es requerido',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .isLength({ min: 2, max: 50 })
        .withMessage({
          message: 'El apellido debe tener entre 2 y 50 caracteres',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/)
        .withMessage({
          message: 'El apellido solo puede contener letras',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
    ];
  }

  static optionalMiddleName(field = 'middleName') {
    return [
      body(field)
        .optional({ nullable: true })
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage({
          message: 'El segundo nombre debe tener entre 2 y 50 caracteres',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/)
        .withMessage({
          message: 'El segundo nombre solo puede contener letras',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
    ];
  }

  static optionalSecondLastName(field = 'secondLastName') {
    return [
      body(field)
        .optional({ nullable: true })
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage({
          message: 'El segundo apellido debe tener entre 2 y 50 caracteres',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/)
        .withMessage({
          message: 'El segundo apellido solo puede contener letras',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
    ];
  }

  static middleName(field = 'middleName') {
    return [
      body(field)
        .notEmpty()
        .withMessage({
          message: 'El segundo nombre es requerido',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage({
          message: 'El segundo nombre debe tener entre 2 y 50 caracteres',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/)
        .withMessage({
          message: 'El segundo nombre solo puede contener letras',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
    ];
  }

  static secondLastName(field = 'secondLastName') {
    return [
      body(field)
        .notEmpty()
        .withMessage({
          message: 'El segundo apellido es requerido',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage({
          message: 'El segundo apellido debe tener entre 2 y 50 caracteres',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
        .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/)
        .withMessage({
          message: 'El segundo apellido solo puede contener letras',
          hint: 'Usá entre 2 y 50 caracteres, solo letras y espacios'
        })
    ];
  }

  static birthDate(field = 'birthDate') {
    return [
      body(field)
        .notEmpty()
        .withMessage({
          message: 'La fecha de nacimiento es requerida',
          hint: 'Ingresá una fecha de nacimiento válida en formato YYYY-MM-DD'
        })
        .isISO8601()
        .withMessage({
          message: 'La fecha de nacimiento debe ser una fecha válida (YYYY-MM-DD)',
          hint: 'Ingresá una fecha de nacimiento válida en formato YYYY-MM-DD'
        })
        .toDate()
    ];
  }

  static optionalBirthDate(field = 'birthDate') {
    return [
      body(field)
        .optional({ nullable: true })
        .isISO8601()
        .withMessage({
          message: 'La fecha de nacimiento debe ser una fecha válida (YYYY-MM-DD)',
          hint: 'Ingresá una fecha de nacimiento válida en formato YYYY-MM-DD'
        })
        .toDate()
    ];
  }

  // ============================================================
  // DATES (genéricas — RF-LP-03 candidata #1)
  // ============================================================

  /**
   * Fecha ISO 8601 opcional. Por defecto en query (filtros from/to);
   * pasar location='body' para campos de fecha opcionales en el body.
   */
  static optionalIsoDate(field, label = 'La fecha', location = 'query') {
    const chain = location === 'body' ? body(field) : query(field);
    return [
      chain
        .optional({ nullable: true })
        .isISO8601()
        .withMessage({
          message: `${label} debe ser una fecha válida (YYYY-MM-DD)`,
          hint: 'Ingresá una fecha válida en formato YYYY-MM-DD'
        })
        .toDate()
    ];
  }

  /**
   * Rango de fechas opcional en query (patrón from/to, dateFrom/dateTo).
   */
  static dateRangeQuery(fromField = 'dateFrom', toField = 'dateTo') {
    return [
      ...BaseValidator.optionalIsoDate(fromField, 'La fecha desde', 'query'),
      ...BaseValidator.optionalIsoDate(toField, 'La fecha hasta', 'query')
    ];
  }

  // ============================================================
  // CONTACT
  // ============================================================

  /**
   * Teléfono requerido.
   * Usado en profile.validator → updatePhone
   */
  static phone(field = 'phone', label = 'El teléfono') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: `${label} es requerido`,
          hint: 'Ingresá un número de teléfono válido con código de país'
        })
        .matches(/^\d{6,15}$/)
        .withMessage({
          message: `${label} debe contener entre 6 y 15 dígitos`,
          hint: 'Ingresá un número de teléfono válido con código de país'
        })
    ];
  }

  /**
   * Dirección requerida.
   * Usado en profile.validator → updateProfile → location.address
   */
  static address(field = 'address') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'La dirección es requerida',
          hint: 'Ingresá una dirección de entre 5 y 150 caracteres'
        })
        .isLength({ min: 5, max: 150 })
        .withMessage({
          message: 'La dirección debe tener entre 5 y 150 caracteres',
          hint: 'Ingresá una dirección de entre 5 y 150 caracteres'
        })
    ];
  }

  /**
   * Código postal opcional.
   * Usado en profile.validator → updateProfile → location.postalCode
   */
  static optionalPostalCode(field = 'postalCode') {
    return [
      body(field)
        .optional({ nullable: true })
        .trim()
        .matches(/^\d{4,10}$/)
        .withMessage({
          message: 'El código postal debe contener entre 4 y 10 dígitos',
          hint: 'Ingresá un código postal de 4 a 10 dígitos'
        })
    ];
  }

  // ============================================================
  // CREDENTIALS
  // ============================================================

  static email(field = 'email') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El email es requerido',
          hint: 'Ingresá un correo válido, por ejemplo usuario@dominio.com'
        })
        .matches(REGEX.EMAIL)
        .withMessage({
          message: 'Debe ser un email válido',
          hint: 'Ingresá un correo válido, por ejemplo usuario@dominio.com'
        })
        .isLength({ max: 255 })
        .withMessage({
          message: 'El email no puede superar los 255 caracteres',
          hint: 'Ingresá un correo válido, por ejemplo usuario@dominio.com'
        })
    ];
  }

  // [RF-AUTH-01] | CA-05 | Mínimo 10 caracteres +
  // complejidad (mayúscula, minúscula, número, especial).
  static password(field = 'password') {
    return [
      body(field)
        .notEmpty()
        .withMessage({
          message: 'La contraseña es requerida',
          hint: 'Incluí mayúsculas, minúsculas, números y un carácter especial'
        })
        .isLength({ min: 10 })
        .withMessage({
          message: 'La contraseña debe tener al menos 10 caracteres',
          hint: 'Incluí mayúsculas, minúsculas, números y un carácter especial'
        })
        .matches(REGEX.PASSWORD)
        .withMessage({
          message: 'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial',
          hint: 'Incluí mayúsculas, minúsculas, números y un carácter especial'
        })
    ];
  }

  // [RF-AUTH-01] | CA-05 | El reset de credenciales aplica la misma
  // política que el registro: mínimo 10 caracteres + complejidad.
  static newPassword(field = 'newPassword') {
    return [
      body(field)
        .notEmpty()
        .withMessage({
          message: 'La nueva contraseña es requerida',
          hint: 'Usá al menos 10 caracteres con mayúsculas, minúsculas, números y un carácter especial'
        })
        .isLength({ min: 10 })
        .withMessage({
          message: 'La nueva contraseña debe tener al menos 10 caracteres',
          hint: 'Usá al menos 10 caracteres con mayúsculas, minúsculas, números y un carácter especial'
        })
        .matches(REGEX.PASSWORD)
        .withMessage({
          message: 'La nueva contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial',
          hint: 'Usá al menos 8 caracteres con mayúsculas, minúsculas, números y un carácter especial'
        })
    ];
  }

  static conditionalNewPassword(typeField = 'type', passwordField = 'newPassword') {
    return [
      body(passwordField)
        .if(body(typeField).equals('password'))
        .notEmpty()
        .withMessage({
          message: 'La nueva contraseña es requerida para reset de tipo password',
          hint: 'Usá al menos 10 caracteres con mayúsculas, minúsculas, números y un carácter especial'
        })
        .isLength({ min: 10 })
        .withMessage({
          message: 'La nueva contraseña debe tener al menos 10 caracteres',
          hint: 'Usá al menos 10 caracteres con mayúsculas, minúsculas, números y un carácter especial'
        })
        .matches(REGEX.PASSWORD)
        .withMessage({
          message: 'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial',
          hint: 'Usá al menos 8 caracteres con mayúsculas, minúsculas, números y un carácter especial'
        })
    ];
  }

  static totpCode(field = 'totpCode') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El código TOTP es requerido',
          hint: 'Ingresá el código de 6 dígitos numéricos de tu app de autenticación'
        })
        .isLength({ min: 6, max: 6 })
        .withMessage({
          message: 'El código debe tener exactamente 6 dígitos',
          hint: 'Ingresá el código de 6 dígitos numéricos de tu app de autenticación'
        })
        .isNumeric()
        .withMessage({
          message: 'El código debe contener solo números',
          hint: 'Ingresá el código de 6 dígitos numéricos de tu app de autenticación'
        })
    ];
  }

  static resetToken(field = 'token') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El token es requerido',
          hint: 'Pegá el token de 64 caracteres que recibiste'
        })
        .isLength({ min: 64, max: 64 })
        .withMessage({
          message: 'El token debe tener 64 caracteres',
          hint: 'Pegá el token de 64 caracteres que recibiste'
        })
    ];
  }

  static resetType(field = 'type') {
    return [
      body(field)
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El tipo de reset es requerido',
          hint: 'Indicá "password" o "mfa"'
        })
        .isIn(['password', 'mfa'])
        .withMessage({
          message: 'El tipo debe ser "password" o "mfa"',
          hint: 'Indicá "password" o "mfa"'
        })
    ];
  }

  // ============================================================
  // FOREIGN KEYS / UUIDs
  // ============================================================

  static uuidBody(field, label) {
    return [
      body(field)
        .notEmpty()
        .withMessage({ message: `${label} es requerido`, hint: 'El identificador debe ser un UUID válido' })
        .isUUID()
        .withMessage({ message: `${label} debe ser un UUID válido`, hint: 'El identificador debe ser un UUID válido' })
    ];
  }

  static optionalUuidBody(field, label) {
    return [
      body(field)
        .optional({ nullable: true })
        .isUUID()
        .withMessage({ message: `${label} debe ser un UUID válido`, hint: 'El identificador debe ser un UUID válido' })
    ];
  }

  static uuidParam(field, label) {
    return [
      param(field)
        .notEmpty()
        .withMessage({ message: `${label} es requerido`, hint: 'El identificador debe ser un UUID válido' })
        .isUUID()
        .withMessage({ message: `${label} debe ser un UUID válido`, hint: 'El identificador debe ser un UUID válido' })
    ];
  }

  static optionalUuidQuery(field, label) {
    return [
      query(field)
        .optional({ nullable: true })
        .isUUID()
        .withMessage({ message: `${label} debe ser un UUID válido`, hint: 'El identificador debe ser un UUID válido' })
    ];
  }

  // ============================================================
  // BOOLEANS (genéricos — RF-LP-03 candidata #3)
  // ============================================================

  /**
   * Booleano opcional con coerción. location='body' (default) o 'query'.
   */
  static optionalBoolean(field, label = 'El valor', location = 'body') {
    const chain = location === 'query' ? query(field) : body(field);
    return [
      chain
        .optional({ nullable: true })
        .isBoolean()
        .withMessage({ message: `${label} debe ser un valor booleano`, hint: 'Ingresá true o false' })
        .toBoolean()
    ];
  }

  /**
   * Booleano requerido con coerción. location='body' (default) o 'query'.
   */
  static requiredBoolean(field, label = 'El valor', location = 'body') {
    const chain = location === 'query' ? query(field) : body(field);
    return [
      chain
        .exists()
        .withMessage({ message: `${label} es requerido`, hint: 'Ingresá true o false' })
        .isBoolean()
        .withMessage({ message: `${label} debe ser un valor booleano`, hint: 'Ingresá true o false' })
        .toBoolean()
    ];
  }

  // ============================================================
  // FILES (genéricos — RF-LP-03 candidata #2)
  // ============================================================

  /**
   * Archivo requerido subido vía multer (req.files[field][0]).
   * Valida presencia, MIME type y tamaño máximo.
   */
  static fileUpload(field, { mimeTypes = [], maxSizeMb = 10 } = {}) {
    const maxBytes = maxSizeMb * 1024 * 1024;
    const typesLabel = mimeTypes.join(', ');
    return [
      body(field)
        .custom((_value, { req }) => {
          const file = req.files?.[field]?.[0];
          if (!file) {
            return false;
          }
          if (mimeTypes.length && !mimeTypes.includes(file.mimetype)) {
            return false;
          }
          if (file.size > maxBytes) {
            return false;
          }
          return true;
        })
        .withMessage({
          message: `El archivo debe ser ${typesLabel} y no superar ${maxSizeMb}MB`,
          hint: `Adjuntá un archivo ${typesLabel} de hasta ${maxSizeMb}MB`
        })
    ];
  }

  // ============================================================
  // PAGINATION (query params)
  // ============================================================

  static pagination() {
    return [
      query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage({ message: 'La página debe ser un número entero mayor a 0', hint: 'Ingresá un número de página mayor a 0' })
        .toInt(),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage({ message: 'El límite debe ser un número entre 1 y 100', hint: 'Ingresá un límite entre 1 y 100' })
        .toInt(),
      query('sortBy').optional().trim().isLength({ max: 50 }).withMessage({
        message: 'El campo de ordenamiento es inválido',
        hint: 'Indicá un campo de ordenamiento de hasta 50 caracteres'
      }),
      query('order')
        .optional()
        .trim()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage({ message: 'El orden debe ser ASC o DESC', hint: 'Indicá ASC o DESC' })
    ];
  }

  static searchQuery() {
    return [
      query('search')
        .optional()
        .trim()
        .isString()
        .withMessage({ message: 'search debe ser un string', hint: 'Ingresá al menos 1 carácter para buscar' })
        .isLength({ max: 100 })
        .withMessage({
          message: 'El término de búsqueda no puede superar 100 caracteres',
          hint: 'Usá hasta 100 caracteres en la búsqueda'
        })
    ];
  }

  // ============================================================
  // HEADERS
  // ============================================================

  static refreshTokenHeader() {
    return [
      header('x-refresh-token').notEmpty().withMessage({
        message: 'Refresh token requerido en header X-Refresh-Token',
        hint: 'Incluí el header X-Refresh-Token en la petición'
      })
    ];
  }
}

module.exports = BaseValidator;
