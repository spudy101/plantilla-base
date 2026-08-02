// modules/admin/kyc/dtos/admin-person.dto.js

const {
  UserComponent,
  PersonComponent,
  PersonContactComponent,
  PersonLocationComponent,
  safeDecrypt
} = require('../../../../../shared/dtos/kyc');
const MaskingUtil = require('../../../../../shared/utils/masking.util');

const { RoleComponent } = require('../../../../../shared/dtos/kyc/components-catalog.dto');

/**
 * ============================================================
 * PERSON DTOs — ADMIN
 * ============================================================
 * Usa _normalizePersonAliases() para adaptar los aliases snake_case
 * del modelo al contrato camelCase que esperan los componentes KYC.
 *
 * CAMPOS ENCRIPTADOS / HASHEADOS (modelos actualizados):
 *   Person        → national_id (AES-256-GCM), national_id_hash (HMAC-SHA256)
 *   PersonContact → email, phone_primary, phone_secondary (AES-256-GCM)
 *                   + email_hash, phone_primary_hash, phone_secondary_hash
 *
 * El afterFind del modelo ya descifra automáticamente antes de llegar al DTO.
 * Los campos _hash NUNCA se exponen al cliente — se usan solo para búsquedas WHERE.
 *
 * NUNCA hacer spread/assign sobre una instancia Sequelize.
 */

// ============================================================
// HELPER INTERNO
// ============================================================

function _normalizePersonAliases(person) {
  if (!person) {
    return null;
  }

  return {
    // Campos escalares del modelo Person
    person_id: person.person_id,
    first_name: person.first_name,
    last_name: person.last_name,
    middle_name: person.middle_name ?? null,
    second_last_name: person.second_last_name ?? null,
    // national_id ya viene descifrado por el afterFind del modelo Person
    national_id: person.national_id ?? null,
    birth_date: person.birth_date ?? null,
    gender_id: person.gender_id ?? null,
    country_id: person.country_id ?? null,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,

    // Asociaciones directas (alias exactos del modelo)
    gender: person.gender ?? null,
    contact: person.contact ?? null,
    location: person.location ?? null,

    // person.country (as:'country') → nationality (alias esperado por PersonComponent)
    nationality: person.country ?? null
  };
}

// ============================================================
// DETALLE COMPLETO (admin getById)
// ============================================================

function UserDTO(user) {
  const result = {};

  result.user = UserComponent.build(user, {
    includeRole: true,
    includeAvatar: true
  });

  if (user.person) {
    const person = _normalizePersonAliases(user.person);
    result.person = _buildPersonResult(person);
  }

  return result;
}

function _buildPersonResult(person) {
  const result = PersonComponent.build(person, {
    includeGender: true,
    includeNationality: true
  });

  if (person.contact) {
    result.contact = PersonContactComponent.build(person.contact);
  }

  if (person.location) {
    result.location = PersonLocationComponent.build(person.location);
  }

  return result;
}

// ============================================================
// LISTADO (simplificado)
// ============================================================

function UserListItemDTO(user) {
  const result = {
    userId: user.user_id,
    username: user.username,
    isActive: user.is_active,
    deletedAt: user.deleted_at ?? null,
    totpEnabled: user.totp_enabled,
    smsMfaEnabled: user.sms_mfa_enabled ?? false,
    preferredMfaMethod: user.preferred_mfa_method ?? 'none',
    createdAt: user.createdAt
  };

  if (user.person) {
    const nationalId = safeDecrypt(user.person.national_id) ?? null;
    result.person = {
      firstName: user.person.first_name,
      lastName: user.person.last_name,
      nationalId: MaskingUtil.maskDocumentId(nationalId)
    };

    if (user.person.contact) {
      const email = safeDecrypt(user.person.contact.email) ?? null;
      result.email = MaskingUtil.maskEmail(email);
      result.emailVerified = !!user.person.contact.email_verified_at;
    }
  }

  if (user.role) {
    result.role = RoleComponent.build(user.role);
  }

  return result;
}

// ============================================================
// DTOs DE ACCIÓN
// ============================================================

function CreateUserDTO(user, temporaryPassword) {
  return {
    user: UserDTO(user),
    temporaryPassword
  };
}

// [RF-USR-01] | CA-06 | Los DTOs de acción confirman lo que el admin acaba de ejecutar; el dato va
// enmascarado igual que en el resto de las vistas (el admin ya conoce el valor: lo acaba de escribir).
function ResetPasswordDTO(user) {
  return {
    userId: user.user_id,
    username: user.username,
    email: MaskingUtil.maskEmail(safeDecrypt(user.person?.contact?.email)) || null
  };
}

function ChangeEmailDTO(user, oldEmail, newEmail) {
  return {
    userId: user.user_id,
    username: user.username,
    oldEmail: MaskingUtil.maskEmail(oldEmail) || null,
    newEmail: MaskingUtil.maskEmail(newEmail) || null,
    emailVerified: true
  };
}

function ChangeNationalIdDTO(user, oldNationalId, newNationalId) {
  return {
    userId: user.user_id,
    username: user.username,
    oldNationalId: MaskingUtil.maskDocumentId(oldNationalId) || null,
    newNationalId: MaskingUtil.maskDocumentId(newNationalId) || null
  };
}

function ToggleUserStatusDTO(user, action) {
  return {
    userId: user.user_id,
    username: user.username,
    isActive: user.is_active,
    action
  };
}

function DisableMFADTO(user) {
  return {
    userId: user.user_id,
    username: user.username,
    totpEnabled: user.totp_enabled,
    smsMfaEnabled: user.sms_mfa_enabled ?? false,
    preferredMfaMethod: user.preferred_mfa_method ?? 'none'
  };
}

function ChangeRoleDTO(user, oldRole, newRole) {
  return {
    userId: user.user_id,
    username: user.username,
    oldRole: RoleComponent.build(oldRole),
    newRole: RoleComponent.build(newRole)
  };
}

// ─── Opción de rol (para poblar el filtro por rol del listado de clientes) ─────

function RoleOptionDTO(role) {
  return {
    roleId: role.role_id,
    name: role.name,
    description: role.description ?? null
  };
}

module.exports = {
  UserDTO,
  UserListItemDTO,
  CreateUserDTO,
  ResetPasswordDTO,
  ChangeEmailDTO,
  ChangeNationalIdDTO,
  ToggleUserStatusDTO,
  DisableMFADTO,
  ChangeRoleDTO,
  RoleOptionDTO
};
