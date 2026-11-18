// tests/integration/app-smoke.test.ts
//
// Smoke test end-to-end del pipeline HTTP. Levanta la app Express real (cliente) con
// supertest y verifica que el request atraviesa toda la cadena de middlewares
// (correlation → security → body-parse → audit → routing → error handling) y responde
// con los contratos esperados.
//
// Complementa a los tests de servicio/unidad (que cubren la lógica de negocio con
// repos mockeados): este valida que la app se ENSAMBLA y RESPONDE de punta a punta.
//
// Necesita Postgres: la BD de test es el esquema aislado de tests/test-env.ts (`npm run db:test:prepare`).
// /health verifica la base (shared/database/database-health.ts).

import request from 'supertest';

// La app se exporta ya construida: `new ClientApp().getApp()`.
import app from '../../modules/client/app';

describe('App smoke (client) · pipeline HTTP end-to-end', () => {
  it('GET /health responde 200 con el contrato de health check', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: expect.any(String),
      service: expect.any(String),
      checks: expect.objectContaining({
        database: expect.objectContaining({ status: 'healthy' })
      })
    });
  });

  it('GET / responde con la info del servicio', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      service: expect.any(String)
    });
  });

  it('propaga el Correlation ID en el header de respuesta', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('respeta un X-Correlation-Id entrante', async () => {
    const incoming = 'smoke-test-correlation-id';
    const res = await request(app).get('/health').set('X-Correlation-Id', incoming);
    expect(res.headers['x-correlation-id']).toBe(incoming);
  });

  it('ruta desconocida → 404 con el envelope de error estándar', async () => {
    const res = await request(app).get('/api/v1/ruta-que-no-existe-jamas');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
  });

  it('JSON malformado → 400 INVALID_JSON_BODY (no INTERNAL_ERROR)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": ');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'INVALID_JSON_BODY'
    });
  });

  it('aplica headers de seguridad (helmet)', async () => {
    const res = await request(app).get('/health');
    // helmet fija, entre otros, X-Content-Type-Options: nosniff
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
