import componentsCatalogDtoModule from '../../../../../shared/dtos/kyc/components-catalog.dto';
const {
  CountryComponent,
  DepartmentComponent,
  CityComponent,
  PhonePrefixComponent,
  GenderComponent,
  AvatarThemeComponent,
  AvatarComponent,
  MetadataDTO,
  RoleComponent
} = componentsCatalogDtoModule;

import type definePrivacyPolicy from '../../../../schemas/records/legal/models/privacy-policy.model';
import type defineDocumentType from '../../../../schemas/kyc/maintainers/models/document-type.model';
import componentsNotificationDtoModule from '../../../../../shared/dtos/notification/components-notification.dto';
const { NotificationTypeComponent } = componentsNotificationDtoModule;

/**
 * ============================================================
 * MAINTAINERS DTOs — CLIENT / PUBLIC
 * ============================================================
 * Usa los componentes del shared — nunca duplicar lógica aquí.
 * Todas las rutas de maintainers son públicas (sin auth).
 */

// ============================================================
// HELPER GENÉRICO — lista paginada
// ============================================================

/** Metadata de paginación (la forma que espera MetadataDTO). */
type Metadata = Parameters<typeof MetadataDTO.build>[0];

function buildListResponse<T, R>(items: readonly T[] | null | undefined, metadata: Metadata, buildFn: (item: T) => R) {
  return {
    data: Array.isArray(items) ? items.map(buildFn) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

// ============================================================
// GENDERS
// ============================================================

function ListGendersResponseDTO(genders: Array<Parameters<typeof GenderComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(genders, metadata, g => GenderComponent.build(g));
}

// ============================================================
// PHONE PREFIXES
// ============================================================

function ListPhonePrefixesResponseDTO(prefixes: Array<Parameters<typeof PhonePrefixComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(prefixes, metadata, p => PhonePrefixComponent.build(p, true));
}

// ============================================================
// AVATARS
// ============================================================

function ListAvatarsResponseDTO(avatars: Array<Parameters<typeof AvatarComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(avatars, metadata, a => AvatarComponent.build(a, true));
}

// ============================================================
// AVATAR THEMES
// ============================================================

function ListAvatarThemesResponseDTO(themes: Array<Parameters<typeof AvatarThemeComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(themes, metadata, t => AvatarThemeComponent.build(t));
}

// ============================================================
// COUNTRIES
// ============================================================

function ListCountriesResponseDTO(countries: Array<Parameters<typeof CountryComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(countries, metadata, c => CountryComponent.build(c));
}

// ============================================================
// DEPARTMENTS
// ============================================================

function ListDepartmentsResponseDTO(departments: Array<Parameters<typeof DepartmentComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(departments, metadata, d => DepartmentComponent.build(d, true));
}

// ============================================================
// CITIES
// ============================================================

function ListCitiesResponseDTO(cities: Array<Parameters<typeof CityComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(cities, metadata, c => CityComponent.build(c, true));
}

// ============================================================
// POLÍTICA DE PRIVACIDAD
// ============================================================

function ActivePrivacyPolicyResponseDTO(
  policy: Pick<definePrivacyPolicy.Attributes, 'version' | 'document_url' | 'summary' | 'effective_date'>
) {
  return {
    version: policy.version,
    documentUrl: policy.document_url,
    summary: policy.summary || null,
    effectiveDate: policy.effective_date
  };
}

// ============================================================
// ROLES
// ============================================================

function ListRolesResponseDTO(roles: Array<Parameters<typeof RoleComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(roles, metadata, r => RoleComponent.build(r));
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

function ListNotificationTypesResponseDTO(types: Array<Parameters<typeof NotificationTypeComponent.build>[0]>, metadata: Metadata) {
  return buildListResponse(types, metadata, t => NotificationTypeComponent.build(t));
}

// ============================================================
// DOCUMENT TYPES
// ============================================================

function ListDocumentTypesResponseDTO(
  documentTypes: Array<Pick<defineDocumentType.Attributes, 'document_type_id' | 'code' | 'name' | 'is_visible_to_client' | 'is_active'>>,
  metadata: Metadata
) {
  return buildListResponse(documentTypes, metadata, dt => ({
    documentTypeId: dt.document_type_id,
    code: dt.code,
    name: dt.name,
    isVisibleToClient: dt.is_visible_to_client,
    isActive: dt.is_active
  }));
}

export default {
  ListGendersResponseDTO,
  ListDocumentTypesResponseDTO,
  ListPhonePrefixesResponseDTO,
  ListAvatarsResponseDTO,
  ListAvatarThemesResponseDTO,
  ListCountriesResponseDTO,
  ListDepartmentsResponseDTO,
  ListCitiesResponseDTO,
  ActivePrivacyPolicyResponseDTO,
  ListRolesResponseDTO,
  ListNotificationTypesResponseDTO
};
