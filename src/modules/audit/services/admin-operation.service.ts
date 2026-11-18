// GET /records/audit/operations — traza de operaciones (HTTP, webhooks, workers, sistema).
//
// La línea de tiempo de una operación une por correlationId lo que vive en BD: la fila de `operations`
// (inicio, fin, resultado), sus operaciones hijas, los hechos de negocio (audit_logs) y las llamadas a
// proveedores externos (integration_api_logs). El detalle paso a paso (logs) vive en CloudWatch: la
// respuesta trae la consulta de Logs Insights lista para pegar.
import AppError from '../../../shared/http/app-error.util';
import PaginationHelper from '../../../shared/http/pagination.util';
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logAudit } = loggerUtilModule;
import operationRepository from '../../../shared/observability/operation.repository';
import auditLogRepository from '../repositories/audit-log.repository';
import integrationApiLogRepository from '../../integration/repositories/integration-api-log.repository';
import adminOperationDtoModule from '../dtos/admin-operation.dto';
const { OperationListDTO, OperationTimelineDTO } = adminOperationDtoModule;
import type { OperationSource, OperationStatus } from '../../../shared/database/generated/prisma/client';

type OperationReader = Pick<typeof operationRepository, 'findAllPaginated' | 'findById' | 'findChildren'>;
type AuditReader = Pick<typeof auditLogRepository, 'findByCorrelationId'>;
type IntegrationReader = Pick<typeof integrationApiLogRepository, 'findByCorrelationId'>;

const FILTERS = ['source', 'status', 'userId', 'name', 'dateFrom', 'dateTo'] as const;
const ENTITY = { entityType: 'Operation', entityTable: 'operations' };

const optionalDate = (value: string | null) => (value ? new Date(value) : undefined);

class AdminOperationService {
  operationRepository: OperationReader;
  auditLogRepository: AuditReader;
  integrationApiLogRepository: IntegrationReader;

  constructor(deps: AdminOperationService.Deps = {}) {
    this.operationRepository = deps.operationRepository ?? operationRepository;
    this.auditLogRepository = deps.auditLogRepository ?? auditLogRepository;
    this.integrationApiLogRepository = deps.integrationApiLogRepository ?? integrationApiLogRepository;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const pagination = PaginationHelper.getPaginationParams({ sortBy: 'startedAt', ...query });
    const { rows, count } = await this.operationRepository.findAllPaginated(
      {
        source: (PaginationHelper.stringParam(query, 'source') as OperationSource | null) ?? undefined,
        status: (PaginationHelper.stringParam(query, 'status') as OperationStatus | null) ?? undefined,
        userId: PaginationHelper.stringParam(query, 'userId') ?? undefined,
        name: PaginationHelper.stringParam(query, 'name') ?? undefined,
        from: optionalDate(PaginationHelper.stringParam(query, 'dateFrom')),
        to: optionalDate(PaginationHelper.stringParam(query, 'dateTo'))
      },
      pagination
    );
    const filters = PaginationHelper.buildFilters(query, FILTERS);

    logAudit('OPERATION_LIST_VIEWED', adminUserId, { totalItems: count, filters: Object.keys(filters) }, ENTITY);

    return OperationListDTO(rows, {
      totalItems: count,
      page: pagination.page,
      limit: pagination.limit,
      filters: Object.keys(filters).length > 0 ? filters : undefined
    });
  }

  async timeline(operationId: string, adminUserId: string) {
    const operation = await this.operationRepository.findById(operationId);
    if (!operation) {
      throw AppError.notFound('Operación no encontrada');
    }
    const [children, auditEvents, externalCalls] = await Promise.all([
      this.operationRepository.findChildren(operationId),
      this.auditLogRepository.findByCorrelationId(operationId),
      this.integrationApiLogRepository.findByCorrelationId(operationId)
    ]);

    logAudit('OPERATION_VIEWED', adminUserId, {}, { ...ENTITY, entityId: operationId });

    return OperationTimelineDTO({ operation, children, auditEvents, externalCalls });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace AdminOperationService {
  interface Deps {
    operationRepository?: OperationReader;
    auditLogRepository?: AuditReader;
    integrationApiLogRepository?: IntegrationReader;
  }
}

export default Object.assign(new AdminOperationService(), { AdminOperationService });
