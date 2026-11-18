// La salida de los componentes de auth cumple su esquema (y por lo tanto su documentación).
import components, { UserChangeLogSchema, UserSessionSchema } from './auth-components.response';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const at = new Date('2026-01-01T00:00:00Z');
const user = { userId: ID, username: 'ana', person: { firstName: 'Ana', lastName: 'Pérez' } };

const ok = (schema: { safeParse(v: unknown): { error?: { issues: unknown[] } } }, value: unknown) =>
  expect(schema.safeParse(value).error?.issues ?? []).toEqual([]);

describe('esquemas de salida de auth', () => {
  it('sesión', () => {
    ok(
      UserSessionSchema,
      components.UserSessionComponent.build({
        userSessionId: ID,
        status: 'closed',
        ipAddress: null,
        userAgent: 'jest',
        startedAt: at,
        lastAccessAt: at,
        closedAt: at,
        closeReason: 'logout',
        createdAt: at,
        sessionUser: user
      })
    );
  });

  it('cambio de cuenta (valores enmascarados)', () => {
    ok(
      UserChangeLogSchema,
      components.UserChangeLogComponent.build({
        logId: ID,
        userId: ID,
        user,
        changedByUserId: null,
        changedByRole: 'system',
        changedBy: null,
        changeType: 'email',
        previousValue: 'ana@correo.co',
        newValue: 'ana2@correo.co',
        changeReason: null,
        ipAddress: null,
        userAgent: null,
        originSessionId: null,
        createdAt: at
      })
    );
  });
});
