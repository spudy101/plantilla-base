// DTO del feed de actividad del propio usuario. Client-safe: NUNCA expone `details` de audit_logs
// (claves before/after), `previous_value`/`new_value` de user_change_logs, user_agent ni datos de
// terceros. Keys camelCase; `source`/`action`/`category`/`outcome`/`changedByRole` son enums → snake_case.

const CHANGE_TYPE_DESCRIPTIONS = {
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

function _auditItem(row, deviceBySession) {
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

function _changeItem(row, deviceBySession) {
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

function UserActivityListResponseDTO(mergedItems, metadata, deviceBySession = new Map()) {
  return {
    data: mergedItems.map(item =>
      item.__source === 'audit' ? _auditItem(item.row, deviceBySession) : _changeItem(item.row, deviceBySession)
    ),
    metadata
  };
}

module.exports = { UserActivityListResponseDTO };
