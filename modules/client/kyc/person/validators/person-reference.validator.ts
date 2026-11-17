// modules/client/kyc/validators/person-reference.validator.ts

import { body } from 'express-validator';
import BaseValidator from '../../../../../shared/validators/base.validator';

class PersonReferenceValidator {
  static create() {
    return [
      body('referenceName')
        .trim()
        .notEmpty()
        .withMessage({ message: 'El nombre de la referencia es requerido', hint: 'Usá entre 2 y 200 caracteres' })
        .isLength({ min: 2, max: 200 })
        .withMessage({ message: 'El nombre debe tener entre 2 y 200 caracteres', hint: 'Usá entre 2 y 200 caracteres' }),

      body('referencePhone')
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El teléfono de la referencia es requerido',
          hint: 'Ingresá un teléfono válido (7 a 20 dígitos, se permiten + espacios y guiones)'
        })
        .matches(/^\+?[\d\s\-()]{7,20}$/)
        .withMessage({
          message: 'El teléfono no tiene un formato válido',
          hint: 'Ingresá un teléfono válido (7 a 20 dígitos, se permiten + espacios y guiones)'
        }),

      body('referenceType')
        .notEmpty()
        .withMessage({ message: 'El tipo de referencia es requerido', hint: 'Indicá uno de: conocido, familiar' })
        .isIn(['conocido', 'familiar'])
        .withMessage({ message: 'El tipo debe ser "conocido" o "familiar"', hint: 'Indicá uno de: conocido, familiar' })
    ];
  }

  static update() {
    return [
      ...BaseValidator.uuidParam('referenceId', 'La referencia'),

      body('referenceName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage({ message: 'El nombre debe tener entre 2 y 200 caracteres', hint: 'Usá entre 2 y 200 caracteres' }),

      body('referencePhone')
        .optional()
        .trim()
        .matches(/^\+?[\d\s\-()]{7,20}$/)
        .withMessage({
          message: 'El teléfono no tiene un formato válido',
          hint: 'Ingresá un teléfono válido (7 a 20 dígitos, se permiten + espacios y guiones)'
        }),

      body('referenceType')
        .optional()
        .isIn(['conocido', 'familiar'])
        .withMessage({ message: 'El tipo debe ser "conocido" o "familiar"', hint: 'Indicá uno de: conocido, familiar' })
    ];
  }

  static remove() {
    return [...BaseValidator.uuidParam('referenceId', 'La referencia')];
  }
}

export default PersonReferenceValidator;
