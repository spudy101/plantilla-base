import type { UserTrustedDevice } from '../../../../../shared/database/generated/prisma/client';
import type { SessionWithDeviceAndUser } from '../../../../schemas/kyc/iam/repositories/user-session.repository';
import type { AuditLogWithExecutor } from '../../../../schemas/records/audit/repositories/audit-log.repository';
// Fase 5 — API admin de sesiones (traza forense). DTOs de salida.
// El timeline sale de audit_logs (fuente única); la hidratación reusa DTOs admin ya existentes.
// Mapeo campo a campo.

import componentsAuditDtoModule from '../../../../../shared/dtos/audit/components-audit.dto';
const { AuditLogComponent } = componentsAuditDtoModule;
import kycModule from '../../../../../shared/dtos/kyc';
const { UserSessionComponent } = kycModule;
import componentsCatalogDtoModule from '../../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

function _deviceRef(
  device:
    | Pick<UserTrustedDevice, 'userTrustedDeviceId' | 'deviceName' | 'deviceType' | 'browser' | 'os' | 'status'>
    | null
    | undefined
) {
  if (!device) {
    return null;
  }
  return {
    deviceId: device.userTrustedDeviceId,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    browser: device.browser || null,
    os: device.os || null,
    status: device.status
  };
}

// Cabecera de una sesión: identidad + dispositivo + IP + ventana temporal + estado + conteo de acciones.
function SessionHeaderDTO(session: SessionWithDeviceAndUser, actionCount = 0) {
  return {
    ...UserSessionComponent.build(session),
    userId: session.userId,
    device: _deviceRef(session.device),
    actionCount
  };
}

// Listado paginado de sesiones. countMap: { [sessionId]: number } con el conteo de acciones por sesión.
function SessionTraceListDTO(
  rows: SessionWithDeviceAndUser[],
  countMap: Map<string, number>,
  metadata: Parameters<typeof MetadataDTO.build>[0]
) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    data: list.map(s => SessionHeaderDTO(s, countMap.get(s.userSessionId) ?? 0)),
    metadata: MetadataDTO.build(metadata)
  };
}

// Evento del timeline: el log plano + un flag hasDetail que indica si su fila de dominio es hidratable
// (tabla registrada en el registry y entity_id presente). El front pide el detalle solo al expandir.
function TimelineEventDTO(log: AuditLogWithExecutor, hasDetail: boolean) {
  return {
    ...AuditLogComponent.buildList(log),
    hasDetail: Boolean(hasDetail)
  };
}

// Detalle de sesión: cabecera + timeline paginado de audit_logs ordenado por created_at.
function SessionTimelineDTO(
  session: SessionWithDeviceAndUser,
  actionCount: number,
  timelineRows: AuditLogWithExecutor[],
  metadata: Parameters<typeof MetadataDTO.build>[0],
  hasDetailFn: (log: AuditLogWithExecutor) => boolean
) {
  const rows = Array.isArray(timelineRows) ? timelineRows : [];
  return {
    session: SessionHeaderDTO(session, actionCount),
    timeline: rows.map(log => TimelineEventDTO(log, hasDetailFn(log))),
    metadata: MetadataDTO.build(metadata)
  };
}

// Hidratación por lote: filas de dominio referenciadas por el timeline, agrupadas por tabla.
// skipped: tablas referenciadas pero aún no registradas en el registry (sin detalle hidratable).
function SessionEntitiesDTO(sessionId: string, entityGroups: EntityGroupRow[], skipped: Array<{ entityTable: string; count: number }>) {
  return {
    sessionId,
    entities: entityGroups,
    skipped
  };
}

/** Filas de dominio de una tabla referenciada por el timeline. */
interface EntityGroupRow {
  entityTable: string;
  entityType: string;
  count: number;
  items: unknown[];
}

const SessionTraceDto = {
  SessionHeaderDTO,
  SessionTraceListDTO,
  TimelineEventDTO,
  SessionTimelineDTO,
  SessionEntitiesDTO
};

// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-redeclare
declare namespace SessionTraceDto {
  type EntityGroup = EntityGroupRow;
}

export default SessionTraceDto;
