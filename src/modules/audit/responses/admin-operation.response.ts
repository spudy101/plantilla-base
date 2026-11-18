// Salida de la traza de operaciones (admin). Lista blanca: ni payloads de proveedores ni detalles
// internos más allá de lo que sirve para reconstruir qué pasó.
import PaginationHelper from '../../../shared/http/pagination.util';
import type { AuditLog, IntegrationApiLog, Operation } from '../../../shared/database/generated/prisma/client';

const operationItem = (o: Operation) => ({
  operationId: o.operationId,
  parentId: o.parentId,
  clientRequestId: o.clientRequestId,
  source: o.source,
  name: o.name,
  status: o.status,
  httpStatus: o.httpStatus,
  errorCode: o.errorCode,
  errorMessage: o.errorMessage,
  userId: o.userId,
  sessionId: o.sessionId,
  ip: o.ip,
  startedAt: o.startedAt,
  endedAt: o.endedAt,
  durationMs: o.durationMs
});

function OperationListDTO(
  rows: Operation[],
  meta: { totalItems: number; page: number; limit: number; filters?: Record<string, unknown> }
) {
  return {
    data: rows.map(operationItem),
    metadata: PaginationHelper.buildMetadata(meta.totalItems, meta.page, meta.limit, meta.filters ?? null)
  };
}

function OperationTimelineDTO({
  operation,
  children,
  auditEvents,
  externalCalls
}: {
  operation: Operation;
  children: Operation[];
  auditEvents: AuditLog[];
  externalCalls: IntegrationApiLog[];
}) {
  return {
    operation: operationItem(operation),
    children: children.map(operationItem),
    auditEvents: auditEvents.map(a => ({
      auditLogId: a.auditLogId,
      action: a.action,
      description: a.description,
      outcome: a.outcome,
      risk: a.risk,
      userId: a.userId,
      entityType: a.entityType,
      entityId: a.entityId,
      at: a.createdAt
    })),
    externalCalls: externalCalls.map(c => ({
      apiLogId: c.apiLogId,
      product: c.product,
      endpoint: c.endpoint,
      result: c.result,
      responseTimeMs: c.responseTimeMs,
      errorCode: c.errorCode,
      at: c.createdAt
    })),
    // Los logs paso a paso viven en CloudWatch: esta consulta de Logs Insights los trae en orden
    logsQuery: `fields @timestamp, level, message | filter correlationId = "${operation.operationId}" | sort @timestamp asc`
  };
}

export default { OperationListDTO, OperationTimelineDTO };
