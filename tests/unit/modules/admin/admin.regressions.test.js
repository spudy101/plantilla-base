// tests/unit/modules/admin/admin.regressions.test.js
//
// Regresiones de bugs que destapó el tipado de modules/admin (fase 4 de la migración a TS).

const { ApprovalRequestComponent } = require('shared/dtos/core/components-approval.dto');
const { IntegrationLogListItemDTO } = require('modules/admin/integration/dtos/integration-monitoring.dto');
const { adminAuditContext } = require('shared/utils/admin-audit-context.util');
const PaginationHelper = require('shared/utils/pagination.util');

describe('Timestamps de modelos underscored', () => {
  // En una consulta normal Sequelize expone el atributo (createdAt), no la columna (created_at).
  // Estos DTOs leían created_at → la fecha salía siempre null/undefined.
  const createdAt = new Date('2026-01-02T03:04:05Z');
  const updatedAt = new Date('2026-01-03T03:04:05Z');

  it('ApprovalRequestComponent devuelve createdAt/updatedAt del atributo', () => {
    const dto = ApprovalRequestComponent.build({ approval_request_id: 'ar-1', operation_key: 'X', status: 'pending', createdAt, updatedAt });
    expect(dto.createdAt).toBe(createdAt);
    expect(dto.updatedAt).toBe(updatedAt);
    expect(ApprovalRequestComponent.buildList({ approval_request_id: 'ar-1', operation_key: 'X', status: 'pending', createdAt }).createdAt).toBe(createdAt);
  });

  it('IntegrationLogListItemDTO devuelve la fecha de la llamada', () => {
    expect(IntegrationLogListItemDTO({ api_log_id: 'l-1', product: 'ses', createdAt }).createdAt).toBe(createdAt);
  });
});

describe('adminAuditContext', () => {
  // Reemplaza 6 copias locales (_auditCtx / _approverCtx) que variaban entre controllers.
  it('arma el contexto completo desde el usuario autenticado y el contexto HTTP', () => {
    const req = { user: { userId: 'a-1', roleName: 'ADMIN', firstName: 'Ana' } };
    const res = { locals: { auditContext: { ip: '10.0.0.1', userAgent: 'jest' } } };
    expect(adminAuditContext(req, res)).toEqual({
      adminUserId: 'a-1',
      adminRoleName: 'ADMIN',
      adminFirstName: 'Ana',
      ipAddress: '10.0.0.1',
      userAgent: 'jest'
    });
  });

  it('responde 401 si la ruta quedó sin autenticación', () => {
    expect(() => adminAuditContext({}, { locals: {} })).toThrow(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('PaginationHelper.booleanParam', () => {
  // Los validators con .toBoolean() dejan boolean; sin sanitizer llega 'true'/'false'.
  it.each([
    [true, true],
    ['true', true],
    [false, false],
    ['false', false],
    [undefined, undefined],
    ['si', undefined]
  ])('%p → %p', (value, expected) => {
    expect(PaginationHelper.booleanParam({ flag: value }, 'flag')).toBe(expected);
  });
});
