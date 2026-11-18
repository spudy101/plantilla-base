import EncryptionUtil from '../../../shared/security/encryption.util';
import MaskingUtil from '../../../shared/security/masking.util';
import type { DbDate, Maybe } from '../../../shared/types/db-rows';

/** Objeto de salida con campos opcionales que se agregan según las opciones de build. */
type Dto = Record<string, unknown>;

// Filas de Prisma (camelCase). La PII llega descifrada (piiExtension); safeDecrypt queda como red: deja
// intacto un valor que no está cifrado.
interface PersonContactRow {
  personContactId: string;
  personId: string;
  email?: Maybe<string>;
  emailVerifiedAt?: Maybe<DbDate>;
  phonePrimary?: Maybe<string>;
  phonePrimaryPrefixId?: Maybe<string>;
  phonePrimaryVerifiedAt?: Maybe<DbDate>;
  phoneSecondary?: Maybe<string>;
  phoneSecondaryPrefixId?: Maybe<string>;
  phoneSecondaryVerifiedAt?: Maybe<DbDate>;
  phonePrimaryPrefix?: Maybe<{ prefix?: Maybe<string> }>;
  phoneSecondaryPrefix?: Maybe<{ prefix?: Maybe<string> }>;
}

interface NamedRow {
  name?: Maybe<string>;
  code?: Maybe<string>;
  iconUrl?: Maybe<string>;
  daneCode?: Maybe<string>;
}

interface PersonLocationRow {
  personLocationId: string;
  personId: string;
  address?: Maybe<string>;
  postalCode?: Maybe<string>;
  type?: Maybe<string>;
  countryId?: Maybe<string>;
  departmentId?: Maybe<string>;
  cityId?: Maybe<string>;
  country?: Maybe<NamedRow & { countryId: string }>;
  department?: Maybe<NamedRow & { departmentId: string }>;
  city?: Maybe<NamedRow & { cityId: string }>;
}

interface UserRow {
  userId: string;
  username?: Maybe<string>;
  personId?: Maybe<string>;
  roleId?: Maybe<string>;
  avatarId?: Maybe<string>;
  isActive?: Maybe<boolean>;
  deletedAt?: Maybe<DbDate>;
  totpEnabled?: Maybe<boolean>;
  smsMfaEnabled?: Maybe<boolean>;
  preferredMfaMethod?: Maybe<string>;
  privacyPolicyVersion?: Maybe<string>;
  privacyPolicyAcceptedAt?: Maybe<DbDate>;
  privacyPolicyAcceptedIp?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
  role?: Maybe<{ roleId: string; name?: Maybe<string>; description?: Maybe<string> }>;
  avatar?: Maybe<{
    avatarId: string;
    name?: Maybe<string>;
    imageUrl?: Maybe<string>;
    theme?: Maybe<{ avatarThemeId: string; name?: Maybe<string> }>;
  }>;
}

interface PersonRow {
  personId: string;
  firstName?: Maybe<string>;
  lastName?: Maybe<string>;
  middleName?: Maybe<string>;
  secondLastName?: Maybe<string>;
  nationalId?: Maybe<string>;
  birthDate?: Maybe<DbDate>;
  genderId?: Maybe<string>;
  countryId?: Maybe<string>;
  documentTypeId?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
  gender?: Maybe<{ genderId: string; name?: Maybe<string> }>;
  documentType?: Maybe<{ documentTypeId: string; code?: Maybe<string>; name?: Maybe<string> }>;
  /** País de la persona (relación `country`); sale como `nationality`. */
  country?: Maybe<NamedRow & { countryId: string }>;
  contact?: Maybe<PersonContactRow>;
  location?: Maybe<PersonLocationRow>;
  user?: Maybe<UserRow>;
}

interface PersonReferenceRow {
  personReferenceId: string;
  referenceName?: Maybe<string>;
  referencePhone?: Maybe<string>;
  referenceType?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
}

interface UserBuildOptions {
  includeRole?: boolean;
  includeAvatar?: boolean;
}

interface PersonBuildOptions {
  includeContact?: boolean;
  includeLocation?: boolean;
  includeUser?: boolean;
  includeGender?: boolean;
  includeNationality?: boolean;
  includeDocumentType?: boolean;
  userOptions?: UserBuildOptions;
  /** Self-view del cliente: devuelve la PII completa en vez de enmascarada. */
  unmask?: boolean;
}

// ============================================================
// PERSON CONTACT
// ============================================================

class PersonContactComponent {
  // Seguro por defecto: se ENMASCARA (email/phone) salvo que el caller pida el dato completo con { unmask: true }
  // (self-view del cliente sobre su propia data).
  static build(contact: Maybe<PersonContactRow>, options: { unmask?: boolean } = {}) {
    if (!contact) {
      return null;
    }

    const { unmask = false } = options;
    // Antes se leían los alias primaryPrefix/secondaryPrefix, que ninguna consulta traía: el prefijo
    // salía siempre null. La relación es phonePrimaryPrefix/phoneSecondaryPrefix.
    const primaryPrefix = contact.phonePrimaryPrefix?.prefix || null;
    const secondaryPrefix = contact.phoneSecondaryPrefix?.prefix || null;

    const email = EncryptionUtil.safeDecrypt(contact.email) || null;
    const phonePrimary = EncryptionUtil.safeDecrypt(contact.phonePrimary) || null;
    const phoneSecondary = EncryptionUtil.safeDecrypt(contact.phoneSecondary) || null;
    const phonePrimaryFull = phonePrimary ? `${primaryPrefix || ''}${phonePrimary}` : null;
    const phoneSecondaryFull = phoneSecondary ? `${secondaryPrefix || ''}${phoneSecondary}` : null;

    const maskEmail = (value: unknown) => (value ? (unmask ? value : MaskingUtil.maskEmail(value)) : null);
    const maskPhone = (value: unknown) => (value ? (unmask ? value : MaskingUtil.maskPhone(value)) : null);

    return {
      personContactId: contact.personContactId,
      personId: contact.personId,

      email: maskEmail(email),
      emailVerifiedAt: contact.emailVerifiedAt || null,
      isEmailVerified: !!contact.emailVerifiedAt,

      phonePrimary: maskPhone(phonePrimary),
      phonePrimaryPrefixId: contact.phonePrimaryPrefixId || null,
      phonePrimaryPrefix: primaryPrefix,
      phonePrimaryFull: maskPhone(phonePrimaryFull),
      phonePrimaryVerifiedAt: contact.phonePrimaryVerifiedAt || null,
      isPhonePrimaryVerified: !!contact.phonePrimaryVerifiedAt,

      phoneSecondary: maskPhone(phoneSecondary),
      phoneSecondaryPrefixId: contact.phoneSecondaryPrefixId || null,
      phoneSecondaryPrefix: secondaryPrefix,
      phoneSecondaryFull: maskPhone(phoneSecondaryFull),
      phoneSecondaryVerifiedAt: contact.phoneSecondaryVerifiedAt || null,
      isPhoneSecondaryVerified: !!contact.phoneSecondaryVerifiedAt
    };
  }
}

// ============================================================
// PERSON LOCATION
// ============================================================

class PersonLocationComponent {
  static build(location: Maybe<PersonLocationRow>) {
    if (!location) {
      return null;
    }

    const dto: Dto = {
      personLocationId: location.personLocationId,
      personId: location.personId,
      address: location.address,
      postalCode: location.postalCode || null,
      type: location.type || null,
      countryId: location.countryId || null,
      departmentId: location.departmentId,
      cityId: location.cityId
    };

    if (location.country) {
      dto.country = {
        countryId: location.country.countryId,
        name: location.country.name,
        code: location.country.code,
        iconUrl: location.country.iconUrl || null
      };
    }

    if (location.department) {
      dto.department = {
        departmentId: location.department.departmentId,
        name: location.department.name,
        daneCode: location.department.daneCode || null
      };
    }

    if (location.city) {
      dto.city = {
        cityId: location.city.cityId,
        name: location.city.name,
        daneCode: location.city.daneCode || null
      };
    }

    return dto;
  }
}

// ============================================================
// USER
// ============================================================

class UserComponent {
  static build(user: Maybe<UserRow>, options: UserBuildOptions = {}) {
    if (!user) {
      return null;
    }

    const { includeRole = false, includeAvatar = false } = options;

    const dto: Dto = {
      userId: user.userId,
      username: user.username,
      personId: user.personId,
      roleId: user.roleId,
      avatarId: user.avatarId || null,
      isActive: user.isActive,
      deletedAt: user.deletedAt ?? null,
      totpEnabled: user.totpEnabled,
      smsMfaEnabled: user.smsMfaEnabled ?? false,
      preferredMfaMethod: user.preferredMfaMethod ?? 'none',
      privacyPolicyVersion: user.privacyPolicyVersion || null,
      privacyPolicyAcceptedAt: user.privacyPolicyAcceptedAt || null,
      privacyPolicyAcceptedIp: user.privacyPolicyAcceptedIp || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    if (includeRole && user.role) {
      dto.role = {
        roleId: user.role.roleId,
        name: user.role.name,
        description: user.role.description || null
      };
    }

    if (includeAvatar && user.avatar) {
      dto.avatar = {
        avatarId: user.avatar.avatarId,
        name: user.avatar.name,
        imageUrl: user.avatar.imageUrl || null,
        theme: user.avatar.theme ? { avatarThemeId: user.avatar.theme.avatarThemeId, name: user.avatar.theme.name } : null
      };
    }

    return dto;
  }
}

// ============================================================
// PERSON
// ============================================================

class PersonComponent {
  static build(person: Maybe<PersonRow>, options: PersonBuildOptions = {}) {
    if (!person) {
      return null;
    }

    const {
      includeContact = false,
      includeLocation = false,
      includeUser = false,
      includeGender = false,
      includeNationality = false,
      includeDocumentType = false,
      userOptions = {},
      unmask = false
    } = options;

    // Enmascarado salvo unmask (self-view).
    const nationalIdPlain = EncryptionUtil.safeDecrypt(person.nationalId) || null;

    const dto: Dto = {
      personId: person.personId,
      firstName: person.firstName,
      lastName: person.lastName,
      middleName: person.middleName || null,
      secondLastName: person.secondLastName || null,
      fullName: [person.firstName, person.middleName, person.lastName, person.secondLastName].filter(Boolean).join(' '),
      nationalId: nationalIdPlain ? (unmask ? nationalIdPlain : MaskingUtil.maskDocumentId(nationalIdPlain)) : null,
      birthDate: person.birthDate || null,
      genderId: person.genderId || null,
      countryId: person.countryId || null,
      documentTypeId: person.documentTypeId || null,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt
    };

    if (includeGender && person.gender) {
      dto.gender = {
        genderId: person.gender.genderId,
        name: person.gender.name
      };
    }

    if (includeDocumentType && person.documentType) {
      dto.documentType = {
        documentTypeId: person.documentType.documentTypeId,
        code: person.documentType.code,
        name: person.documentType.name
      };
    }

    if (includeNationality && person.country) {
      dto.nationality = {
        countryId: person.country.countryId,
        name: person.country.name,
        code: person.country.code,
        iconUrl: person.country.iconUrl || null
      };
    }

    if (includeContact && person.contact) {
      dto.contact = PersonContactComponent.build(person.contact, { unmask });
    }

    if (includeLocation && person.location) {
      dto.location = PersonLocationComponent.build(person.location);
    }

    if (includeUser && person.user) {
      dto.user = UserComponent.build(person.user, userOptions);
    }

    return dto;
  }
}

// ============================================================
// PERSON REFERENCE
// ============================================================

class PersonReferenceComponent {
  static build(reference: Maybe<PersonReferenceRow>) {
    if (!reference) {
      return null;
    }
    return {
      personReferenceId: reference.personReferenceId,
      referenceName: reference.referenceName,
      // [RF-USR-01] | CA-06 | Celular de un TERCERO (la referencia personal) → siempre enmascarado.
      referencePhone: MaskingUtil.maskPhone(reference.referencePhone) || null,
      referenceType: reference.referenceType,
      createdAt: reference.createdAt
    };
  }

  static buildArray(references: Maybe<PersonReferenceRow[]>) {
    if (!references || references.length === 0) {
      return [];
    }
    return references.map(r => PersonReferenceComponent.build(r));
  }
}

export default {
  PersonContactComponent,
  PersonLocationComponent,
  UserComponent,
  PersonComponent,
  PersonReferenceComponent
};
