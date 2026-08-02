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
} = require('../../../../../shared/dtos/kyc/components-catalog.dto');

const { NotificationTypeComponent } = require('../../../../../shared/dtos/notification/components-notification.dto');

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

function buildListResponse(items, metadata, buildFn) {
  return {
    data: Array.isArray(items) ? items.map(buildFn) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

// ============================================================
// GENDERS
// ============================================================

function ListGendersResponseDTO(genders, metadata) {
  return buildListResponse(genders, metadata, g => GenderComponent.build(g));
}

// ============================================================
// PHONE PREFIXES
// ============================================================

function ListPhonePrefixesResponseDTO(prefixes, metadata) {
  return buildListResponse(prefixes, metadata, p => PhonePrefixComponent.build(p, true));
}

// ============================================================
// AVATARS
// ============================================================

function ListAvatarsResponseDTO(avatars, metadata) {
  return buildListResponse(avatars, metadata, a => AvatarComponent.build(a, true));
}

// ============================================================
// AVATAR THEMES
// ============================================================

function ListAvatarThemesResponseDTO(themes, metadata) {
  return buildListResponse(themes, metadata, t => AvatarThemeComponent.build(t));
}

// ============================================================
// COUNTRIES
// ============================================================

function ListCountriesResponseDTO(countries, metadata) {
  return buildListResponse(countries, metadata, c => CountryComponent.build(c));
}

// ============================================================
// DEPARTMENTS
// ============================================================

function ListDepartmentsResponseDTO(departments, metadata) {
  return buildListResponse(departments, metadata, d => DepartmentComponent.build(d, true));
}

// ============================================================
// CITIES
// ============================================================

function ListCitiesResponseDTO(cities, metadata) {
  return buildListResponse(cities, metadata, c => CityComponent.build(c, true));
}

// ============================================================
// POLÍTICA DE PRIVACIDAD
// ============================================================

function ActivePrivacyPolicyResponseDTO(policy) {
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

function ListRolesResponseDTO(roles, metadata) {
  return buildListResponse(roles, metadata, r => RoleComponent.build(r));
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

function ListNotificationTypesResponseDTO(types, metadata) {
  return buildListResponse(types, metadata, t => NotificationTypeComponent.build(t));
}

// ============================================================
// DOCUMENT TYPES
// ============================================================

function ListDocumentTypesResponseDTO(documentTypes, metadata) {
  return buildListResponse(documentTypes, metadata, dt => ({
    documentTypeId: dt.document_type_id,
    code: dt.code,
    name: dt.name,
    isVisibleToClient: dt.is_visible_to_client,
    isActive: dt.is_active
  }));
}

module.exports = {
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
