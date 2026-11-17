import { body, query } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ============================================================
 * PERSON VALIDATOR — ADMIN
 * ============================================================
 */

class PersonValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),

      // Acepta un UUID o varios separados por coma: "uuid1,uuid2"
      query('roleId')
        .optional()
        .custom(value => {
          const ids = String(value)
            .split(',')
            .map(id => id.trim());
          if (!ids.every(id => UUID_REGEX.test(id))) {
            throw new Error('roleId debe ser un UUID o lista de UUIDs válidos separados por coma');
          }
          return true;
        }),

      // national_id completo para búsqueda exacta por hash
      query('nationalId').optional().isString().trim().notEmpty().withMessage({
        message: 'nationalId no puede estar vacío',
        hint: 'Ingresá el número de documento completo para la búsqueda exacta'
      }),

      // userId filtra por el identificador exacto del usuario (PK)
      query('userId').optional().isUUID().withMessage({
        message: 'userId debe ser un UUID válido',
        hint: 'Filtrá por el identificador exacto del usuario'
      }),

      ...BaseValidator.optionalBoolean('isActive', 'El estado', 'query'),

      require('express-validator')
        .query('sortBy')
        .optional()
        .isIn(['username', 'created_at', 'updated_at', 'is_active'])
        .withMessage({
          message: 'sortBy debe ser: username, created_at, updated_at o is_active',
          hint: 'Indicá uno de: username, created_at, updated_at, is_active'
        })
    ];
  }

  static getById() {
    return [...BaseValidator.uuidParam('userId', 'userId')];
  }

  static create() {
    return [
      ...BaseValidator.nationalId('nationalId'),
      ...BaseValidator.email('email'),

      body('firstName')
        .notEmpty()
        .withMessage({
          message: 'firstName es requerido',
          hint: 'Usá entre 2 y 100 caracteres'
        })
        .isString()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage({
          message: 'firstName debe tener entre 2 y 100 caracteres',
          hint: 'Usá entre 2 y 100 caracteres'
        }),

      body('middleName').optional({ nullable: true }).isString().trim().isLength({ min: 2, max: 100 }).withMessage({
        message: 'middleName debe tener entre 2 y 100 caracteres',
        hint: 'Usá entre 2 y 100 caracteres'
      }),

      body('lastName')
        .notEmpty()
        .withMessage({
          message: 'lastName es requerido',
          hint: 'Usá entre 2 y 100 caracteres'
        })
        .isString()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage({
          message: 'lastName debe tener entre 2 y 100 caracteres',
          hint: 'Usá entre 2 y 100 caracteres'
        }),

      body('secondLastName').optional({ nullable: true }).isString().trim().isLength({ min: 2, max: 100 }).withMessage({
        message: 'secondLastName debe tener entre 2 y 100 caracteres',
        hint: 'Usá entre 2 y 100 caracteres'
      }),

      ...BaseValidator.uuidBody('documentTypeId', 'documentTypeId'),

      ...BaseValidator.optionalBirthDate('birthDate'),

      ...BaseValidator.optionalUuidBody('genderId', 'genderId'),
      ...BaseValidator.optionalUuidBody('countryId', 'countryId')
    ];
  }

  static activate() {
    return [...BaseValidator.uuidParam('userId', 'userId')];
  }
  static deactivate() {
    return [...BaseValidator.uuidParam('userId', 'userId')];
  }
  static resetPassword() {
    return [...BaseValidator.uuidParam('userId', 'userId')];
  }
  static disableMFA() {
    return [...BaseValidator.uuidParam('userId', 'userId')];
  }

  static changeEmail() {
    return [
      ...BaseValidator.uuidParam('userId', 'userId'),
      body('newEmail')
        .notEmpty()
        .withMessage({
          message: 'newEmail es requerido',
          hint: 'Ingresá un correo válido, por ejemplo usuario@dominio.com'
        })
        .isEmail()
        .withMessage({
          message: 'newEmail debe ser un email válido',
          hint: 'Ingresá un correo válido, por ejemplo usuario@dominio.com'
        })
        .normalizeEmail()
        .isLength({ max: 255 })
        .withMessage({
          message: 'newEmail debe tener máximo 255 caracteres',
          hint: 'Usá hasta 255 caracteres'
        })
    ];
  }

  static changeNationalId() {
    return [...BaseValidator.uuidParam('userId', 'userId'), ...BaseValidator.nationalId('newNationalId')];
  }

  static changeRole() {
    return [...BaseValidator.uuidParam('userId', 'userId'), ...BaseValidator.uuidBody('newRoleId', 'newRoleId')];
  }

  static deleteAccount() {
    return [
      ...BaseValidator.uuidParam('userId', 'userId'),
      body('currentPassword')
        .notEmpty()
        .withMessage({
          message: 'currentPassword es requerido',
          hint: 'Ingresá tu contraseña actual para confirmar la operación'
        })
        .isString()
        .trim()
    ];
  }
}

export default PersonValidator;
