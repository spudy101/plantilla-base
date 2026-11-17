import type defineUserSession = require('../../../../schemas/kyc/iam/models/user-session.model');
import type defineUserTrustedDevice = require('../../../../schemas/kyc/iam/models/user-trusted-device.model');
import type defineAuditLog = require('../../../../schemas/records/audit/models/audit-log.model');
// Fase 5 — API admin de sesiones (traza forense). DTOs de salida.
// El timeline sale de audit_logs (fuente única); la hidratación reusa DTOs admin ya existentes.
// Mapeo campo a campo; nunca spread sobre instancias Sequelize.

import componentsAuditDtoModule = require('../../../../../shared/dtos/audit/components-audit.dto');
const { AuditLogComponent } = componentsAuditDtoModule;
import kycModule = require('../../../../../shared/dtos/kyc');
const { UserSessionComponent } = kycModule;
import componentsCatalogDtoModule = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const { MetadataDTO } = componentsCatalogDtoModule;

function _deviceRef(
  device: Pick<defineUserTrustedDevice.Instance, 'user_trusted_device_id' | 'device_name' | 'device_type' | 'browser' | 'os' | 'status'> | null | undefined
) {
  if (!device) {
    return null;
  }
  return {
    deviceId: device.user_trusted_device_id,
    deviceName: device.device_name,
    deviceType: device.device_type,
    browser: device.browser || null,
    os: device.os || null,
    status: device.status
  };
}

// Cabecera de una sesión: identidad + dispositivo + IP + ventana temporal + estado + conteo de acciones.
function SessionHeaderDTO(session: defineUserSession.Instance, actionCount = 0) {
  return {
    ...UserSessionComponent.build(session),
    userId: session.user_id,
    device: _deviceRef(session.device),
    actionCount
  };
}

// Listado paginado de sesiones. countMap: { [sessionId]: number } con el conteo de acciones por sesión.
function SessionTraceListDTO(rows: defineUserSession.Instance[], countMap: Map<string, number>, metadata: Parameters<typeof MetadataDTO.build>[0]) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    data: list.map(s => SessionHeaderDTO(s, countMap.get(s.user_session_id) ?? 0)),
    metadata: MetadataDTO.build(metadata)
  };
}

// Evento del timeline: el log plano + un flag hasDetail que indica si su fila de dominio es hidratable
// (tabla registrada en el registry y entity_id presente). El front pide el detalle solo al expandir.
function TimelineEventDTO(log: defineAuditLog.Instance, hasDetail: boolean) {
  return {
    ...AuditLogComponent.buildList(log),
    hasDetail: Boolean(hasDetail)
  };
}

// Detalle de sesión: cabecera + timeline paginado de audit_logs ordenado por created_at.
function SessionTimelineDTO(
  session: defineUserSession.Instance,
  actionCount: number,
  timelineRows: defineAuditLog.Instance[],
  metadata: Parameters<typeof MetadataDTO.build>[0],
  hasDetailFn: (log: defineAuditLog.Instance) => boolean
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

export = SessionTraceDto;
