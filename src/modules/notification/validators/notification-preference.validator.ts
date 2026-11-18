import { body, param } from 'express-validator';
import BaseValidator from '../../../shared/http/base.validator';

const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;
const EDITABLE_FIELDS = ['allowPush', 'allowEmail', 'allowSms', 'quietHoursStart', 'quietHoursEnd'];

class NotificationPreferenceValidator {
  /** Campos de preferencia editables (comunes a global y por categoría; todos opcionales). @private */
  static _editableFields() {
    return [
      ...BaseValidator.optionalBoolean('allowPush', 'allowPush'),
      ...BaseValidator.optionalBoolean('allowEmail', 'allowEmail'),
      ...BaseValidator.optionalBoolean('allowSms', 'allowSms'),
      body('quietHoursStart')
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage({
          message: 'quietHoursStart debe tener formato HH:MM o HH:MM:SS',
          hint: 'Ingresá la hora en formato HH:MM'
        }),
      body('quietHoursEnd')
        .optional({ nullable: true })
        .matches(TIME_REGEX)
        .withMessage({
          message: 'quietHoursEnd debe tener formato HH:MM o HH:MM:SS',
          hint: 'Ingresá la hora en formato HH:MM'
        })
    ];
  }

  /** @private */
  static _requireAtLeastOneField() {
    return body().custom(value => {
      const hasAny = EDITABLE_FIELDS.some(f => value[f] !== undefined);
      if (!hasAny) {
        throw new Error('Debe enviar al menos un campo para actualizar las preferencias');
      }
      return true;
    });
  }

  /** @private — código de categoría en el path (MAYÚSCULAS/números/guion bajo). */
  static _categoryCodeParam() {
    return param('categoryCode')
      .notEmpty()
      .withMessage({ message: 'categoryCode es requerido', hint: 'Indicá el código de la categoría' })
      .matches(/^[A-Z0-9_]{2,100}$/)
      .withMessage({ message: 'categoryCode inválido', hint: 'Ej: SECURITY, ACCOUNT' });
  }

  /** PUT /person/notifications/preferences/global */
  static updateGlobalPreference() {
    return [NotificationPreferenceValidator._requireAtLeastOneField(), ...NotificationPreferenceValidator._editableFields()];
  }

  /** PUT /person/notifications/preferences/category/:categoryCode */
  static updateCategoryPreference() {
    return [
      NotificationPreferenceValidator._categoryCodeParam(),
      NotificationPreferenceValidator._requireAtLeastOneField(),
      ...NotificationPreferenceValidator._editableFields()
    ];
  }

  /** DELETE /person/notifications/preferences/category/:categoryCode */
  static deleteCategoryPreference() {
    return [NotificationPreferenceValidator._categoryCodeParam()];
  }
}

export default NotificationPreferenceValidator;
