// tests/unit/shared/pagination.util.test.js
//
// PaginationHelper: parseo/validación de paginación, metadata, condición de búsqueda Sequelize
// y conversores de caso. Lógica pura; usamos el `Op` real de sequelize para verificar las keys.

const { Op } = require('sequelize');
const PaginationHelper = require('shared/utils/pagination.util');

describe('PaginationHelper', () => {
  describe('getPaginationParams', () => {
    it('aplica valores por defecto ante query vacío', () => {
      expect(PaginationHelper.getPaginationParams({})).toEqual({
        page: 1,
        limit: 10,
        offset: 0,
        sortBy: 'created_at',
        order: 'DESC'
      });
    });

    it('usa defaults también cuando no se pasa argumento', () => {
      expect(PaginationHelper.getPaginationParams()).toMatchObject({ page: 1, limit: 10 });
    });

    it('parsea page/limit desde strings y calcula el offset', () => {
      const params = PaginationHelper.getPaginationParams({ page: '3', limit: '20' });
      expect(params.page).toBe(3);
      expect(params.limit).toBe(20);
      expect(params.offset).toBe(40); // (3-1)*20
    });

    it('normaliza page/limit inválidos o negativos al mínimo permitido', () => {
      expect(PaginationHelper.getPaginationParams({ page: '-5', limit: '-3' })).toMatchObject({
        page: 1,
        limit: 1
      });
      expect(PaginationHelper.getPaginationParams({ page: 'abc', limit: 'xyz' })).toMatchObject({
        page: 1,
        limit: 10
      });
    });

    it('normaliza el order a mayúsculas y valida ASC/DESC', () => {
      expect(PaginationHelper.getPaginationParams({ order: 'asc' }).order).toBe('ASC');
      expect(PaginationHelper.getPaginationParams({ order: 'desc' }).order).toBe('DESC');
    });

    it('cae a DESC ante un order no reconocido', () => {
      expect(PaginationHelper.getPaginationParams({ order: 'random' }).order).toBe('DESC');
    });

    it('respeta un sortBy explícito', () => {
      expect(PaginationHelper.getPaginationParams({ sortBy: 'name' }).sortBy).toBe('name');
    });
  });

  describe('buildMetadata', () => {
    it('calcula paginación en una página intermedia', () => {
      const meta = PaginationHelper.buildMetadata(25, 2, 10);
      expect(meta.pagination).toEqual({
        currentPage: 2,
        pageSize: 10,
        totalItems: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true
      });
    });

    it('la primera página no tiene página previa', () => {
      const meta = PaginationHelper.buildMetadata(25, 1, 10);
      expect(meta.pagination.hasPreviousPage).toBe(false);
      expect(meta.pagination.hasNextPage).toBe(true);
    });

    it('la última página no tiene página siguiente', () => {
      const meta = PaginationHelper.buildMetadata(25, 3, 10);
      expect(meta.pagination.hasNextPage).toBe(false);
      expect(meta.pagination.hasPreviousPage).toBe(true);
    });

    it('maneja el conjunto vacío (0 items → 0 páginas, sin navegación)', () => {
      const meta = PaginationHelper.buildMetadata(0, 1, 10);
      expect(meta.pagination.totalPages).toBe(0);
      expect(meta.pagination.hasNextPage).toBe(false);
      expect(meta.pagination.hasPreviousPage).toBe(false);
    });

    it('no agrega la clave filters cuando el objeto está vacío o es null', () => {
      expect(PaginationHelper.buildMetadata(10, 1, 10, {})).not.toHaveProperty('filters');
      expect(PaginationHelper.buildMetadata(10, 1, 10, null)).not.toHaveProperty('filters');
    });

    it('agrega filters cuando hay al menos una clave', () => {
      const meta = PaginationHelper.buildMetadata(10, 1, 10, { active: true });
      expect(meta.filters).toEqual({ active: true });
    });

    it('agrega sort cuando se provee', () => {
      const meta = PaginationHelper.buildMetadata(10, 1, 10, null, { field: 'name', order: 'ASC' });
      expect(meta.sort).toEqual({ field: 'name', order: 'ASC' });
    });
  });

  describe('buildSearchCondition', () => {
    it('devuelve objeto vacío si no hay término de búsqueda', () => {
      expect(PaginationHelper.buildSearchCondition('', ['name'])).toEqual({});
      expect(PaginationHelper.buildSearchCondition(null, ['name'])).toEqual({});
    });

    it('devuelve objeto vacío si no hay campos donde buscar', () => {
      expect(PaginationHelper.buildSearchCondition('juan', [])).toEqual({});
    });

    it('construye un Op.or con Op.iLike por cada campo', () => {
      const cond = PaginationHelper.buildSearchCondition('juan', ['name', 'email']);
      const orConditions = cond[Op.or];
      expect(Array.isArray(orConditions)).toBe(true);
      expect(orConditions).toHaveLength(2);
      expect(orConditions[0].name[Op.iLike]).toBe('%juan%');
      expect(orConditions[1].email[Op.iLike]).toBe('%juan%');
    });
  });

  describe('buildFilters', () => {
    it('extrae solo los filtros permitidos presentes en query', () => {
      const filters = PaginationHelper.buildFilters(
        { status: 'open', unknown: 'x' },
        ['status', 'type']
      );
      expect(filters).toEqual({ status: 'open' });
    });

    it('coacciona los strings "true"/"false" a booleanos', () => {
      const filters = PaginationHelper.buildFilters(
        { active: 'true', archived: 'false' },
        ['active', 'archived']
      );
      expect(filters).toEqual({ active: true, archived: false });
    });

    it('devuelve objeto vacío cuando no hay filtros permitidos o query vacío', () => {
      expect(PaginationHelper.buildFilters({ a: '1' }, [])).toEqual({});
      expect(PaginationHelper.buildFilters()).toEqual({});
    });

    it('ignora claves con valor undefined pero conserva valores falsy explícitos', () => {
      const filters = PaginationHelper.buildFilters(
        { count: 0, missing: undefined },
        ['count', 'missing']
      );
      expect(filters).toEqual({ count: 0 });
    });
  });

  describe('toCamelCase', () => {
    it('convierte snake_case a camelCase', () => {
      expect(PaginationHelper.toCamelCase('created_at')).toBe('createdAt');
      expect(PaginationHelper.toCamelCase('role_type_id')).toBe('roleTypeId');
    });

    it('deja intacto un string sin guiones bajos', () => {
      expect(PaginationHelper.toCamelCase('name')).toBe('name');
    });
  });

  describe('toSnakeCase', () => {
    it('convierte camelCase a snake_case', () => {
      expect(PaginationHelper.toSnakeCase('createdAt')).toBe('created_at');
      expect(PaginationHelper.toSnakeCase('roleTypeId')).toBe('role_type_id');
    });

    it('agrega un guion bajo inicial ante una mayúscula al comienzo', () => {
      expect(PaginationHelper.toSnakeCase('RoleType')).toBe('_role_type');
    });

    it('deja intacto un string sin mayúsculas', () => {
      expect(PaginationHelper.toSnakeCase('name')).toBe('name');
    });
  });
});
