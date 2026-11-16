/**
 * ============================================================
 * SHARED COMPONENTS DTO — CATÁLOGO
 * ============================================================
 * Bloques reutilizables para entidades de catálogo/maestras.
 * Usado en cualquier módulo que necesite estos datos — nunca duplicar.
 *
 * Convención de PKs: se mapean al nombre real de la BD en camelCase.
 *   country.country_id     → countryId
 *   department.department_id → departmentId
 *   city.city_id           → cityId
 *   gender.gender_id       → genderId
 *   role.role_id           → roleId
 *   avatar_theme.avatar_theme_id → avatarThemeId
 *   avatar.avatar_id       → avatarId
 *   phone_prefix.phone_prefix_id → phonePrefixId
 *
 * Convención de asociaciones esperadas en Sequelize:
 *   country  (sin asociaciones propias en catálogo)
 *   department.country     (Country)
 *   city.department        (Department → department.country)
 *   phonePrefix.country    (Country)
 *   avatar.theme           (AvatarTheme)
 */
import type { DbDate, Maybe } from '../../types/db-rows';

/** Campos comunes de las tablas de catálogo. */
interface CatalogRow {
  name?: Maybe<string>;
  is_active?: Maybe<boolean>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

interface CountryRow extends CatalogRow {
  country_id: string;
  code?: Maybe<string>;
  icon_url?: Maybe<string>;
}

interface DepartmentRow extends CatalogRow {
  department_id: string;
  dane_code?: Maybe<string>;
  country_id?: Maybe<string>;
  country?: Maybe<CountryRow>;
}

interface CityRow extends CatalogRow {
  city_id: string;
  dane_code?: Maybe<string>;
  department_id?: Maybe<string>;
  department?: Maybe<DepartmentRow>;
}

interface PhonePrefixRow extends CatalogRow {
  phone_prefix_id: string;
  prefix?: Maybe<string>;
  country_id?: Maybe<string>;
  country?: Maybe<CountryRow>;
}

interface GenderRow extends CatalogRow {
  gender_id: string;
}

interface RoleRow extends CatalogRow {
  role_id: string;
  description?: Maybe<string>;
}

interface AvatarThemeRow extends CatalogRow {
  avatar_theme_id: string;
}

interface AvatarRow extends CatalogRow {
  avatar_id: string;
  image_url?: Maybe<string>;
  avatar_theme_id?: Maybe<string>;
  theme?: Maybe<AvatarThemeRow>;
}

// ============================================================
// COUNTRY
// ============================================================

class CountryComponent {
  static build(country: Maybe<CountryRow>) {
    if (!country) {
      return null;
    }
    return {
      countryId: country.country_id,
      name: country.name,
      code: country.code,
      iconUrl: country.icon_url || null,
      isActive: country.is_active,
      createdAt: country.createdAt,
      updatedAt: country.updatedAt
    };
  }
}

// ============================================================
// DEPARTMENT
// ============================================================

class DepartmentComponent {
  /**
   * @param includeCountry Incluir asociación country (alias `department.country`)
   */
  static build(department: Maybe<DepartmentRow>, includeCountry = false) {
    if (!department) {
      return null;
    }

    const dto: {
      departmentId: string;
      name: Maybe<string>;
      daneCode: string | null;
      countryId: Maybe<string>;
      isActive: Maybe<boolean>;
      createdAt: Maybe<DbDate>;
      updatedAt: Maybe<DbDate>;
      country?: ReturnType<typeof CountryComponent.build>;
    } = {
      departmentId: department.department_id,
      name: department.name,
      daneCode: department.dane_code || null,
      countryId: department.country_id,
      isActive: department.is_active,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt
    };

    if (includeCountry && department.country) {
      dto.country = CountryComponent.build(department.country);
    }

    return dto;
  }
}

// ============================================================
// CITY
// ============================================================

class CityComponent {
  /**
   * @param includeDepartment Incluir asociación department (y su country) — alias `city.department`
   */
  static build(city: Maybe<CityRow>, includeDepartment = false) {
    if (!city) {
      return null;
    }

    const dto: {
      cityId: string;
      name: Maybe<string>;
      daneCode: string | null;
      departmentId: Maybe<string>;
      isActive: Maybe<boolean>;
      createdAt: Maybe<DbDate>;
      updatedAt: Maybe<DbDate>;
      department?: ReturnType<typeof DepartmentComponent.build>;
    } = {
      cityId: city.city_id,
      name: city.name,
      daneCode: city.dane_code || null,
      departmentId: city.department_id,
      isActive: city.is_active,
      createdAt: city.createdAt,
      updatedAt: city.updatedAt
    };

    if (includeDepartment && city.department) {
      dto.department = DepartmentComponent.build(city.department, true);
    }

    return dto;
  }
}

// ============================================================
// PHONE PREFIX
// ============================================================

class PhonePrefixComponent {
  /**
   * @param includeCountry Incluir asociación country (alias `phonePrefix.country`)
   */
  static build(phonePrefix: Maybe<PhonePrefixRow>, includeCountry = false) {
    if (!phonePrefix) {
      return null;
    }

    const dto: {
      phonePrefixId: string;
      prefix: Maybe<string>;
      countryId: Maybe<string>;
      isActive: Maybe<boolean>;
      createdAt: Maybe<DbDate>;
      updatedAt: Maybe<DbDate>;
      country?: ReturnType<typeof CountryComponent.build>;
    } = {
      phonePrefixId: phonePrefix.phone_prefix_id,
      prefix: phonePrefix.prefix,
      countryId: phonePrefix.country_id,
      isActive: phonePrefix.is_active,
      createdAt: phonePrefix.createdAt,
      updatedAt: phonePrefix.updatedAt
    };

    if (includeCountry && phonePrefix.country) {
      dto.country = CountryComponent.build(phonePrefix.country);
    }

    return dto;
  }
}

// ============================================================
// GENDER
// ============================================================

class GenderComponent {
  static build(gender: Maybe<GenderRow>) {
    if (!gender) {
      return null;
    }
    return {
      genderId: gender.gender_id,
      name: gender.name,
      isActive: gender.is_active,
      createdAt: gender.createdAt,
      updatedAt: gender.updatedAt
    };
  }
}

// ============================================================
// ROLE
// ============================================================

class RoleComponent {
  static build(role: Maybe<RoleRow>) {
    if (!role) {
      return null;
    }
    return {
      roleId: role.role_id,
      name: role.name,
      description: role.description || null,
      isActive: role.is_active,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    };
  }
}

// ============================================================
// AVATAR THEME
// ============================================================

class AvatarThemeComponent {
  static build(theme: Maybe<AvatarThemeRow>) {
    if (!theme) {
      return null;
    }
    return {
      avatarThemeId: theme.avatar_theme_id,
      name: theme.name,
      isActive: theme.is_active,
      createdAt: theme.createdAt,
      updatedAt: theme.updatedAt
    };
  }
}

// ============================================================
// AVATAR
// ============================================================

class AvatarComponent {
  /**
   * @param includeTheme Incluir asociación theme (alias `avatar.theme`)
   */
  static build(avatar: Maybe<AvatarRow>, includeTheme = false) {
    if (!avatar) {
      return null;
    }

    const dto: {
      avatarId: string;
      name: Maybe<string>;
      imageUrl: string | null;
      avatarThemeId: Maybe<string>;
      isActive: Maybe<boolean>;
      createdAt: Maybe<DbDate>;
      updatedAt: Maybe<DbDate>;
      theme?: ReturnType<typeof AvatarThemeComponent.build>;
    } = {
      avatarId: avatar.avatar_id,
      name: avatar.name,
      imageUrl: avatar.image_url || null,
      avatarThemeId: avatar.avatar_theme_id,
      isActive: avatar.is_active,
      createdAt: avatar.createdAt,
      updatedAt: avatar.updatedAt
    };

    if (includeTheme && avatar.theme) {
      dto.theme = AvatarThemeComponent.build(avatar.theme);
    }

    return dto;
  }
}

// ============================================================
// PAGINATION — reutilizable en cualquier respuesta paginada
// ============================================================

interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface SortInfo {
  field: string;
  order: string;
}

/** Parámetros de MetadataDTO.build (los que entrega PaginationHelper.getPaginationParams + el total). */
interface MetadataParams {
  totalItems: number;
  page: number;
  limit: number;
  sortBy?: string | null;
  order?: string | null;
  filters?: Record<string, unknown> | null;
}

function PaginationDTO(data: PaginationInfo): PaginationInfo {
  return {
    currentPage: data.currentPage,
    pageSize: data.pageSize,
    totalItems: data.totalItems,
    totalPages: data.totalPages,
    hasNextPage: data.hasNextPage,
    hasPreviousPage: data.hasPreviousPage
  };
}

function SortDTO(data: SortInfo): SortInfo {
  return {
    field: data.field,
    order: data.order
  };
}

/**
 * Metadata completa para respuestas paginadas.
 * Uso:
 *   const meta = MetadataDTO.build({
 *     totalItems: count,
 *     page, limit,
 *     sortBy: 'created_at', order: 'DESC',
 *     filters: { isActive: true },
 *   });
 */
class MetadataDTO {
  pagination: PaginationInfo;
  sort: SortInfo;
  // `declare`: solo se crea la propiedad cuando hay filtros (no aparece como `filters: undefined`)
  declare filters?: Record<string, unknown>;

  constructor(data: MetadataParams) {
    const totalPages = Math.ceil(data.totalItems / data.limit);

    // PaginationDTO/SortDTO son funciones que devuelven el objeto (antes se invocaban con `new`,
    // que en JS devuelve ese mismo objeto: el resultado es idéntico).
    this.pagination = PaginationDTO({
      currentPage: data.page,
      pageSize: data.limit,
      totalItems: data.totalItems,
      totalPages,
      hasNextPage: data.page < totalPages,
      hasPreviousPage: data.page > 1
    });

    this.sort = SortDTO({
      field: data.sortBy || 'createdAt',
      order: data.order || 'DESC'
    });

    if (data.filters && Object.keys(data.filters).length > 0) {
      this.filters = data.filters;
    }
  }

  /** Factory — atajo para construir desde los params de paginación. */
  static build(params: MetadataParams): MetadataDTO {
    return new MetadataDTO(params);
  }
}

// ============================================================
// EXPORTS
// ============================================================

export = {
  // Catálogo geográfico
  CountryComponent,
  DepartmentComponent,
  CityComponent,
  PhonePrefixComponent,

  // Catálogo de persona
  GenderComponent,

  // Catálogo de sistema
  RoleComponent,
  AvatarThemeComponent,
  AvatarComponent,

  // Paginación (compartida en los 3 archivos de DTOs)
  PaginationDTO,
  SortDTO,
  MetadataDTO
};
