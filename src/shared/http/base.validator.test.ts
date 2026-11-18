// tests/unit/shared/base.validator.test.ts
//
// BaseValidator: chains base reutilizables de express-validator (RF-LP-03).
// Ejecutamos cada chain contra un req simulado y verificamos con validationResult
// el comportamiento real (aceptación, rechazo, mensaje + hint, y coerción de tipos).
// Mockeamos shared/constants para fijar REGEX de forma determinista (sin depender
// de config/env). NO se toca red ni BD.

jest.mock('../constants', () => ({
  REGEX: {
    EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d])\S{8,}$/
  }
}));

import { Loose, fixture } from 'tests/helpers/mock';
import type { ValidationChain } from 'express-validator';
import { validationResult } from 'express-validator';
import BaseValidator from './base.validator';

interface FakeReqParts {
  body?: Record<string, Loose>;
  params?: Record<string, Loose>;
  query?: Record<string, Loose>;
  headers?: Record<string, Loose>;
  files?: unknown;
}

/**
 * Ejecuta un array de chains contra un req simulado y devuelve el resultado.
 * `req` se muta con los valores saneados/coercionados (útil para verificar toBoolean/toInt/toDate).
 */
async function run(chains: ValidationChain[], { body = {}, params = {}, query = {}, headers = {}, files }: FakeReqParts = {}) {
  const req = { body, params, query, headers, files };
  for (const chain of chains) {
    await chain.run(req);
  }
  return { result: validationResult(req), req };
}

/** Devuelve el primer error o undefined. */
function firstError(result: Loose) {
  return result.array()[0];
}

describe('BaseValidator', () => {
  describe('nationalId', () => {
    it('acepta un documento de longitud válida', async () => {
      const { result } = await run(BaseValidator.nationalId(), { body: { nationalId: '12345678' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza vacío con mensaje "requerido"', async () => {
      const { result } = await run(BaseValidator.nationalId(), { body: { nationalId: '' } });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('requerido');
    });

    it('rechaza documento demasiado corto (menos de 4)', async () => {
      const { result } = await run(BaseValidator.nationalId(), { body: { nationalId: '123' } });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('entre 4 y 20');
    });

    it('cada mensaje de error incluye hint (RF-LP-03)', async () => {
      const { result } = await run(BaseValidator.nationalId(), { body: { nationalId: '' } });
      expect(firstError(result).msg.hint).toBeTruthy();
    });
  });

  describe('firstName', () => {
    it('acepta un nombre con letras, acentos y espacios', async () => {
      const { result } = await run(BaseValidator.firstName(), { body: { firstName: 'José María' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza nombres con dígitos', async () => {
      const { result } = await run(BaseValidator.firstName(), { body: { firstName: 'Juan123' } });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('solo puede contener letras');
    });

    it('rechaza nombre de un solo carácter (min 2)', async () => {
      const { result } = await run(BaseValidator.firstName(), { body: { firstName: 'A' } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('email', () => {
    it('acepta un email válido', async () => {
      const { result } = await run(BaseValidator.email(), { body: { email: 'user@dominio.com' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza un email malformado', async () => {
      const { result } = await run(BaseValidator.email(), { body: { email: 'no-es-email' } });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('email válido');
    });

    it('rechaza vacío como requerido', async () => {
      const { result } = await run(BaseValidator.email(), { body: { email: '' } });
      expect(firstError(result).msg.message).toContain('requerido');
    });
  });

  describe('password', () => {
    it('acepta una contraseña de 10+ chars con complejidad', async () => {
      const { result } = await run(BaseValidator.password(), { body: { password: 'Abcd12345!' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza una contraseña compleja pero corta (<10)', async () => {
      // Cumple el regex ({8,}) pero falla isLength(min:10).
      const { result } = await run(BaseValidator.password(), { body: { password: 'Abcd123!' } });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('al menos 10');
    });

    it('rechaza una contraseña sin complejidad', async () => {
      const { result } = await run(BaseValidator.password(), { body: { password: 'aaaaaaaaaaaa' } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('birthDate / optionalBirthDate', () => {
    it('acepta una fecha ISO válida y la coerce a Date', async () => {
      const { result, req } = await run(BaseValidator.birthDate(), { body: { birthDate: '1990-05-20' } });
      expect(result.isEmpty()).toBe(true);
      expect(req.body.birthDate).toBeInstanceOf(Date);
    });

    it('rechaza una fecha no ISO', async () => {
      const { result } = await run(BaseValidator.birthDate(), { body: { birthDate: '20/05/1990' } });
      expect(result.isEmpty()).toBe(false);
    });

    it('optionalBirthDate pasa cuando el campo está ausente', async () => {
      const { result } = await run(BaseValidator.optionalBirthDate(), { body: {} });
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('phone / optionalPostalCode', () => {
    it('phone acepta 6-15 dígitos', async () => {
      const { result } = await run(BaseValidator.phone(), { body: { phone: '56912345678' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('phone rechaza con letras', async () => {
      const { result } = await run(BaseValidator.phone(), { body: { phone: '12ab34' } });
      expect(result.isEmpty()).toBe(false);
    });

    it('optionalPostalCode ausente no falla', async () => {
      const { result } = await run(BaseValidator.optionalPostalCode(), { body: {} });
      expect(result.isEmpty()).toBe(true);
    });

    it('optionalPostalCode rechaza formato inválido cuando está presente', async () => {
      const { result } = await run(BaseValidator.optionalPostalCode(), { body: { postalCode: 'ABC' } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('resetType (isIn) y totpCode', () => {
    it('resetType acepta valores del enum', async () => {
      const { result } = await run(BaseValidator.resetType(), { body: { type: 'password' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('resetType rechaza un valor fuera del enum', async () => {
      const { result } = await run(BaseValidator.resetType(), { body: { type: 'otro' } });
      expect(result.isEmpty()).toBe(false);
    });

    it('totpCode acepta exactamente 6 dígitos numéricos', async () => {
      const { result } = await run(BaseValidator.totpCode(), { body: { totpCode: '123456' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('totpCode rechaza longitud distinta de 6', async () => {
      const { result } = await run(BaseValidator.totpCode(), { body: { totpCode: '12345' } });
      expect(result.isEmpty()).toBe(false);
    });

    it('totpCode rechaza caracteres no numéricos', async () => {
      const { result } = await run(BaseValidator.totpCode(), { body: { totpCode: 'abcdef' } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('resetToken', () => {
    it('acepta un token de exactamente 64 caracteres', async () => {
      const { result } = await run(BaseValidator.resetToken(), { body: { token: 'a'.repeat(64) } });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza un token de longitud distinta', async () => {
      const { result } = await run(BaseValidator.resetToken(), { body: { token: 'a'.repeat(10) } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('UUIDs (body / param)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    it('uuidBody acepta un UUID válido', async () => {
      const { result } = await run(BaseValidator.uuidBody('id', 'El id'), { body: { id: uuid } });
      expect(result.isEmpty()).toBe(true);
    });

    it('uuidBody rechaza un valor no-UUID con el label en el mensaje', async () => {
      const { result } = await run(BaseValidator.uuidBody('id', 'El id'), { body: { id: 'abc' } });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('El id');
    });

    it('uuidParam valida desde req.params', async () => {
      const { result } = await run(BaseValidator.uuidParam('id', 'El id'), { params: { id: uuid } });
      expect(result.isEmpty()).toBe(true);
    });

    it('optionalUuidBody ausente no falla', async () => {
      const { result } = await run(BaseValidator.optionalUuidBody('id', 'El id'), { body: {} });
      expect(result.isEmpty()).toBe(true);
    });
  });

  describe('booleanos con coerción', () => {
    it('optionalBoolean coerce "true" a booleano real', async () => {
      const { result, req } = await run(BaseValidator.optionalBoolean('flag'), { body: { flag: 'true' } });
      expect(result.isEmpty()).toBe(true);
      expect(req.body.flag).toBe(true);
    });

    it('requiredBoolean rechaza si el campo no existe', async () => {
      const { result } = await run(BaseValidator.requiredBoolean('flag'), { body: {} });
      expect(result.isEmpty()).toBe(false);
      expect(firstError(result).msg.message).toContain('requerido');
    });

    it('requiredBoolean rechaza un valor no booleano', async () => {
      const { result } = await run(BaseValidator.requiredBoolean('flag'), { body: { flag: 'quizas' } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('pagination y searchQuery (query params)', () => {
    it('pagination acepta valores válidos y coerce a int', async () => {
      const { result, req } = await run(BaseValidator.pagination(), {
        query: { page: '2', limit: '50', order: 'ASC' }
      });
      expect(result.isEmpty()).toBe(true);
      expect(req.query.page).toBe(2);
      expect(req.query.limit).toBe(50);
    });

    it('pagination rechaza limit fuera de rango (>100)', async () => {
      const { result } = await run(BaseValidator.pagination(), { query: { limit: '500' } });
      expect(result.isEmpty()).toBe(false);
    });

    it('pagination rechaza order fuera del enum', async () => {
      const { result } = await run(BaseValidator.pagination(), { query: { order: 'SIDEWAYS' } });
      expect(result.isEmpty()).toBe(false);
    });

    it('searchQuery rechaza búsquedas de más de 100 caracteres', async () => {
      const { result } = await run(BaseValidator.searchQuery(), { query: { search: 'x'.repeat(101) } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('dateRangeQuery', () => {
    it('acepta from/to ISO válidos y ausentes', async () => {
      const { result } = await run(BaseValidator.dateRangeQuery(), {
        query: { dateFrom: '2026-01-01', dateTo: '2026-02-01' }
      });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza una fecha no ISO en el rango', async () => {
      const { result } = await run(BaseValidator.dateRangeQuery(), { query: { dateFrom: 'ayer' } });
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('fileUpload (custom)', () => {
    const buildFiles = (mimetype: Loose, size: Loose) => ({ doc: [{ mimetype, size }] });

    it('acepta un archivo con MIME permitido y tamaño válido', async () => {
      const { result } = await run(
        BaseValidator.fileUpload('doc', { mimeTypes: ['application/pdf'], maxSizeMb: 1 }),
        fixture({ files: buildFiles('application/pdf', 500 * 1024) })
      );
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza cuando no hay archivo', async () => {
      const { result } = await run(BaseValidator.fileUpload('doc', { mimeTypes: ['application/pdf'] }), fixture({ files: {} }));
      expect(result.isEmpty()).toBe(false);
    });

    it('rechaza un MIME no permitido', async () => {
      const { result } = await run(
        BaseValidator.fileUpload('doc', { mimeTypes: ['application/pdf'] }),
        fixture({ files: buildFiles('image/png', 1000) })
      );
      expect(result.isEmpty()).toBe(false);
    });

    it('rechaza un archivo que supera el tamaño máximo', async () => {
      const { result } = await run(
        BaseValidator.fileUpload('doc', { mimeTypes: ['application/pdf'], maxSizeMb: 1 }),
        fixture({ files: buildFiles('application/pdf', 5 * 1024 * 1024) })
      );
      expect(result.isEmpty()).toBe(false);
    });
  });

  describe('refreshTokenHeader', () => {
    it('acepta el header presente', async () => {
      const { result } = await run(BaseValidator.refreshTokenHeader(), { headers: { 'x-refresh-token': 'abc' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('rechaza cuando el header falta', async () => {
      const { result } = await run(BaseValidator.refreshTokenHeader(), { headers: {} });
      expect(result.isEmpty()).toBe(false);
    });
  });

  // Regresión: middleName/secondLastName usaban `\\s` (backslash literal + s) en la
  // regex en lugar de `\s`, lo que rechazaba nombres compuestos con espacio. Debe
  // haber paridad con las variantes optional* (que ya usaban `\s`).
  describe('middleName / secondLastName aceptan espacios (regresión \\s)', () => {
    it('middleName acepta un nombre compuesto con espacio', async () => {
      const { result } = await run(BaseValidator.middleName(), { body: { middleName: 'María José' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('secondLastName acepta un apellido compuesto con espacio', async () => {
      const { result } = await run(BaseValidator.secondLastName(), { body: { secondLastName: 'de la Fuente' } });
      expect(result.isEmpty()).toBe(true);
    });

    it('middleName sigue rechazando dígitos', async () => {
      const { result } = await run(BaseValidator.middleName(), { body: { middleName: 'Jose123' } });
      expect(result.isEmpty()).toBe(false);
    });
  });
});
