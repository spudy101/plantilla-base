const {
  UserComponent,
  PersonComponent,
  PersonContactComponent,
  PersonLocationComponent
} = require('../../../../../shared/dtos/kyc');

const { UserConsentComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');
const MaskingUtil = require('../../../../../shared/utils/masking.util');

/**
 * ============================================================
 * PROFILE DTOs — CLIENT
 * ============================================================
 */

function _normalizePersonAliases(person) {
  if (!person) {
    return null;
  }

  return {
    person_id: person.person_id,
    first_name: person.first_name,
    last_name: person.last_name,
    middle_name: person.middle_name ?? null,
    second_last_name: person.second_last_name ?? null,
    national_id: person.national_id ?? null,
    birth_date: person.birth_date ?? null,
    gender_id: person.gender_id ?? null,
    country_id: person.country_id ?? null,
    document_type_id: person.document_type_id ?? null,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,

    gender: person.gender ?? null,
    document_type: person.document_type ?? null,
    contact: person.contact ?? null,
    location: person.location ?? null,

    nationality: person.country ?? null
  };
}

// ============================================================
// HELPER — catálogo completo de consentimientos del usuario
// (todos los tipos activos + estado de otorgamiento: granted true/false)
// ============================================================

function _buildConsentCatalog(consentTypes = [], consents = []) {
  const grantedByTypeId = new Map(consents.map(c => [c.consent_type_id, c]));
  return consentTypes.map(type =>
    UserConsentComponent.buildClientCatalogItem(type, grantedByTypeId.get(type.consent_type_id) || null)
  );
}

// ============================================================
// HELPER — construye los campos comunes del perfil básico
// ============================================================

function _buildBasicFields(user) {
  const dto = {
    user: UserComponent.build(user, {
      includeRole: true,
      includeAvatar: true
    })
  };

  if (!user.person) {
    return dto;
  }

  const person = _normalizePersonAliases(user.person);

  dto.person = PersonComponent.build(person, {
    includeGender: true,
    includeNationality: true,
    includeDocumentType: true
  });

  if (person.contact) {
    dto.contact = PersonContactComponent.build(person.contact);
  }

  if (person.location) {
    dto.location = PersonLocationComponent.build(person.location);
  }

  return { dto, person };
}

// ============================================================
// PERFIL BÁSICO
// ============================================================

function BasicProfileDTO(user, consentTypes = [], consents = []) {
  const result = _buildBasicFields(user);
  const dto = result.dto || result;
  dto.consents = _buildConsentCatalog(consentTypes, consents);
  return dto;
}

// ============================================================
// PERFIL EXTENDIDO
// ============================================================

function ExtendedProfileDTO(user, consentTypes = [], consents = []) {
  const result = _buildBasicFields(user);
  const dto = result.dto || result;
  dto.consents = _buildConsentCatalog(consentTypes, consents);
  return dto;
}

// ============================================================
// RESPUESTAS DE ACTUALIZACIÓN
// ============================================================

// Confirmaciones de actualización: devuelven el dato enmascarado. El valor completo lo acaba de
// escribir el propio usuario, así que la confirmación no necesita repetirlo.
function UpdateEmailResponseDTO(newEmail, updatedAt) {
  return { newEmail: MaskingUtil.maskEmail(newEmail) || null, updatedAt };
}

function UpdatePhoneResponseDTO(phone, phonePrefixId, phoneType, updatedAt) {
  return { phoneType, phone: MaskingUtil.maskPhone(phone) || null, phonePrefixId, updatedAt };
}

function UpdateNamesResponseDTO(person) {
  return {
    personId: person.person_id,
    firstName: person.first_name,
    middleName: person.middle_name ?? null,
    lastName: person.last_name,
    secondLastName: person.second_last_name ?? null,
    updatedAt: person.updatedAt
  };
}

module.exports = {
  BasicProfileDTO,
  ExtendedProfileDTO,
  UpdateEmailResponseDTO,
  UpdatePhoneResponseDTO,
  UpdateNamesResponseDTO
};
