const EncryptionUtil = require('../../utils/encryption.util');
const MaskingUtil = require('../../utils/masking.util');

// ============================================================
// PERSON CONTACT
// ============================================================

class PersonContactComponent {
  // El afterFind NO corre en includes anidados → la PII llega cifrada: desciframos SIEMPRE con safeDecrypt.
  // Seguro por defecto: se ENMASCARA (email/phone) salvo que el caller pida el dato completo con { unmask: true }
  // (self-view del cliente sobre su propia data).
  static build(contact, options = {}) {
    if (!contact) {
      return null;
    }

    const { unmask = false } = options;
    const primaryPrefix = contact.primaryPrefix?.prefix || null;
    const secondaryPrefix = contact.secondaryPrefix?.prefix || null;

    const email = EncryptionUtil.safeDecrypt(contact.email) || null;
    const phonePrimary = EncryptionUtil.safeDecrypt(contact.phone_primary) || null;
    const phoneSecondary = EncryptionUtil.safeDecrypt(contact.phone_secondary) || null;
    const phonePrimaryFull = phonePrimary ? `${primaryPrefix || ''}${phonePrimary}` : null;
    const phoneSecondaryFull = phoneSecondary ? `${secondaryPrefix || ''}${phoneSecondary}` : null;

    const maskEmail = value => (value ? (unmask ? value : MaskingUtil.maskEmail(value)) : null);
    const maskPhone = value => (value ? (unmask ? value : MaskingUtil.maskPhone(value)) : null);

    return {
      personContactId: contact.person_contact_id,
      personId: contact.person_id,

      email: maskEmail(email),
      emailVerifiedAt: contact.email_verified_at || null,
      isEmailVerified: !!contact.email_verified_at,

      phonePrimary: maskPhone(phonePrimary),
      phonePrimaryPrefixId: contact.phone_primary_prefix_id || null,
      phonePrimaryPrefix: primaryPrefix,
      phonePrimaryFull: maskPhone(phonePrimaryFull),
      phonePrimaryVerifiedAt: contact.phone_primary_verified_at || null,
      isPhonePrimaryVerified: !!contact.phone_primary_verified_at,

      phoneSecondary: maskPhone(phoneSecondary),
      phoneSecondaryPrefixId: contact.phone_secondary_prefix_id || null,
      phoneSecondaryPrefix: secondaryPrefix,
      phoneSecondaryFull: maskPhone(phoneSecondaryFull),
      phoneSecondaryVerifiedAt: contact.phone_secondary_verified_at || null,
      isPhoneSecondaryVerified: !!contact.phone_secondary_verified_at
    };
  }
}

// ============================================================
// PERSON LOCATION
// ============================================================

class PersonLocationComponent {
  static build(location) {
    if (!location) {
      return null;
    }

    const dto = {
      personLocationId: location.person_location_id,
      personId: location.person_id,
      address: location.address,
      postalCode: location.postal_code || null,
      type: location.type || null,
      countryId: location.country_id || null,
      departmentId: location.department_id,
      cityId: location.city_id
    };

    if (location.country) {
      dto.country = {
        countryId: location.country.country_id,
        name: location.country.name,
        code: location.country.code,
        iconUrl: location.country.icon_url || null
      };
    }

    if (location.department) {
      dto.department = {
        departmentId: location.department.department_id,
        name: location.department.name,
        daneCode: location.department.dane_code || null
      };
    }

    if (location.city) {
      dto.city = {
        cityId: location.city.city_id,
        name: location.city.name,
        daneCode: location.city.dane_code || null
      };
    }

    return dto;
  }
}

// ============================================================
// USER
// ============================================================

class UserComponent {
  static build(user, options = {}) {
    if (!user) {
      return null;
    }

    const { includeRole = false, includeAvatar = false } = options;

    const dto = {
      userId: user.user_id,
      username: user.username,
      personId: user.person_id,
      roleId: user.role_id,
      avatarId: user.avatar_id || null,
      isActive: user.is_active,
      deletedAt: user.deleted_at ?? null,
      totpEnabled: user.totp_enabled,
      smsMfaEnabled: user.sms_mfa_enabled ?? false,
      preferredMfaMethod: user.preferred_mfa_method ?? 'none',
      privacyPolicyVersion: user.privacy_policy_version || null,
      privacyPolicyAcceptedAt: user.privacy_policy_accepted_at || null,
      privacyPolicyAcceptedIp: user.privacy_policy_accepted_ip || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    if (includeRole && user.role) {
      dto.role = {
        roleId: user.role.role_id,
        name: user.role.name,
        description: user.role.description || null
      };
    }

    if (includeAvatar && user.avatar) {
      dto.avatar = {
        avatarId: user.avatar.avatar_id,
        name: user.avatar.name,
        imageUrl: user.avatar.image_url || null,
        theme: user.avatar.theme ? { avatarThemeId: user.avatar.theme.avatar_theme_id, name: user.avatar.theme.name } : null
      };
    }

    return dto;
  }
}

// ============================================================
// PERSON
// ============================================================

class PersonComponent {
  static build(person, options = {}) {
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

    // national_id llega cifrado (afterFind no corre) → safeDecrypt SIEMPRE; enmascarado salvo unmask (self-view).
    const nationalIdPlain = EncryptionUtil.safeDecrypt(person.national_id) || null;

    const dto = {
      personId: person.person_id,
      firstName: person.first_name,
      lastName: person.last_name,
      middleName: person.middle_name || null,
      secondLastName: person.second_last_name || null,
      fullName: [person.first_name, person.middle_name, person.last_name, person.second_last_name].filter(Boolean).join(' '),
      nationalId: nationalIdPlain ? (unmask ? nationalIdPlain : MaskingUtil.maskDocumentId(nationalIdPlain)) : null,
      birthDate: person.birth_date || null,
      genderId: person.gender_id || null,
      countryId: person.country_id || null,
      documentTypeId: person.document_type_id || null,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt
    };

    if (includeGender && person.gender) {
      dto.gender = {
        genderId: person.gender.gender_id,
        name: person.gender.name
      };
    }

    if (includeDocumentType && person.document_type) {
      dto.documentType = {
        documentTypeId: person.document_type.document_type_id,
        code: person.document_type.code,
        name: person.document_type.name
      };
    }

    if (includeNationality && person.nationality) {
      dto.nationality = {
        countryId: person.nationality.country_id,
        name: person.nationality.name,
        code: person.nationality.code,
        iconUrl: person.nationality.icon_url || null
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
  static build(reference) {
    if (!reference) {
      return null;
    }
    return {
      personReferenceId: reference.person_reference_id,
      referenceName: reference.reference_name,
      // [RF-USR-01] | CA-06 | Celular de un TERCERO (la referencia personal) → siempre enmascarado.
      referencePhone: MaskingUtil.maskPhone(reference.reference_phone) || null,
      referenceType: reference.reference_type,
      createdAt: reference.createdAt
    };
  }

  static buildArray(references) {
    if (!references || references.length === 0) {
      return [];
    }
    return references.map(r => PersonReferenceComponent.build(r));
  }
}

module.exports = {
  PersonContactComponent,
  PersonLocationComponent,
  UserComponent,
  PersonComponent,
  PersonReferenceComponent
};
