// modules/schemas/core/services/dual-approval/dual-approval-notifier.service.ts
//
// Notificaciones del framework de doble aprobación: aviso a los aprobadores cuando se crea una
// solicitud y aviso al solicitante (maker) cuando se resuelve. Extraído de DualApprovalService
// (SOLID: S) — el canal y el contenido de los avisos cambian por razones distintas que el motor.

import userRepository = require('../../../kyc/iam/repositories/user.repository');
import NotificationCreationService = require('../../../notification/services/notification-creation.service');
import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logger } = loggerUtilModule;
import constantsModule = require('../../../../../shared/constants');
const { notifications } = constantsModule;
import errorMessageModule = require('../../../../../shared/utils/error-message.util');

const { errorMessage } = errorMessageModule;
import type { AdminAuditContext } from '../../../../../shared/types/audit-context';
import type DualApprovalConstants = require('../../../../../shared/constants/dual-approval');
import type defineApprovalRequest = require('../../models/approval-request.model');
import type defineUser = require('../../../kyc/iam/models/user.model');


const NOTIF_DUAL_APPROVAL_RESOLVED = 'DUAL_APPROVAL_RESOLVED';

class DualApprovalNotifierService {
  userRepository: typeof userRepository;
  NotificationCreationService: typeof NotificationCreationService;

  /** @param {object} [deps] Dependencias inyectables (SOLID: D). */
  constructor(deps: DualApprovalNotifierService.Deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  /** Avisa a todos los usuarios activos con un rol aprobador de la operación (fire-and-forget). */
  async notifyApprovers(op: DualApprovalConstants.Op, request: defineApprovalRequest.Instance, ctx: AdminAuditContext) {
    let approvers: defineUser.Instance[] = [];
    try {
      approvers = await this.userRepository.findActiveUsersByRoleNames(op.approverRoles, {
        attributes: ['user_id'],
        includePerson: false
      });
    } catch (err) {
      logger.warn('[DualApproval] Error buscando aprobadores', { error: errorMessage(err), operationKey: request.operation_key });
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
  notifyMaker(request: defineApprovalRequest.Instance, op: DualApprovalConstants.Op, decision: 'approve' | 'reject') {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace DualApprovalNotifierService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userRepository?: typeof userRepository;
    NotificationCreationService?: typeof NotificationCreationService;
  }
}

export = DualApprovalNotifierService;
