// tests/unit/shared/validators.util.test.js
//
// ValidatorUtil: punto único de formateo de errores de express-validator (RF-LP-03)
// + helper isValidUUID. Mockeamos express-validator para controlar el resultado de
// validationResult de forma determinista; AppError es real (sin efectos secundarios).

jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

const { validationResult } = require('express-validator');
const AppError = require('shared/utils/app-error.util');
const ValidatorUtil = require('shared/utils/validators.util');

describe('ValidatorUtil', () => {
  describe('handleValidationErrors', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      jest.clearAllMocks();
      req = {};
      res = {};
      next = jest.fn();
    });

    it('llama next() sin argumentos cuando no hay errores', () => {
      validationResult.mockReturnValue({ isEmpty: () => true });
      ValidatorUtil.handleValidationErrors(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('propaga un AppError 422 con los errores formateados (msg objeto)', () => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ path: 'email', msg: { message: 'Email inválido', hint: 'usá @' }, value: 'bad' }]
      });

      ValidatorUtil.handleValidationErrors(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('UNPROCESSABLE_ENTITY');
      expect(err.message).toBe('Error de validación');
      expect(err.details).toEqual([{ field: 'email', message: 'Email inválido', hint: 'usá @', value: 'bad' }]);
    });

    it('usa hint null cuando el msg es un string plano', () => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ path: 'name', msg: 'Requerido', value: '' }]
      });

      ValidatorUtil.handleValidationErrors(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err.details[0]).toEqual({ field: 'name', message: 'Requerido', hint: null, value: '' });
    });

    it('cae a err.param cuando no hay err.path', () => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ param: 'legacyField', msg: 'x', value: 1 }]
      });

      ValidatorUtil.handleValidationErrors(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err.details[0].field).toBe('legacyField');
    });
  });

  describe('isValidUUID', () => {
    it('acepta un UUID v4 válido', () => {
      expect(ValidatorUtil.isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('rechaza strings que no son UUID', () => {
      expect(ValidatorUtil.isValidUUID('no-es-uuid')).toBe(false);
      expect(ValidatorUtil.isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('rechaza un UUID con versión inválida (dígito 0 en la posición de versión)', () => {
      // El regex exige versión 1-5 en el tercer bloque.
      expect(ValidatorUtil.isValidUUID('550e8400-e29b-01d4-a716-446655440000')).toBe(false);
    });

    it('rechaza valores vacíos / null / undefined', () => {
      expect(ValidatorUtil.isValidUUID('')).toBe(false);
      expect(ValidatorUtil.isValidUUID(null)).toBe(false);
      expect(ValidatorUtil.isValidUUID(undefined)).toBe(false);
    });
  });
});
