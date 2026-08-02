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

// ============================================================
// COUNTRY
// ============================================================

class CountryComponent {
  /**
   * @param {Object} country - Instancia de Country
   */
  static build(country) {
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
   * @param {Object} department - Instancia de Department
   * @param {boolean} includeCountry - Incluir asociación country
   *
   * Aliases esperados:
   *   department.country   (Country)
   */
  static build(department, includeCountry = false) {
    if (!department) {
      return null;
    }

    const dto = {
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
   * @param {Object} city - Instancia de City
   * @param {boolean} includeDepartment - Incluir asociación department (y su country)
   *
   * Aliases esperados:
   *   city.department      (Department → department.country)
   */
  static build(city, includeDepartment = false) {
    if (!city) {
      return null;
    }

    const dto = {
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
   * @param {Object} phonePrefix - Instancia de PhonePrefix
   * @param {boolean} includeCountry - Incluir asociación country
   *
   * Aliases esperados:
   *   phonePrefix.country  (Country)
   */
  static build(phonePrefix, includeCountry = false) {
    if (!phonePrefix) {
      return null;
    }

    const dto = {
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
  /**
   * @param {Object} gender - Instancia de Gender
   */
  static build(gender) {
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
  /**
   * @param {Object} role - Instancia de Role
   */
  static build(role) {
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
  /**
   * @param {Object} theme - Instancia de AvatarTheme
   */
  static build(theme) {
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
   * @param {Object} avatar - Instancia de Avatar
   * @param {boolean} includeTheme - Incluir asociación theme
   *
   * Aliases esperados:
   *   avatar.theme         (AvatarTheme)
   */
  static build(avatar, includeTheme = false) {
    if (!avatar) {
      return null;
    }

    const dto = {
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

function PaginationDTO(data) {
  return {
    currentPage: data.currentPage,
    pageSize: data.pageSize,
    totalItems: data.totalItems,
    totalPages: data.totalPages,
    hasNextPage: data.hasNextPage,
    hasPreviousPage: data.hasPreviousPage
  };
}

function SortDTO(data) {
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
  constructor(data) {
    const totalPages = Math.ceil(data.totalItems / data.limit);

    this.pagination = new PaginationDTO({
      currentPage: data.page,
      pageSize: data.limit,
      totalItems: data.totalItems,
      totalPages,
      hasNextPage: data.page < totalPages,
      hasPreviousPage: data.page > 1
    });

    this.sort = new SortDTO({
      field: data.sortBy || 'createdAt',
      order: data.order || 'DESC'
    });

    if (data.filters && Object.keys(data.filters).length > 0) {
      this.filters = data.filters;
    }
  }

  /**
   * Factory — atajo para construir desde los params de paginación
   * @param {{ totalItems, page, limit, sortBy, order, filters }} params
   */
  static build(params) {
    return new MetadataDTO(params);
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
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
