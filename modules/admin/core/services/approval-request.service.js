// Service del módulo admin de doble aprobación. Delega en el core DualApprovalService
// (capa de datos en schemas/core) y agrega la auditoría de los endpoints admin.

const { logAudit } = require('../../../../shared/utils/logger.util');
const DualApprovalService = require('../../../schemas/core/services/dual-approval.service');

const ENTITY = { entityType: 'ApprovalRequest', entityTable: 'approval_requests' };

class ApprovalRequestService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new ApprovalRequestService({ DualApprovalService: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
  }

  async list(query, adminUserId) {
    const result = await this.DualApprovalService.list(query);
    logAudit(
      'APPROVAL_REQUEST_LIST_VIEWED',
      adminUserId,
      { operationKey: query.operationKey ?? null, status: query.status ?? null },
      ENTITY
    );
    return result;
  }

  async getById(id, adminUserId) {
    const data = await this.DualApprovalService.getById(id);
    logAudit('APPROVAL_REQUEST_VIEWED', adminUserId, {}, { entityId: id, ...ENTITY });
    return data;
  }

  async getPolicy(adminUserId) {
    const data = await this.DualApprovalService.getPolicy();
    logAudit('APPROVAL_POLICY_VIEWED', adminUserId, {}, ENTITY);
    return data;
  }

  // El core ya audita DUAL_APPROVAL_APPROVED / DUAL_APPROVAL_REJECTED y valida rol + segregación.
  // eslint-disable-next-line class-methods-use-this
  resolve(id, body, approverCtx) {
    return this.DualApprovalService.resolve(id, body, approverCtx);
  }
}

module.exports = new ApprovalRequestService();
module.exports.ApprovalRequestService = ApprovalRequestService;
