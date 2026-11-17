// tests/unit/guards/smoke.test.ts
// Test de humo mínimo para verificar que la infraestructura de test funciona
// y que el catálogo de modelos carga sin errores de asociación.

describe('smoke', () => {
  it('el entorno de test está activo', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('el catálogo de modelos (shared/models) carga y expone los modelos core', () => {
    const db = require('shared/models');
    expect(db.User).toBeDefined();
    expect(db.Person).toBeDefined();
    expect(db.UserSession).toBeDefined();
    expect(db.AuditLog).toBeDefined();
    expect(db.ApprovalRequest).toBeDefined();
    expect(db.Notification).toBeDefined();
  });
});
