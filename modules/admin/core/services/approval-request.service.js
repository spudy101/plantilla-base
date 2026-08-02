// Service del módulo admin de doble aprobación. Delega en el core DualApprovalService
// (capa de datos en schemas/core) y agrega la auditoría de los endpoints admin.

const { logAudit } = require('../../../../shared/utils/logger.util');
const DualApprovalService = require('../../../schemas/core/services/dual-approval.service');

const ENTITY = { entityType: 'ApprovalRequest', entityTable: 'approval_requests' };

class ApprovalRequestService {
  async list(query, adminUserId) {
    const result = await DualApprovalService.list(query);
    logAudit(
      'APPROVAL_REQUEST_LIST_VIEWED',
      adminUserId,
      { operationKey: query.operationKey ?? null, status: query.status ?? null },
      ENTITY
    );
    return result;
  }

  async getById(id, adminUserId) {
    const data = await DualApprovalService.getById(id);
    logAudit('APPROVAL_REQUEST_VIEWED', adminUserId, {}, { entityId: id, ...ENTITY });
    return data;
  }

  async getPolicy(adminUserId) {
    const data = await DualApprovalService.getPolicy();
    logAudit('APPROVAL_POLICY_VIEWED', adminUserId, {}, ENTITY);
    return data;
  }

  // El core ya audita DUAL_APPROVAL_APPROVED / DUAL_APPROVAL_REJECTED y valida rol + segregación.
  // eslint-disable-next-line class-methods-use-this
  resolve(id, body, approverCtx) {
    return DualApprovalService.resolve(id, body, approverCtx);
  }
}

module.exports = new ApprovalRequestService();
