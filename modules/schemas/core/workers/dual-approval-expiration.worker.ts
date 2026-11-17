import cron from 'node-cron';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import requestContext from '../../../../shared/utils/request-context.util';
import approvalRequestRepository from '../repositories/approval-request.repository';
import domainEnumsModule from '../../../../shared/constants/domain-enums';
const { APPROVAL_REQUEST_STATUS } = domainEnumsModule;
import errorMessageModule from '../../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


// Cron hardcodeado (convención del repo: los workers no leen el cron de env vars).
// Diario a las 3:00 AM — marca `expired` las solicitudes pendientes con TTL vencido.
const CRON_EXPRESSION = '0 3 * * *';

class DualApprovalExpirationWorker {
  static iniciar() {
    cron.schedule(CRON_EXPRESSION, () =>
      requestContext.runAsWorker('dual-approval-expiration.expire', async () => {
        logger.info('Ejecutando worker: expiración de solicitudes de doble aprobación');
        const result = await DualApprovalExpirationWorker._processExpired();
        logger.info('Worker de expiración de doble aprobación completado', result);
      })
    );

    logger.info('Worker de expiración de doble aprobación iniciado - tarea: diaria a las 3:00 AM');
  }

  static async _processExpired() {
    const now = new Date();
    const expired = await approvalRequestRepository.findExpired(now);

    let count = 0;
    for (const request of expired) {
      try {
        await request.update({ status: APPROVAL_REQUEST_STATUS.EXPIRED, resolved_at: now });

        logAudit(
          'DUAL_APPROVAL_EXPIRED',
          'system',
          {
            approvalRequestId: request.approval_request_id,
            operationKey: request.operation_key,
            entityType: request.entity_type,
            entityId: request.entity_id,
            expiresAt: request.expires_at
          },
          {
            entityId: request.approval_request_id,
            entityType: 'ApprovalRequest',
            entityTable: 'approval_requests'
          }
        );

        count++;
      } catch (error) {
        logger.error('Error al expirar solicitud de doble aprobación', {
          approvalRequestId: request.approval_request_id,
          error: errorMessage(error)
        });
      }
    }

    return { expired: count };
  }
}

export default DualApprovalExpirationWorker;
