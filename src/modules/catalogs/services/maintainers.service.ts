import genderRepository from '../repositories/gender.repository';
import documentTypeRepository from '../repositories/document-type.repository';
import phonePrefixRepository from '../repositories/phone-prefix.repository';
import avatarRepository from '../repositories/avatar.repository';
import avatarThemeRepository from '../repositories/avatar-theme.repository';
import countryRepository from '../repositories/country.repository';
import departmentRepository from '../repositories/department.repository';
import cityRepository from '../repositories/city.repository';
import privacyPolicyRepository from '../../legal/repositories/privacy-policy.repository';
import roleRepository from '../../iam/repositories/role.repository';
import notificationTypeRepository from '../../notification/repositories/notification-type.repository';
import AppError from '../../../shared/http/app-error.util';
import loggerUtilModule from '../../../shared/observability/logger.util';
const { logAudit } = loggerUtilModule;
import PaginationHelper from '../../../shared/http/pagination.util';
import type PrismaRepository from '../../../shared/database/prisma.repository';
import componentsCatalogDtoModule from '../dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import redisClient from '../../../shared/infra/redis.util';
import maintainersDtoModule from '../dtos/maintainers.dto';
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
} = maintainersDtoModule;

// Cache Redis de la política de privacidad activa (key fija, TTL 12 h)
const PRIVACY_POLICY_CACHE_KEY = 'cache:privacy-policy:active';
const PRIVACY_POLICY_CACHE_TTL_SECONDS = 43200; // 12 horas

class MaintainersService {
  genderRepository: typeof genderRepository;
  documentTypeRepository: typeof documentTypeRepository;
  phonePrefixRepository: typeof phonePrefixRepository;
  avatarRepository: typeof avatarRepository;
  avatarThemeRepository: typeof avatarThemeRepository;
  countryRepository: typeof countryRepository;
  departmentRepository: typeof departmentRepository;
  cityRepository: typeof cityRepository;
  privacyPolicyRepository: typeof privacyPolicyRepository;
  roleRepository: typeof roleRepository;
  notificationTypeRepository: typeof notificationTypeRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new MaintainersService({ genderRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: MaintainersService.Deps = {}) {
    this.genderRepository = deps.genderRepository ?? genderRepository;
    this.documentTypeRepository = deps.documentTypeRepository ?? documentTypeRepository;
    this.phonePrefixRepository = deps.phonePrefixRepository ?? phonePrefixRepository;
    this.avatarRepository = deps.avatarRepository ?? avatarRepository;
    this.avatarThemeRepository = deps.avatarThemeRepository ?? avatarThemeRepository;
    this.countryRepository = deps.countryRepository ?? countryRepository;
    this.departmentRepository = deps.departmentRepository ?? departmentRepository;
    this.cityRepository = deps.cityRepository ?? cityRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.notificationTypeRepository = deps.notificationTypeRepository ?? notificationTypeRepository;
  }

  // Rutas públicas — userId puede ser null si no hay sesión activa
  // Se auditan para detectar scraping o reconocimiento previo a ataques

  listGenders(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.genderRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_GENDERS_VIEWED',
      userId,
      DTO: ListGendersResponseDTO
    });
  }

  async listDocumentTypes(_query: MaintainersService.Query = {}, userId: string | null = null) {
    const items = await this.documentTypeRepository.findAllVisibleToClient();
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

  listPhonePrefixes(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.phonePrefixRepository,
      query,
      filters: ['isActive', 'countryId'],
      auditAction: 'MAINTAINER_PHONE_PREFIXES_VIEWED',
      userId,
      DTO: ListPhonePrefixesResponseDTO
    });
  }

  listAvatars(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.avatarRepository,
      query,
      filters: ['isActive', 'themeId'],
      auditAction: 'MAINTAINER_AVATARS_VIEWED',
      userId,
      DTO: ListAvatarsResponseDTO
    });
  }

  listAvatarThemes(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.avatarThemeRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_AVATAR_THEMES_VIEWED',
      userId,
      DTO: ListAvatarThemesResponseDTO
    });
  }

  listCountries(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.countryRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_COUNTRIES_VIEWED',
      userId,
      DTO: ListCountriesResponseDTO
    });
  }

  listDepartments(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.departmentRepository,
      query,
      filters: ['isActive', 'countryId'],
      auditAction: 'MAINTAINER_DEPARTMENTS_VIEWED',
      userId,
      DTO: ListDepartmentsResponseDTO
    });
  }

  listCities(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.cityRepository,
      query,
      filters: ['isActive', 'departmentId'],
      auditAction: 'MAINTAINER_CITIES_VIEWED',
      userId,
      DTO: ListCitiesResponseDTO
    });
  }

  listRoles(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.roleRepository,
      query,
      filters: ['isActive'],
      auditAction: 'MAINTAINER_ROLES_VIEWED',
      userId,
      DTO: ListRolesResponseDTO
    });
  }

  listNotificationTypes(query: MaintainersService.Query = {}, userId: string | null = null) {
    return this._list({
      repository: this.notificationTypeRepository,
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
    const cached = await redisClient.get<ReturnType<typeof ActivePrivacyPolicyResponseDTO>>(PRIVACY_POLICY_CACHE_KEY);
    if (cached) {
      logAudit('PRIVACY_POLICY_VIEWED', null, { version: cached.version }, { entityType: 'Catalog', entityTable: null });
      return cached;
    }

    const policy = await this.privacyPolicyRepository.findActive();
    if (!policy) {
      throw AppError.notFound('No hay una política de privacidad activa configurada');
    }
    const responseDto = ActivePrivacyPolicyResponseDTO(policy);
    logAudit('PRIVACY_POLICY_VIEWED', null, { version: policy.version }, { entityType: 'Catalog', entityTable: null });
    await redisClient.set(PRIVACY_POLICY_CACHE_KEY, responseDto, PRIVACY_POLICY_CACHE_TTL_SECONDS);
    return responseDto;
  }

  /** @private */
  async _list<T, R>({
    repository,
    query,
    filters,
    auditAction,
    userId,
    DTO
  }: {
    repository: MaintainersService.PaginatedSource<T>;
    query: MaintainersService.Query;
    filters: readonly string[];
    auditAction?: string;
    userId?: string | null;
    DTO: (rows: T[], metadata: Parameters<typeof MetadataDTO.build>[0]) => R;
  }) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const builtFilters = PaginationHelper.buildFilters(query, filters);
    const searchTerm = typeof query.search === 'string' && query.search ? query.search : null;

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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MaintainersService {
  /** Query string tal como llega de Express (se normaliza con PaginationHelper). */
  export type Query = Record<string, unknown>;

  /** Lo que _list necesita de un repositorio: el listado paginado estándar. */
  export interface PaginatedSource<T> {
    findAllPaginated(
      filters: PrismaRepository.Filters,
      paginationParams: PrismaRepository.PaginationParams,
      searchTerm: string | null
    ): Promise<{ rows: T[]; count: number }>;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    genderRepository?: typeof genderRepository;
    documentTypeRepository?: typeof documentTypeRepository;
    phonePrefixRepository?: typeof phonePrefixRepository;
    avatarRepository?: typeof avatarRepository;
    avatarThemeRepository?: typeof avatarThemeRepository;
    countryRepository?: typeof countryRepository;
    departmentRepository?: typeof departmentRepository;
    cityRepository?: typeof cityRepository;
    privacyPolicyRepository?: typeof privacyPolicyRepository;
    roleRepository?: typeof roleRepository;
    notificationTypeRepository?: typeof notificationTypeRepository;
  }
}

export default Object.assign(new MaintainersService(), { MaintainersService });
