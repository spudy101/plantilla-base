// tests/unit/modules/admin/core/services/approval-request.service.test.js
//
// ApprovalRequestService — capa admin de doble aprobación. Es un delgado orquestador que delega en
// el core DualApprovalService y agrega la auditoría de los endpoints admin (list/getById/getPolicy).
// resolve() delega sin auditar (el core ya audita y valida rol + segregación). Aislamos el core y el
// logger para verificar SOLO la delegación y las llamadas a logAudit.

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('modules/schemas/core/services/dual-approval.service', () => ({
  list: jest.fn(),
  getById: jest.fn(),
  getPolicy: jest.fn(),
  resolve: jest.fn()
}));

const { logAudit } = require('shared/utils/logger.util');
const DualApprovalService = require('modules/schemas/core/services/dual-approval.service');
const service = require('modules/admin/core/services/approval-request.service');

const ADMIN = 'admin-1';
const ENTITY = { entityType: 'ApprovalRequest', entityTable: 'approval_requests' };

describe('ApprovalRequestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('delega en el core y audita con operationKey/status normalizados', async () => {
      const coreResult = { data: [{ id: 'r1' }], metadata: {} };
      DualApprovalService.list.mockResolvedValue(coreResult);
      const query = { operationKey: 'CLIENT_ACCOUNT_DELETE', status: 'pending' };

      const result = await service.list(query, ADMIN);

      expect(DualApprovalService.list).toHaveBeenCalledWith(query);
      expect(logAudit).toHaveBeenCalledWith(
        'APPROVAL_REQUEST_LIST_VIEWED',
        ADMIN,
        { operationKey: 'CLIENT_ACCOUNT_DELETE', status: 'pending' },
        ENTITY
      );
      expect(result).toBe(coreResult);
    });

    it('normaliza operationKey/status ausentes a null en la auditoría', async () => {
      DualApprovalService.list.mockResolvedValue({ data: [] });

      await service.list({}, ADMIN);

      expect(logAudit).toHaveBeenCalledWith(
        'APPROVAL_REQUEST_LIST_VIEWED',
        ADMIN,
        { operationKey: null, status: null },
        ENTITY
      );
    });
  });

  describe('getById', () => {
    it('delega en el core y audita con entityId', async () => {
      const data = { id: 'req-9' };
      DualApprovalService.getById.mockResolvedValue(data);

      const result = await service.getById('req-9', ADMIN);

      expect(DualApprovalService.getById).toHaveBeenCalledWith('req-9');
      expect(logAudit).toHaveBeenCalledWith('APPROVAL_REQUEST_VIEWED', ADMIN, {}, { entityId: 'req-9', ...ENTITY });
      expect(result).toBe(data);
    });
  });

  describe('getPolicy', () => {
    it('delega en el core y audita la consulta de política', async () => {
      const data = { operations: [] };
      DualApprovalService.getPolicy.mockResolvedValue(data);

      const result = await service.getPolicy(ADMIN);

      expect(DualApprovalService.getPolicy).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('APPROVAL_POLICY_VIEWED', ADMIN, {}, ENTITY);
      expect(result).toBe(data);
    });
  });

  describe('resolve', () => {
    it('delega en el core sin auditar (el core ya audita y valida segregación)', () => {
      const coreResult = Promise.resolve({ status: 'approved' });
      DualApprovalService.resolve.mockReturnValue(coreResult);
      const body = { decision: 'approve' };
      const ctx = { approverUserId: 'admin-2' };

      const result = service.resolve('req-1', body, ctx);

      expect(DualApprovalService.resolve).toHaveBeenCalledWith('req-1', body, ctx);
      expect(logAudit).not.toHaveBeenCalled();
      expect(result).toBe(coreResult);
    });
  });
});
