import type defineUser = require('../../../../schemas/kyc/iam/models/user.model');
import type definePerson = require('../../../../schemas/kyc/person/models/person.model');
import adminUserDtoModule = require('../../iam/dtos/admin-user.dto');
const { RoleOptionDTO } = adminUserDtoModule;
// modules/admin/kyc/dtos/admin-person.dto.ts

import kycModule = require('../../../../../shared/dtos/kyc');
const {
  UserComponent,
  PersonComponent,
  PersonContactComponent,
  PersonLocationComponent,
  safeDecrypt
} = kycModule;
import MaskingUtil = require('../../../../../shared/utils/masking.util');

import componentsCatalogDtoModule = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const { RoleComponent } = componentsCatalogDtoModule;

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

function _normalizePersonAliases(person: definePerson.Instance | null | undefined) {
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

/** Detalle admin: usuario + (si tiene) persona con contacto y ubicación. */
interface UserDetail {
  user: ReturnType<typeof UserComponent.build>;
  person?: ReturnType<typeof _buildPersonResult>;
}

function UserDTO(user: defineUser.Instance): UserDetail {
  const result: UserDetail = { user: null };

  result.user = UserComponent.build(user, {
    includeRole: true,
    includeAvatar: true
  });

  const person = _normalizePersonAliases(user.person);
  if (person) {
    result.person = _buildPersonResult(person);
  }

  return result;
}

function _buildPersonResult(person: NonNullable<ReturnType<typeof _normalizePersonAliases>>) {
  const built = PersonComponent.build(person, {
    includeGender: true,
    includeNationality: true
  });
  if (!built) {
    return null;
  }
  const result: NonNullable<typeof built> & {
    contact?: ReturnType<typeof PersonContactComponent.build>;
    location?: ReturnType<typeof PersonLocationComponent.build>;
  } = built;

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

function UserListItemDTO(user: defineUser.Instance) {
  const result: {
    userId: string;
    username: string;
    isActive: boolean | null;
    deletedAt: Date | null;
    totpEnabled: boolean | null;
    smsMfaEnabled: boolean;
    preferredMfaMethod: string;
    createdAt: Date;
    person?: { firstName: string; lastName: string; nationalId: string | null };
    email?: string | null;
    emailVerified?: boolean;
    role?: ReturnType<typeof RoleComponent.build>;
  } = {
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

function CreateUserDTO(user: defineUser.Instance, temporaryPassword: string) {
  return {
    user: UserDTO(user),
    temporaryPassword
  };
}

// [RF-USR-01] | CA-06 | Los DTOs de acción confirman lo que el admin acaba de ejecutar; el dato va
// enmascarado igual que en el resto de las vistas (el admin ya conoce el valor: lo acaba de escribir).
function ResetPasswordDTO(user: defineUser.Instance) {
  return {
    userId: user.user_id,
    username: user.username,
    email: MaskingUtil.maskEmail(safeDecrypt(user.person?.contact?.email)) || null
  };
}

function ChangeEmailDTO(user: Pick<defineUser.Instance, 'user_id' | 'username'>, oldEmail: string | null | undefined, newEmail: string) {
  return {
    userId: user.user_id,
    username: user.username,
    oldEmail: MaskingUtil.maskEmail(oldEmail) || null,
    newEmail: MaskingUtil.maskEmail(newEmail) || null,
    emailVerified: true
  };
}

function ChangeNationalIdDTO(user: Pick<defineUser.Instance, 'user_id' | 'username'>, oldNationalId: string | null, newNationalId: string) {
  return {
    userId: user.user_id,
    username: user.username,
    oldNationalId: MaskingUtil.maskDocumentId(oldNationalId) || null,
    newNationalId: MaskingUtil.maskDocumentId(newNationalId) || null
  };
}

function ToggleUserStatusDTO(user: Pick<defineUser.Instance, 'user_id' | 'username' | 'is_active'>, action: string) {
  return {
    userId: user.user_id,
    username: user.username,
    isActive: user.is_active,
    action
  };
}

function DisableMFADTO(user: Pick<defineUser.Instance, 'user_id' | 'username' | 'totp_enabled' | 'sms_mfa_enabled' | 'preferred_mfa_method'>) {
  return {
    userId: user.user_id,
    username: user.username,
    totpEnabled: user.totp_enabled,
    smsMfaEnabled: user.sms_mfa_enabled ?? false,
    preferredMfaMethod: user.preferred_mfa_method ?? 'none'
  };
}

function ChangeRoleDTO(
  user: Pick<defineUser.Instance, 'user_id' | 'username'>,
  oldRole: Parameters<typeof RoleComponent.build>[0],
  newRole: Parameters<typeof RoleComponent.build>[0]
) {
  return {
    userId: user.user_id,
    username: user.username,
    oldRole: RoleComponent.build(oldRole),
    newRole: RoleComponent.build(newRole)
  };
}

// Opción de rol para el filtro del listado: misma forma que en el listado de internos

export = {
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
