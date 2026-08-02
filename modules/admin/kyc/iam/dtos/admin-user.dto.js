// modules/admin/users/dtos/admin-user.dto.js

const {
  UserComponent,
  PersonComponent,
  UserSessionComponent,
  UserChangeLogComponent
} = require('../../../../../shared/dtos/kyc');

// ─── Detalle de usuario interno ───────────────────────────────────────────────

function InternalUserDTO(user) {
  if (!user) {
    return null;
  }

  const u = UserComponent.build(user, { includeRole: true });
  const p = PersonComponent.build(user.person, { includeContact: true });

  return {
    userId: u.userId,
    username: u.username,
    isActive: u.isActive,
    deletedAt: u.deletedAt ?? null,
    totpEnabled: u.totpEnabled,
    smsMfaEnabled: u.smsMfaEnabled,
    preferredMfaMethod: u.preferredMfaMethod,
    role: u.role || null,
    person: p,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

// ─── Item de lista ────────────────────────────────────────────────────────────

function InternalUserListDTO(user) {
  const u = UserComponent.build(user, { includeRole: true });
  const p = PersonComponent.build(user.person, { includeContact: true });

  return {
    userId: u.userId,
    username: u.username,
    isActive: u.isActive,
    deletedAt: u.deletedAt ?? null,
    roleName: u.role?.name ?? null,
    firstName: p?.firstName ?? null,
    lastName: p?.lastName ?? null,
    email: p?.contact?.email ?? null,
    pendingApproval: user.pendingApproval ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

// ─── Creación (incluye contraseña temporal SOLO en esta respuesta) ────────────

function InternalUserCreatedDTO(user, temporaryPassword) {
  return {
    ...InternalUserDTO(user),
    temporaryPassword
  };
}

// ─── Sesión ───────────────────────────────────────────────────────────────────

function UserSessionDTO(session) {
  return UserSessionComponent.build(session);
}

// ─── Log de cambios (auditoría) ───────────────────────────────────────────────

function UserChangeLogDTO(log) {
  return UserChangeLogComponent.build(log);
}

// ─── Opción de rol (para poblar el filtro por rol del listado de internos) ─────

function RoleOptionDTO(role) {
  return {
    roleId: role.role_id,
    name: role.name,
    description: role.description ?? null
  };
}

module.exports = {
  InternalUserDTO,
  InternalUserListDTO,
  InternalUserCreatedDTO,
  UserSessionDTO,
  UserChangeLogDTO,
  RoleOptionDTO
};
