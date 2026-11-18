// modules/admin/users/validators/admin-user.validator.ts

import { body } from 'express-validator';
import BaseValidator from '../../../shared/http/base.validator';

class AdminUserValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),
      ...BaseValidator.optionalUuidQuery('roleId', 'El rol'),
      ...BaseValidator.optionalBoolean('isActive', 'El estado', 'query')
    ];
  }

  static create() {
    return [
      ...BaseValidator.firstName('firstName'),
      ...BaseValidator.lastName('lastName'),
      ...BaseValidator.optionalMiddleName('middleName'),
      ...BaseValidator.optionalSecondLastName('secondLastName'),
      ...BaseValidator.nationalId('nationalId'),
      ...BaseValidator.email('email')
    ];
  }

  static update() {
    return [
      body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage({
        message: 'El nombre debe tener entre 2 y 50 caracteres',
        hint: 'Usá entre 2 y 50 caracteres'
      }),
      body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage({
        message: 'El apellido debe tener entre 2 y 50 caracteres',
        hint: 'Usá entre 2 y 50 caracteres'
      }),
      body('middleName').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage({
        message: 'El segundo nombre no puede superar 50 caracteres',
        hint: 'Usá hasta 50 caracteres'
      }),
      body('secondLastName').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage({
        message: 'El segundo apellido no puede superar 50 caracteres',
        hint: 'Usá hasta 50 caracteres'
      })
    ];
  }

  static changeRole() {
    return [...BaseValidator.uuidBody('roleId', 'El rol')];
  }

  static changeStatus() {
    return [...BaseValidator.requiredBoolean('isActive', 'El estado')];
  }

  static changeLogsQuery() {
    return [...BaseValidator.pagination()];
  }

  static deleteUser() {
    return [
      ...BaseValidator.uuidParam('userId', 'El usuario'),
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

export default AdminUserValidator;
