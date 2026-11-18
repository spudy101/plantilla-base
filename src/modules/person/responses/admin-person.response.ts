import type { User } from '../../../shared/database/generated/prisma/client';
import iamModule from '../../iam';
const { adminUserDto: adminUserDtoModule } = iamModule;
import type { UserProfileRow } from '../../iam';
const { RoleOptionDTO } = adminUserDtoModule;

import componentsPersonModule from './person-components.response';
const { UserComponent, PersonComponent, PersonContactComponent, PersonLocationComponent } = componentsPersonModule;
import EncryptionUtil from '../../../shared/security/encryption.util';
const safeDecrypt = (value: unknown) => EncryptionUtil.safeDecrypt(value);
import MaskingUtil from '../../../shared/security/masking.util';

import catalogsModule from '../../catalogs';
const { catalogComponentsDto: componentsCatalogDtoModule } = catalogsModule;
const { RoleComponent } = componentsCatalogDtoModule;

/**
 * ============================================================
 * PERSON DTOs — ADMIN
 * ============================================================
 * Filas de Prisma (camelCase). La PII (national_id, email, teléfonos) llega descifrada por la extensión
 * de Prisma; los *_hash NUNCA se exponen: solo sirven para filtrar.
 */

// ============================================================
// DETALLE COMPLETO (admin getById)
// ============================================================

/** Detalle admin: usuario + (si tiene) persona con contacto y ubicación. */
interface UserDetail {
  user: ReturnType<typeof UserComponent.build>;
  person?: ReturnType<typeof _buildPersonResult>;
}

function UserDTO(user: UserProfileRow): UserDetail {
  const result: UserDetail = { user: null };

  result.user = UserComponent.build(user, {
    includeRole: true,
    includeAvatar: true
  });

  if (user.person) {
    result.person = _buildPersonResult(user.person);
  }

  return result;
}

function _buildPersonResult(person: UserProfileRow['person']) {
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

function UserListItemDTO(user: UserProfileRow) {
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
    userId: user.userId,
    username: user.username,
    isActive: user.isActive,
    deletedAt: user.deletedAt ?? null,
    totpEnabled: user.totpEnabled,
    smsMfaEnabled: user.smsMfaEnabled ?? false,
    preferredMfaMethod: user.preferredMfaMethod ?? 'none',
    createdAt: user.createdAt
  };

  if (user.person) {
    const nationalId = safeDecrypt(user.person.nationalId) ?? null;
    result.person = {
      firstName: user.person.firstName,
      lastName: user.person.lastName,
      nationalId: MaskingUtil.maskDocumentId(nationalId)
    };

    if (user.person.contact) {
      const email = safeDecrypt(user.person.contact.email) ?? null;
      result.email = MaskingUtil.maskEmail(email);
      result.emailVerified = !!user.person.contact.emailVerifiedAt;
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

function CreateUserDTO(user: UserProfileRow, temporaryPassword: string) {
  return {
    user: UserDTO(user),
    temporaryPassword
  };
}

// [RF-USR-01] | CA-06 | Los DTOs de acción confirman lo que el admin acaba de ejecutar; el dato va
// enmascarado igual que en el resto de las vistas (el admin ya conoce el valor: lo acaba de escribir).
function ResetPasswordDTO(
  user: Pick<User, 'userId' | 'username'> & { person?: { contact?: { email?: string | null } | null } | null }
) {
  return {
    userId: user.userId,
    username: user.username,
    email: MaskingUtil.maskEmail(safeDecrypt(user.person?.contact?.email)) || null
  };
}

function ChangeEmailDTO(user: Pick<User, 'userId' | 'username'>, oldEmail: string | null | undefined, newEmail: string) {
  return {
    userId: user.userId,
    username: user.username,
    oldEmail: MaskingUtil.maskEmail(oldEmail) || null,
    newEmail: MaskingUtil.maskEmail(newEmail) || null,
    emailVerified: true
  };
}

function ChangeNationalIdDTO(user: Pick<User, 'userId' | 'username'>, oldNationalId: string | null, newNationalId: string) {
  return {
    userId: user.userId,
    username: user.username,
    oldNationalId: MaskingUtil.maskDocumentId(oldNationalId) || null,
    newNationalId: MaskingUtil.maskDocumentId(newNationalId) || null
  };
}

function ToggleUserStatusDTO(user: Pick<User, 'userId' | 'username' | 'isActive'>, action: string) {
  return {
    userId: user.userId,
    username: user.username,
    isActive: user.isActive,
    action
  };
}

function DisableMFADTO(user: Pick<User, 'userId' | 'username' | 'totpEnabled' | 'smsMfaEnabled' | 'preferredMfaMethod'>) {
  return {
    userId: user.userId,
    username: user.username,
    totpEnabled: user.totpEnabled,
    smsMfaEnabled: user.smsMfaEnabled ?? false,
    preferredMfaMethod: user.preferredMfaMethod ?? 'none'
  };
}

function ChangeRoleDTO(
  user: Pick<User, 'userId' | 'username'>,
  oldRole: Parameters<typeof RoleComponent.build>[0],
  newRole: Parameters<typeof RoleComponent.build>[0]
) {
  return {
    userId: user.userId,
    username: user.username,
    oldRole: RoleComponent.build(oldRole),
    newRole: RoleComponent.build(newRole)
  };
}

// Opción de rol para el filtro del listado: misma forma que en el listado de internos

export default {
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
