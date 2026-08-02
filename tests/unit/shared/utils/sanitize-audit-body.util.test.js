// tests/unit/shared/sanitize-audit-body.util.test.js
//
// Sanitización de cuerpos para logs/auditoría: redacta campos sensibles, trunca
// strings/arrays largos y limita la profundidad de anidamiento. Mockeamos
// shared/constants para fijar server.nodeEnv (usado por sanitizeErrorContext).

jest.mock('shared/constants', () => ({
  server: { nodeEnv: 'test' }
}));

const { sanitizeAuditBody, sanitizeErrorContext, SENSITIVE_FIELDS } = require('shared/utils/sanitize-audit-body.util');

describe('sanitize-audit-body.util', () => {
  describe('SENSITIVE_FIELDS', () => {
    it('exporta la lista de campos sensibles conocidos', () => {
      expect(Array.isArray(SENSITIVE_FIELDS)).toBe(true);
      expect(SENSITIVE_FIELDS).toEqual(expect.arrayContaining(['password', 'token', 'secret', 'authorization']));
    });
  });

  describe('sanitizeAuditBody — redacción', () => {
    it('redacta campos sensibles por coincidencia de substring e insensible a mayúsculas', () => {
      const out = sanitizeAuditBody({
        password: 'secreta',
        userPassword: 'x',
        AccessToken: 'abc',
        normal: 'visible'
      });
      expect(out.password).toBe('[REDACTED]');
      expect(out.userPassword).toBe('[REDACTED]');
      expect(out.AccessToken).toBe('[REDACTED]');
      expect(out.normal).toBe('visible');
    });
  });

  describe('sanitizeAuditBody — tipos primitivos', () => {
    it('preserva números, booleanos y null', () => {
      const out = sanitizeAuditBody({ n: 5, b: true, z: null });
      expect(out).toEqual({ n: 5, b: true, z: null });
    });

    it('convierte Date a ISO string', () => {
      const d = new Date('2026-01-01T00:00:00.000Z');
      const out = sanitizeAuditBody({ createdAt: d });
      expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('trunca strings de más de 500 caracteres', () => {
      const largo = 'a'.repeat(600);
      const out = sanitizeAuditBody({ nota: largo });
      expect(out.nota).toBe(`${'a'.repeat(500)}...[truncated]`);
    });

    it('no trunca strings dentro del límite', () => {
      const out = sanitizeAuditBody({ nota: 'corto' });
      expect(out.nota).toBe('corto');
    });
  });

  describe('sanitizeAuditBody — arrays', () => {
    it('mapea arrays dentro del límite (<=10) sin truncar', () => {
      const out = sanitizeAuditBody({ items: [1, 2, 3] });
      expect(out.items).toEqual([1, 2, 3]);
    });

    it('trunca arrays de más de 10 items y agrega el contador', () => {
      const arr = Array.from({ length: 13 }, (_, i) => i);
      const out = sanitizeAuditBody({ items: arr });
      expect(out.items).toHaveLength(11); // 10 + marcador
      expect(out.items[10]).toBe('...[3 more items]');
    });
  });

  describe('sanitizeAuditBody — profundidad y no-objetos', () => {
    it('devuelve el valor tal cual cuando no es objeto', () => {
      expect(sanitizeAuditBody('hola')).toBe('hola');
      expect(sanitizeAuditBody(123)).toBe(123);
      expect(sanitizeAuditBody(null)).toBeNull();
    });

    it('corta el anidamiento al superar MAX_DEPTH (3)', () => {
      const anidado = { a: { b: { c: { d: { e: 1 } } } } };
      const out = sanitizeAuditBody(anidado);
      expect(out.a.b.c.d).toBe('[Max depth reached]');
    });

    it('sanitiza objetos anidados dentro del límite de profundidad', () => {
      const out = sanitizeAuditBody({ a: { password: 'x', ok: 1 } });
      expect(out.a.password).toBe('[REDACTED]');
      expect(out.a.ok).toBe(1);
    });
  });

  describe('sanitizeErrorContext', () => {
    it('agrega timestamp ISO y environment desde las constantes', () => {
      const out = sanitizeErrorContext({ password: 'x', detalle: 'algo' });
      expect(out.password).toBe('[REDACTED]');
      expect(out.detalle).toBe('algo');
      expect(out.environment).toBe('test');
      expect(typeof out.timestamp).toBe('string');
      expect(() => new Date(out.timestamp).toISOString()).not.toThrow();
    });
  });
});
