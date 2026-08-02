// Fase 5 — API admin de sesiones (traza forense). DTOs de salida.
// El timeline sale de audit_logs (fuente única); la hidratación reusa DTOs admin ya existentes.
// Mapeo campo a campo; nunca spread sobre instancias Sequelize.

const { AuditLogComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');
const { UserSessionComponent } = require('../../../../../shared/dtos/kyc');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');

function _deviceRef(device) {
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
function SessionHeaderDTO(session, actionCount = 0) {
  return {
    ...UserSessionComponent.build(session),
    userId: session.user_id,
    device: _deviceRef(session.device),
    actionCount
  };
}

// Listado paginado de sesiones. countMap: { [sessionId]: number } con el conteo de acciones por sesión.
function SessionTraceListDTO(rows, countMap, metadata) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    data: list.map(s => SessionHeaderDTO(s, countMap[s.user_session_id] ?? 0)),
    metadata: MetadataDTO.build(metadata)
  };
}

// Evento del timeline: el log plano + un flag hasDetail que indica si su fila de dominio es hidratable
// (tabla registrada en el registry y entity_id presente). El front pide el detalle solo al expandir.
function TimelineEventDTO(log, hasDetail) {
  return {
    ...AuditLogComponent.buildList(log),
    hasDetail: Boolean(hasDetail)
  };
}

// Detalle de sesión: cabecera + timeline paginado de audit_logs ordenado por created_at.
function SessionTimelineDTO(session, actionCount, timelineRows, metadata, hasDetailFn) {
  const rows = Array.isArray(timelineRows) ? timelineRows : [];
  return {
    session: SessionHeaderDTO(session, actionCount),
    timeline: rows.map(log => TimelineEventDTO(log, hasDetailFn(log))),
    metadata: MetadataDTO.build(metadata)
  };
}

// Hidratación por lote: filas de dominio referenciadas por el timeline, agrupadas por tabla.
// skipped: tablas referenciadas pero aún no registradas en el registry (sin detalle hidratable).
function SessionEntitiesDTO(sessionId, entityGroups, skipped) {
  return {
    sessionId,
    entities: entityGroups,
    skipped
  };
}

module.exports = {
  SessionHeaderDTO,
  SessionTraceListDTO,
  TimelineEventDTO,
  SessionTimelineDTO,
  SessionEntitiesDTO
};
