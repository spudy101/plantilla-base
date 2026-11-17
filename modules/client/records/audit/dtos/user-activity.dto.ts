import type defineAuditLog from '../../../../schemas/records/audit/models/audit-log.model';
import type defineUserChangeLog from '../../../../schemas/records/audit/models/user-change-log.model';
// DTO del feed de actividad del propio usuario. Client-safe: NUNCA expone `details` de audit_logs
// (claves before/after), `previous_value`/`new_value` de user_change_logs, user_agent ni datos de
// terceros. Keys camelCase; `source`/`action`/`category`/`outcome`/`changedByRole` son enums → snake_case.

/** Fila de audit_logs del feed (findClientSafeByUser). */
type AuditRow = defineAuditLog.Instance & { created_at?: Date };
/** Fila de user_change_logs: el repo selecciona la columna por su nombre (created_at), que Sequelize expone tal cual. */
type ChangeRow = defineUserChangeLog.Instance & { created_at?: Date };

/** Ítem del feed mezclado: unión discriminada por __source. */
type FeedItem = { __source: 'audit'; row: AuditRow; at: Date | undefined } | { __source: 'change'; row: ChangeRow; at: Date | undefined };

/** Dispositivo que ejecutó la acción (solo sesiones del propio usuario). */
type DeviceRef = { deviceId: string; name: string | null } | null;
type DeviceBySession = Map<string | null, DeviceRef>;

const CHANGE_TYPE_DESCRIPTIONS: Record<string, string> = {
  email: 'Actualización del correo electrónico',
  password: 'Cambio de contraseña',
  mfa_status: 'Cambio en la autenticación de dos factores',
  account_status: 'Cambio del estado de la cuenta',
  role: 'Cambio de rol de la cuenta',
  national_id: 'Actualización del documento de identidad',
  name: 'Actualización del nombre',
  gender: 'Actualización del género',
  location: 'Actualización de la ubicación',
  phone: 'Actualización del teléfono',
  birth_date: 'Actualización de la fecha de nacimiento',
  funds_origin: 'Actualización del origen de fondos',
  sms_mfa_status: 'Cambio en la verificación por SMS',
  preferred_mfa_method: 'Cambio del método preferido de verificación'
};

function _auditItem(row: AuditRow, deviceBySession: DeviceBySession) {
  return {
    activityId: row.audit_log_id,
    source: 'audit_log',
    action: row.action,
    description: row.description ?? null,
    category: row.category ?? null,
    outcome: row.outcome ?? null,
    changedByRole: 'user',
    ip: row.ip ?? null,
    device: deviceBySession.get(row.session_id) ?? null,
    occurredAt: row.createdAt ?? row.created_at ?? null
  };
}

function _changeItem(row: ChangeRow, deviceBySession: DeviceBySession) {
  return {
    activityId: row.log_id,
    source: 'user_change_log',
    action: row.change_type,
    description: CHANGE_TYPE_DESCRIPTIONS[row.change_type] ?? 'Actualización de datos de la cuenta',
    category: 'profile',
    outcome: 'success',
    changedByRole: row.changed_by_role,
    ip: null,
    // Solo se resuelve si la sesión es del PROPIO usuario (el service filtra por user_id): un cambio
    // hecho por un admin sale con device null — su equipo no se expone al cliente.
    device: deviceBySession.get(row.origin_session_id) ?? null,
    occurredAt: row.created_at ?? null
  };
}

function UserActivityListResponseDTO(mergedItems: FeedItem[], metadata: unknown, deviceBySession: DeviceBySession = new Map()) {
  return {
    data: mergedItems.map(item =>
      item.__source === 'audit' ? _auditItem(item.row, deviceBySession) : _changeItem(item.row, deviceBySession)
    ),
    metadata
  };
}

const UserActivityDto = { UserActivityListResponseDTO };

// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-redeclare
declare namespace UserActivityDto {
  type Item = FeedItem;
  type DeviceMap = DeviceBySession;
}

export default UserActivityDto;
