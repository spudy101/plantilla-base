// modules/schemas/core/services/dual-approval/dual-approval-notifier.service.js
//
// Notificaciones del framework de doble aprobación: aviso a los aprobadores cuando se crea una
// solicitud y aviso al solicitante (maker) cuando se resuelve. Extraído de DualApprovalService
// (SOLID: S) — el canal y el contenido de los avisos cambian por razones distintas que el motor.

const userRepository = require('../../../kyc/iam/repositories/user.repository');
const NotificationCreationService = require('../../../notification/services/notification-creation.service');
const { logger } = require('../../../../../shared/utils/logger.util');
const { notifications } = require('../../../../../shared/constants');

const NOTIF_DUAL_APPROVAL_RESOLVED = 'DUAL_APPROVAL_RESOLVED';

class DualApprovalNotifierService {
  /** @param {object} [deps] Dependencias inyectables (SOLID: D). */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  /** Avisa a todos los usuarios activos con un rol aprobador de la operación (fire-and-forget). */
  async notifyApprovers(op, request, ctx) {
    let approvers = [];
    try {
      approvers = await this.userRepository.findActiveUsersByRoleNames(op.approverRoles, {
        attributes: ['user_id'],
        includePerson: false
      });
    } catch (err) {
      logger.warn('[DualApproval] Error buscando aprobadores', { error: err.message, operationKey: request.operation_key });
      return;
    }

    for (const approver of approvers ?? []) {
      setImmediate(() => {
        this.NotificationCreationService.crearNotificacion({
          tipoNotificacion: op.notificationType,
          userId: approver.user_id,
          relatedEntity: { type: 'ApprovalRequest', id: request.approval_request_id },
          metadata: {
            approvalRequestId: request.approval_request_id,
            operationLabel: op.label,
            entityType: request.entity_type,
            entityId: request.entity_id,
            firstName: ctx.adminFirstName ?? '',
            logoUrl: notifications?.ses?.logoUrl ?? ''
          }
        }).catch(err =>
          logger.warn('[DualApproval] Error notificando aprobador', {
            error: err.message,
            approvalRequestId: request.approval_request_id
          })
        );
      });
    }
  }

  /** Avisa al solicitante (maker) la decisión tomada sobre su solicitud (fire-and-forget). */
  notifyMaker(request, op, decision) {
    if (!request.requested_by) {
      return;
    }
    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: NOTIF_DUAL_APPROVAL_RESOLVED,
        userId: request.requested_by,
        relatedEntity: { type: 'ApprovalRequest', id: request.approval_request_id },
        metadata: {
          approvalRequestId: request.approval_request_id,
          operationLabel: op.label,
          decision,
          logoUrl: notifications?.ses?.logoUrl ?? ''
        }
      }).catch(err =>
        logger.warn('[DualApproval] Error notificando al maker', {
          error: err.message,
          approvalRequestId: request.approval_request_id
        })
      );
    });
  }
}

module.exports = DualApprovalNotifierService;
