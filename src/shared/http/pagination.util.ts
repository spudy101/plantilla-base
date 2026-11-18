
/**
 * Helper global para manejar paginación, ordenamiento y búsqueda
 */
/** Query string tal como llega de Express (todos los valores son string o arrays). */
type QueryInput = Record<string, unknown>;

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  sortBy: string;
  order: 'ASC' | 'DESC';
}

interface PaginationMetadata {
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filters?: Record<string, unknown>;
  sort?: unknown;
}

class PaginationHelper {
  /**
   * Extrae y valida parámetros de paginación desde query
   * @param {Object} query - req.query
   * @returns {Object} { page, limit, offset, sortBy, order }
   */
  static getPaginationParams(query: QueryInput = {}): PaginationParams {
    const page = Math.max(1, Number.parseInt(String(query.page)) || 1);
    const limit = Math.max(1, Number.parseInt(String(query.limit)) || 10);
    const offset = (page - 1) * limit;

    const sortBy = typeof query.sortBy === 'string' && query.sortBy ? query.sortBy : 'createdAt';
    const order = (typeof query.order === 'string' && query.order ? query.order : 'DESC').toUpperCase();

    // Validar que order sea ASC o DESC
    const validOrder: 'ASC' | 'DESC' = order === 'ASC' ? 'ASC' : 'DESC';

    return {
      page,
      limit,
      offset,
      sortBy,
      order: validOrder
    };
  }

  /**
   * Construye metadata de paginación
   * @param {number} totalItems - Total de registros
   * @param {number} page - Página actual
   * @param {number} limit - Items por página
   * @param {Object} filters - Filtros aplicados (opcional)
   * @param {Object} sort - Ordenamiento aplicado (opcional)
   * @returns {Object} Metadata completa
   */
  static buildMetadata(
    totalItems: number,
    page: number,
    limit: number,
    filters: Record<string, unknown> | null = null,
    sort: unknown = null
  ): PaginationMetadata {
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const metadata: PaginationMetadata = {
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalItems,
        totalPages,
        hasNextPage,
        hasPreviousPage
      }
    };

    // Agregar filtros si existen
    if (filters && Object.keys(filters).length > 0) {
      metadata.filters = filters;
    }

    // Agregar sort si existe
    if (sort) {
      metadata.sort = sort;
    }

    return metadata;
  }

  /**
   * Construye filtros adicionales desde query params
   * @param {Object} query - req.query
   * @param {Array<string>} allowedFilters - Filtros permitidos
   * @returns {Object} Filtros parseados
   */
  /** Parámetro de query como string no vacío, o null (un query param puede llegar como array u objeto). */
  static stringParam(query: QueryInput, key: string): string | null {
    const value = query[key];
    return typeof value === 'string' && value !== '' ? value : null;
  }

  /**
   * Booleano de query: los validators con .toBoolean() ya lo dejan como boolean (Express 4 reescribe
   * req.query); sin sanitizer llega 'true'/'false'. Cualquier otro valor → undefined (sin filtro).
   */
  static booleanParam(query: QueryInput, key: string): boolean | undefined {
    const value = query[key];
    if (value === true || value === 'true') {
      return true;
    }
    if (value === false || value === 'false') {
      return false;
    }
    return undefined;
  }

  static buildFilters(query: QueryInput = {}, allowedFilters: readonly string[] = []): Record<string, unknown> {
    const filters: Record<string, unknown> = {};

    for (const filterKey of allowedFilters) {
      if (query[filterKey] !== undefined) {
        if (query[filterKey] === 'true') {
          filters[filterKey] = true;
        } else if (query[filterKey] === 'false') {
          filters[filterKey] = false;
        } else {
          filters[filterKey] = query[filterKey];
        }
      }
    }

    return filters;
  }

  /**
   * Normaliza snake_case a camelCase para filtros
   * @param {string} snakeCase - String en snake_case
   * @returns {string} String en camelCase
   */
  static toCamelCase(snakeCase: string): string {
    return snakeCase.replaceAll(/_([a-z])/g, (_match: string, letter: string) => letter.toUpperCase());
  }

  /**
   * Normaliza camelCase a snake_case para columnas DB
   * @param {string} camelCase - String en camelCase
   * @returns {string} String en snake_case
   */
  static toSnakeCase(camelCase: string): string {
    return camelCase.replaceAll(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);
  }
}

export default PaginationHelper;
