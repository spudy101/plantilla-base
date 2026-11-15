// shared/repositories/read.repository.js
const { Op } = require('sequelize');

// ============================================================
// READ REPOSITORY — solo lecturas (SOLID: I y L)
// ============================================================
// Antes, BaseRepository mezclaba lecturas y escrituras en una sola clase.
// Un repositorio de solo-lectura o append-only (ej. audit_logs) heredaba
// `update`/`delete` y tenía que sobrescribirlos para lanzar error: eso rompe
// Liskov (un hijo no puede ser usado donde se espera al padre) y obliga a
// depender de métodos que no se usan (Interface Segregation).
//
// Ahora la jerarquía es:
//   ReadRepository                → consultas
//   ├── BaseRepository            → + create/update/delete/bulk*  (CRUD completo)
//   └── AppendOnlyRepository      → + create/bulkCreate          (solo inserción)
// ============================================================
class ReadRepository {
  /**
   * @param {import('sequelize').Model} model
   * @param {object} [config]
   * @param {string[]}  [config.searchFields]   - Campos donde aplica iLike
   * @param {string}    [config.filterIdField]  - Campo FK del filtro secundario (ej: 'country_id')
   * @param {string}    [config.filterIdKey]    - Clave del objeto filters (ej: 'countryId')
   * @param {object[]}  [config.defaultInclude] - Include por defecto para findAllPaginated
   */
  constructor(model, config = {}) {
    this.model = model;
    this._searchFields = config.searchFields ?? [];
    this._filterIdField = config.filterIdField ?? null;
    this._filterIdKey = config.filterIdKey ?? null;
    this._defaultInclude = config.defaultInclude ?? [];
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  findById(id, options = {}) {
    return this.model.findOne({
      where: { [this.model.primaryKeyAttribute]: id },
      ...options
    });
  }

  /**
   * Busca varios registros por sus IDs (o por otra columna con `field`).
   * Expone una consulta con nombre para que los services no tengan que
   * armar `{ [Op.in]: ids }` (no conocen Sequelize).
   * @param {Array<string|number>} ids
   * @param {string} [field] Columna a comparar; por defecto la PK del modelo.
   * @param {object} [options]
   */
  findByIds(ids, field = this.model.primaryKeyAttribute, options = {}) {
    if (!ids || ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.model.findAll({ where: { [field]: { [Op.in]: ids } }, ...options });
  }

  findOne(criteria, options = {}) {
    return this.model.findOne({ where: criteria, ...options });
  }

  findAll(criteria = {}, options = {}) {
    return this.model.findAll({ where: criteria, ...options });
  }

  findAndCountAll(criteria = {}, options = {}) {
    return this.model.findAndCountAll({ where: criteria, ...options });
  }

  count(criteria = {}, options = {}) {
    return this.model.count({ where: criteria, ...options });
  }

  async exists(criteria) {
    return (await this.count(criteria)) > 0;
  }

  // ─── Paginated ────────────────────────────────────────────────────────────

  /**
   * Paginación estándar con filtros, búsqueda e includes.
   *
   * Cuando se llama sin argumentos extra, usa la configuración declarada en
   * el constructor (searchFields, filterIdField/Key, defaultInclude).
   * Los subrepositories pueden sobreescribir pasando sus propios parámetros
   * para casos que se desvían del patrón estándar.
   *
   * @param {object} filters          - { isActive, [filterIdKey], ... }
   * @param {object} paginationParams - { limit, offset, sortBy, order }
   * @param {string} [searchTerm]
   * @param {object} [extraOptions]   - Opciones Sequelize adicionales (include, attributes…)
   * @param {object} [extraOptions._extraFilters] - Filtros extra que se mergean al WHERE
   * @param {string[]} [extraOptions._searchFields] - Sobreescribe searchFields del constructor
   */
  findAllPaginated(filters = {}, paginationParams = {}, searchTerm = null, extraOptions = {}) {
    const { limit, offset, sortBy, order } = paginationParams;

    // ── Criteria ──
    const criteria = {};

    if (filters.isActive !== undefined) {
      criteria.is_active = filters.isActive;
    }

    if (this._filterIdField && this._filterIdKey && filters[this._filterIdKey]) {
      criteria[this._filterIdField] = filters[this._filterIdKey];
    }

    // Filtros extra que los repos hijos necesiten agregar al WHERE
    const extraFilters = extraOptions._extraFilters ?? {};
    Object.assign(criteria, extraFilters);

    // ── Search ──
    const searchFields = extraOptions._searchFields ?? this._searchFields;
    let whereCondition = { ...criteria };

    if (searchTerm && searchFields.length > 0) {
      whereCondition = {
        [Op.and]: [criteria, { [Op.or]: searchFields.map(f => ({ [f]: { [Op.iLike]: `%${searchTerm}%` } })) }]
      };
    }

    // ── SortBy seguro: solo permite columnas que existen en el modelo ──
    const modelAttributes = Object.keys(this.model.rawAttributes);
    const safeSortBy = modelAttributes.includes(sortBy) ? sortBy : 'created_at';

    // ── Include ──
    const cleanExtra = { ...extraOptions };
    delete cleanExtra._searchFields;
    delete cleanExtra._extraFilters;
    const include = cleanExtra.include ?? this._defaultInclude;

    return this.model.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [[safeSortBy, order]],
      ...cleanExtra,
      include
    });
  }
}

module.exports = ReadRepository;
