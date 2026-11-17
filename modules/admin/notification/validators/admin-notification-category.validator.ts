import { body, query } from 'express-validator';
import BaseValidator from '../../../../shared/validators/base.validator';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

class NotificationCategoryValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),
      ...BaseValidator.optionalBoolean('isActive', 'El estado', 'query'),
      ...BaseValidator.optionalBoolean('isCritical', 'La criticidad', 'query'),
      query('priority').optional().isIn(PRIORITIES).withMessage({
        message: 'priority debe ser "low", "normal", "high" o "urgent"',
        hint: 'Indicá uno de: low, normal, high, urgent'
      })
    ];
  }

  static create() {
    return [
      body('code')
        .notEmpty()
        .withMessage({ message: 'code es requerido', hint: 'Usá un código único en MAYÚSCULAS (ej: COMMERCIAL)' })
        .isString()
        .trim()
        .matches(/^[A-Z0-9_]{2,100}$/)
        .withMessage({ message: 'code debe ser MAYÚSCULAS/números/guion bajo (2-100)', hint: 'Ej: COMMERCIAL, SECURITY' }),
      body('name').notEmpty().isString().trim().isLength({ min: 2, max: 200 }),
      ...NotificationCategoryValidator._commonEditable()
    ];
  }

  static update() {
    return [
      ...BaseValidator.uuidParam('notificationCategoryId', 'notificationCategoryId'),
      body('name').optional().isString().trim().isLength({ min: 2, max: 200 }),
      ...NotificationCategoryValidator._commonEditable()
    ];
  }

  /** Campos editables comunes a create/update (todos opcionales). @private */
  static _commonEditable() {
    return [
      body('description').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
      body('supportsPush').optional().isBoolean().toBoolean(),
      body('supportsEmail').optional().isBoolean().toBoolean(),
      body('supportsSms').optional().isBoolean().toBoolean(),
      body('allowDnd').optional().isBoolean().toBoolean(),
      body('isCritical').optional().isBoolean().toBoolean(),
      body('defaultQuietHoursStart').optional({ nullable: true }).matches(TIME_REGEX).withMessage({
        message: 'defaultQuietHoursStart debe ser HH:MM o HH:MM:SS',
        hint: 'Ingresá la hora en formato HH:MM'
      }),
      body('defaultQuietHoursEnd').optional({ nullable: true }).matches(TIME_REGEX).withMessage({
        message: 'defaultQuietHoursEnd debe ser HH:MM o HH:MM:SS',
        hint: 'Ingresá la hora en formato HH:MM'
      }),
      body('priority').optional().isIn(PRIORITIES),
      body('emailLayoutTemplate').optional({ nullable: true }).isString().isLength({ max: 20000 }),
      body('sortOrder').optional().isInt({ min: 0 }).toInt(),
      body('isActive').optional().isBoolean().toBoolean()
    ];
  }
}

export default NotificationCategoryValidator;
