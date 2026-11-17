import expressValidatorModule = require('express-validator');
const { body } = expressValidatorModule;
import BaseValidator = require('../../../../shared/validators/base.validator');

class NotificationTypeValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),

      ...BaseValidator.optionalBoolean('isActive', 'El estado', 'query'),

      ...BaseValidator.optionalUuidQuery('notificationCategoryId', 'notificationCategoryId'),

      require('express-validator').query('priority').optional().isIn(['low', 'normal', 'high', 'urgent']).withMessage({
        message: 'priority debe ser "low", "normal", "high" o "urgent"',
        hint: 'Indicá uno de: low, normal, high, urgent'
      })
    ];
  }

  static update() {
    // Los templates (title/body/email) NO son editables vía API — se gestionan por seeders.
    // Los canales (push/email/sms) y el DND viven en la CATEGORÍA: acá solo se ajusta metadata,
    // prioridad y a qué categoría pertenece el tipo (notificationCategoryId).
    return [
      ...BaseValidator.uuidParam('notificationTypeId', 'notificationTypeId'),

      body('name').optional().isString().trim().isLength({ min: 2, max: 100 }),
      body('description').optional().isString().trim().isLength({ max: 500 }),
      body('priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
      body('notificationCategoryId').optional({ nullable: true }).isUUID().withMessage({
        message: 'notificationCategoryId debe ser un UUID válido',
        hint: 'Usá el identificador de la categoría (formato UUID)'
      })
    ];
  }

  static createGlobalNotification() {
    return [
      body('titulo')
        .notEmpty()
        .withMessage({
          message: 'titulo es requerido',
          hint: 'Usá entre 3 y 255 caracteres'
        })
        .isString()
        .trim()
        .isLength({ min: 3, max: 255 })
        .withMessage({
          message: 'titulo debe tener entre 3 y 255 caracteres',
          hint: 'Usá entre 3 y 255 caracteres'
        }),

      body('contenido')
        .notEmpty()
        .withMessage({
          message: 'contenido es requerido',
          hint: 'Usá al menos 3 caracteres'
        })
        .isString()
        .trim()
        .isLength({ min: 3 })
        .withMessage({
          message: 'contenido debe tener al menos 3 caracteres',
          hint: 'Usá al menos 3 caracteres'
        }),

      body('asunto')
        .notEmpty()
        .withMessage({
          message: 'asunto es requerido',
          hint: 'Usá entre 3 y 255 caracteres'
        })
        .isString()
        .trim()
        .isLength({ min: 3, max: 255 })
        .withMessage({
          message: 'asunto debe tener entre 3 y 255 caracteres',
          hint: 'Usá entre 3 y 255 caracteres'
        })
    ];
  }

  static createDirectNotification() {
    return [
      body('userId')
        .notEmpty()
        .withMessage({
          message: 'userId es requerido',
          hint: 'Indicá el UUID del usuario destinatario'
        })
        .isUUID()
        .withMessage({
          message: 'userId debe ser un UUID válido',
          hint: 'Usá el identificador del usuario (formato UUID)'
        }),

      ...NotificationTypeValidator.createGlobalNotification()
    ];
  }
}

export = NotificationTypeValidator;
