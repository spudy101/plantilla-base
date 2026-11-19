// GET /records/audit/operations — traza de operaciones (HTTP, webhooks, workers, sistema).
//
// La línea de tiempo de una operación une por correlationId lo que vive en BD: la fila de `operations`
// (inicio, fin, resultado), sus operaciones hijas y los hechos de negocio (audit_logs). El detalle paso
// a paso vive en CloudWatch, incluidas las llamadas a proveedores externos: la respuesta trae la
// consulta de Logs Insights lista para pegar.
import AppError from '../../../shared/http/app-error.util';
import PaginationHelper from '../../../shared/http/pagination.util';
import operationRepository from '../../../shared/observability/operation.repository';
import auditLogRepository from '../repositories/audit-log.repository';
import adminOperationDtoModule from '../responses/admin-operation.response';
const { OperationListDTO, OperationTimelineDTO } = adminOperationDtoModule;
import type { OperationSource, OperationStatus } from '../../../shared/database/generated/prisma/client';
import audit from '../audit.service';

type OperationReader = Pick<typeof operationRepository, 'findAllPaginated' | 'findById' | 'findChildren'>;
type AuditReader = Pick<typeof auditLogRepository, 'findByCorrelationId'>;

const FILTERS = ['source', 'status', 'userId', 'name', 'dateFrom', 'dateTo'] as const;
const ENTITY = { entityType: 'Operation', entityTable: 'operations' };

const optionalDate = (value: string | null) => (value ? new Date(value) : undefined);

class AdminOperationService {
  operationRepository: OperationReader;
  auditLogRepository: AuditReader;

  constructor(deps: AdminOperationService.Deps = {}) {
    this.operationRepository = deps.operationRepository ?? operationRepository;
    this.auditLogRepository = deps.auditLogRepository ?? auditLogRepository;
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

    await audit.record('OPERATION_LIST_VIEWED', {
      actorId: adminUserId,
      details: { totalItems: count, filters: Object.keys(filters) },
      ...ENTITY
    });

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
    const [children, auditEvents] = await Promise.all([
      this.operationRepository.findChildren(operationId),
      this.auditLogRepository.findByCorrelationId(operationId)
    ]);

    await audit.record('OPERATION_VIEWED', { actorId: adminUserId, ...ENTITY, entityId: operationId });

    return OperationTimelineDTO({ operation, children, auditEvents });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace AdminOperationService {
  interface Deps {
    operationRepository?: OperationReader;
    auditLogRepository?: AuditReader;
  }
}

export default Object.assign(new AdminOperationService(), { AdminOperationService });
