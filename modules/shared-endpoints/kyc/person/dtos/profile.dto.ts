import type defineUser from '../../../../schemas/kyc/iam/models/user.model';
import type definePerson from '../../../../schemas/kyc/person/models/person.model';
import kycModule from '../../../../../shared/dtos/kyc';
const {
  UserComponent,
  PersonComponent,
  PersonContactComponent,
  PersonLocationComponent
} = kycModule;

import componentsAuditDtoModule from '../../../../../shared/dtos/audit/components-audit.dto';
const { UserConsentComponent } = componentsAuditDtoModule;
import MaskingUtil from '../../../../../shared/utils/masking.util';

/**
 * ============================================================
 * PROFILE DTOs — CLIENT
 * ============================================================
 */

function _normalizePersonAliases(person: definePerson.Instance | null | undefined) {
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

type ConsentTypeRow = NonNullable<Parameters<typeof UserConsentComponent.buildClientCatalogItem>[0]>;
type ConsentRow = NonNullable<Parameters<typeof UserConsentComponent.buildClientCatalogItem>[1]> & { consent_type_id: string };

function _buildConsentCatalog(consentTypes: readonly ConsentTypeRow[] = [], consents: readonly ConsentRow[] = []) {
  const grantedByTypeId = new Map(consents.map(c => [c.consent_type_id, c]));
  return consentTypes.map(type =>
    UserConsentComponent.buildClientCatalogItem(type, grantedByTypeId.get(type.consent_type_id) || null)
  );
}

// ============================================================
// HELPER — construye los campos comunes del perfil básico
// ============================================================

/** Perfil: usuario + (si tiene) persona, contacto y ubicación + catálogo de consentimientos. */
interface ProfileResponse {
  user: ReturnType<typeof UserComponent.build>;
  person?: ReturnType<typeof PersonComponent.build>;
  contact?: ReturnType<typeof PersonContactComponent.build>;
  location?: ReturnType<typeof PersonLocationComponent.build>;
  consents?: ReturnType<typeof _buildConsentCatalog>;
}

// Antes devolvía `dto` o `{ dto, person }` según el caso (y los llamadores hacían `result.dto || result`):
// ahora siempre el dto.
function _buildBasicFields(user: defineUser.Instance): ProfileResponse {
  const dto: ProfileResponse = {
    user: UserComponent.build(user, {
      includeRole: true,
      includeAvatar: true
    })
  };

  if (!user.person) {
    return dto;
  }

  const person = _normalizePersonAliases(user.person);
  if (!person) {
    return dto;
  }

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

  return dto;
}

// ============================================================
// PERFIL BÁSICO
// ============================================================

function BasicProfileDTO(user: defineUser.Instance, consentTypes: readonly ConsentTypeRow[] = [], consents: readonly ConsentRow[] = []) {
  const dto = _buildBasicFields(user);
  dto.consents = _buildConsentCatalog(consentTypes, consents);
  return dto;
}

// ============================================================
// PERFIL EXTENDIDO
// ============================================================

// Hoy idéntico al básico (mismo contrato); se mantiene el nombre para los endpoints que lo usan.
function ExtendedProfileDTO(user: defineUser.Instance, consentTypes: readonly ConsentTypeRow[] = [], consents: readonly ConsentRow[] = []) {
  return BasicProfileDTO(user, consentTypes, consents);
}

// ============================================================
// RESPUESTAS DE ACTUALIZACIÓN
// ============================================================

// Confirmaciones de actualización: devuelven el dato enmascarado. El valor completo lo acaba de
// escribir el propio usuario, así que la confirmación no necesita repetirlo.
function UpdateEmailResponseDTO(newEmail: string, updatedAt: Date) {
  return { newEmail: MaskingUtil.maskEmail(newEmail) || null, updatedAt };
}

function UpdatePhoneResponseDTO(phone: string, phonePrefixId: string, phoneType: 'primary' | 'secondary', updatedAt: Date) {
  return { phoneType, phone: MaskingUtil.maskPhone(phone) || null, phonePrefixId, updatedAt };
}

function UpdateNamesResponseDTO(
  person: Pick<definePerson.Attributes, 'person_id' | 'first_name' | 'middle_name' | 'last_name' | 'second_last_name'> & { updatedAt?: Date }
) {
  return {
    personId: person.person_id,
    firstName: person.first_name,
    middleName: person.middle_name ?? null,
    lastName: person.last_name,
    secondLastName: person.second_last_name ?? null,
    updatedAt: person.updatedAt
  };
}

export default {
  BasicProfileDTO,
  ExtendedProfileDTO,
  UpdateEmailResponseDTO,
  UpdatePhoneResponseDTO,
  UpdateNamesResponseDTO
};
