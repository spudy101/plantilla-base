// tests/unit/shared/middlewares/error.middleware.prisma.test.ts
//
// Errores de restricción de la base que llegan desde Prisma (fase 5 de docs/prisma-migration.md): deben
// responder igual que los de Sequelize (409 UNIQUE con la etiqueta del campo, 400 FK) en vez de un 500.

import ErrorMiddleware from './error.middleware';

function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown, status: jest.fn(), json: jest.fn(), set: jest.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json.mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  });
  return res;
}

const prismaError = (code: string, meta: Record<string, unknown> = {}) => ({ name: 'PrismaClientKnownRequestError', code, meta });

describe('ErrorMiddleware — errores de Prisma', () => {
  const handle = (err: object) => {
    const res = fakeRes();
    ErrorMiddleware._handleKnownErrors(err as never, res as never, { correlationId: 'c-1' } as never);
    return res;
  };

  it('P2002 → 409 con la etiqueta del campo (nombre de campo de Prisma pasado a la columna)', () => {
    const res = handle(prismaError('P2002', { target: ['nationalId'] }));
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.body)).toContain('número de documento');
  });

  it('P2002 con los campos en la causa del adaptador y sin etiqueta → mensaje genérico', () => {
    const res = handle(prismaError('P2002', { driverAdapterError: { cause: { constraint: { fields: ['"code"'] } } } }));
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.body)).toContain('uno de los datos ingresados');
  });

  it('P2003 → 400 referencia inválida; P2025 → 404', () => {
    expect(handle(prismaError('P2003')).statusCode).toBe(400);
    expect(handle(prismaError('P2025')).statusCode).toBe(404);
  });

  it('otro código → 500 de base de datos', () => {
    expect(handle(prismaError('P1001')).statusCode).toBe(500);
  });
});
