const genderRepository = require('../../../../schemas/kyc/maintainers/repositories/gender.repository');
const documentTypeRepository = require('../../../../schemas/kyc/maintainers/repositories/document-type.repository');
const phonePrefixRepository = require('../../../../schemas/kyc/maintainers/repositories/phone-prefix.repository');
const avatarRepository = require('../../../../schemas/kyc/maintainers/repositories/avatar.repository');
const avatarThemeRepository = require('../../../../schemas/kyc/maintainers/repositories/avatar-theme.repository');
const countryRepository = require('../../../../schemas/kyc/maintainers/repositories/country.repository');
const departmentRepository = require('../../../../schemas/kyc/maintainers/repositories/department.repository');
const cityRepository = require('../../../../schemas/kyc/maintainers/repositories/city.repository');
const privacyPolicyRepository = require('../../../../schemas/records/legal/repositories/privacy-policy.repository');
const roleRepository = require('../../../../schemas/kyc/iam/repositories/role.repository');
const notificationTypeRepository = require('../../../../schemas/notification/repositories/notification-type.repository');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const redisClient = require('../../../../../shared/utils/redis.util');
const {
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
} = require('../dtos/maintainers.dto');

// Cache Redis de la política de privacidad activa (key fija, TTL 12 h)
const PRIVACY_POLICY_CACHE_KEY = 'cache:privacy-policy:active';
const PRIVACY_POLICY_CACHE_TTL_SECONDS = 43200; // 12 horas

class MaintainersService {
  // Rutas públicas — userId puede ser null si no hay sesión activa
  // Se auditan para detectar scraping o reconocimiento previo a ataques

  listGenders(query, userId = null) {
    return this._list({
      repository: genderRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_GENDERS_VIEWED',
      userId,
      DTO: ListGendersResponseDTO
    });
  }

  async listDocumentTypes(_query = {}, userId = null) {
    const items = await documentTypeRepository.findAllVisibleToClient();
    logAudit(
      'MAINTAINER_DOCUMENT_TYPES_VIEWED',
      userId,
      { totalItems: items.length },
      { entityType: 'Catalog', entityTable: null }
    );
    return ListDocumentTypesResponseDTO(items, {
      totalItems: items.length,
      page: 1,
      limit: items.length || 1,
      sortBy: 'name',
      order: 'ASC',
      filters: {}
    });
  }

  listPhonePrefixes(query, userId = null) {
    return this._list({
      repository: phonePrefixRepository,
      query,
      filters: ['isActive', 'countryId'],
      auditAction: 'MAINTAINER_PHONE_PREFIXES_VIEWED',
      userId,
      DTO: ListPhonePrefixesResponseDTO
    });
  }

  listAvatars(query, userId = null) {
    return this._list({
      repository: avatarRepository,
      query,
      filters: ['isActive', 'themeId'],
      auditAction: 'MAINTAINER_AVATARS_VIEWED',
      userId,
      DTO: ListAvatarsResponseDTO
    });
  }

  listAvatarThemes(query, userId = null) {
    return this._list({
      repository: avatarThemeRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_AVATAR_THEMES_VIEWED',
      userId,
      DTO: ListAvatarThemesResponseDTO
    });
  }

  listCountries(query, userId = null) {
    return this._list({
      repository: countryRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_COUNTRIES_VIEWED',
      userId,
      DTO: ListCountriesResponseDTO
    });
  }

  listDepartments(query, userId = null) {
    return this._list({
      repository: departmentRepository,
      query,
      filters: ['isActive', 'countryId'],
      auditAction: 'MAINTAINER_DEPARTMENTS_VIEWED',
      userId,
      DTO: ListDepartmentsResponseDTO
    });
  }

  listCities(query, userId = null) {
    return this._list({
      repository: cityRepository,
      query,
      filters: ['isActive', 'departmentId'],
      auditAction: 'MAINTAINER_CITIES_VIEWED',
      userId,
      DTO: ListCitiesResponseDTO
    });
  }

  listRoles(query, userId = null) {
    return this._list({
      repository: roleRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_ROLES_VIEWED',
      userId,
      DTO: ListRolesResponseDTO
    });
  }

  listNotificationTypes(query, userId = null) {
    return this._list({
      repository: notificationTypeRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_NOTIFICATION_TYPES_VIEWED',
      userId,
      DTO: ListNotificationTypesResponseDTO
    });
  }

  // Retorna la versión activa del documento legal (Política de Privacidad / T&C).
  // Cache-aside Redis (TTL 12 h). logAudit se ejecuta SIEMPRE, también en cache hit.
  async getActivePrivacyPolicy() {
    const cached = await redisClient.get(PRIVACY_POLICY_CACHE_KEY);
    if (cached) {
      logAudit('PRIVACY_POLICY_VIEWED', null, { version: cached.version }, { entityType: 'Catalog', entityTable: null });
      return cached;
    }

    const policy = await privacyPolicyRepository.findActive();
    if (!policy) {
      throw AppError.notFound('No hay una política de privacidad activa configurada');
    }
    const responseDto = ActivePrivacyPolicyResponseDTO(policy);
    logAudit('PRIVACY_POLICY_VIEWED', null, { version: policy.version }, { entityType: 'Catalog', entityTable: null });
    await redisClient.set(PRIVACY_POLICY_CACHE_KEY, responseDto, PRIVACY_POLICY_CACHE_TTL_SECONDS);
    return responseDto;
  }

  /** @private */
  async _list({ repository, query, filters, auditAction, userId, DTO }) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const builtFilters = PaginationHelper.buildFilters(query, filters);
    const searchTerm = query.search || null;

    const { rows, count } = await repository.findAllPaginated(builtFilters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...builtFilters } : builtFilters
    };

    if (auditAction) {
      logAudit(
        auditAction,
        userId,
        { totalItems: count, page: paginationParams.page },
        { entityType: 'Catalog', entityTable: null }
      );
    }

    return DTO(rows, metadata);
  }
}

module.exports = new MaintainersService();
