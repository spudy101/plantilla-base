// shared/repositories/read.repository.ts
import { Op } from 'sequelize';
import type { WhereClause } from './query';
import type {
  Attributes,
  CountOptions,
  FindAndCountOptions,
  FindOptions,
  Includeable,
  Model,
  ModelStatic,
  Sequelize,
  WhereOptions
} from 'sequelize';

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

class ReadRepository<M extends Model = Model> {
  readonly model: ModelStatic<M>;
  protected readonly _searchFields: string[];
  protected readonly _filterIdField: string | null;
  protected readonly _filterIdKey: string | null;
  protected readonly _defaultInclude: Includeable[];

  constructor(model: ModelStatic<M>, config: ReadRepository.Config = {}) {
    this.model = model;
    this._searchFields = config.searchFields ?? [];
    this._filterIdField = config.filterIdField ?? null;
    this._filterIdKey = config.filterIdKey ?? null;
    this._defaultInclude = config.defaultInclude ?? [];
  }

  /** Instancia de Sequelize del modelo (para query() crudas). Siempre existe tras sequelize.define. */
  protected get sequelize(): Sequelize {
    const { sequelize } = this.model;
    if (!sequelize) {
      throw new Error(`${this.model.name}: el modelo no está inicializado`);
    }
    return sequelize;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  findById(id: unknown, options: FindOptions<Attributes<M>> = {}): Promise<M | null> {
    return this.model.findOne({
      where: { [this.model.primaryKeyAttribute]: id } as WhereOptions<Attributes<M>>,
      ...options
    });
  }

  /**
   * Busca varios registros por sus IDs (o por otra columna con `field`).
   * Expone una consulta con nombre para que los services no tengan que
   * armar `{ [Op.in]: ids }` (no conocen Sequelize).
   */
  findByIds(
    ids: ReadonlyArray<string | number> | null | undefined,
    field: string = this.model.primaryKeyAttribute,
    options: FindOptions<Attributes<M>> = {}
  ): Promise<M[]> {
    if (!ids || ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.model.findAll({ where: { [field]: { [Op.in]: ids } } as WhereOptions<Attributes<M>>, ...options });
  }

  findOne(criteria: WhereOptions<Attributes<M>>, options: FindOptions<Attributes<M>> = {}): Promise<M | null> {
    return this.model.findOne({ where: criteria, ...options });
  }

  findAll(criteria: WhereOptions<Attributes<M>> = {}, options: FindOptions<Attributes<M>> = {}): Promise<M[]> {
    return this.model.findAll({ where: criteria, ...options });
  }

  findAndCountAll(
    criteria: WhereOptions<Attributes<M>> = {},
    options: Omit<FindAndCountOptions<Attributes<M>>, 'group'> = {}
  ): Promise<{ rows: M[]; count: number }> {
    return this.model.findAndCountAll({ where: criteria, ...options });
  }

  count(criteria: WhereOptions<Attributes<M>> = {}, options: Omit<CountOptions<Attributes<M>>, 'group'> = {}): Promise<number> {
    return this.model.count({ where: criteria, ...options });
  }

  async exists(criteria: WhereOptions<Attributes<M>>): Promise<boolean> {
    return (await this.count(criteria)) > 0;
  }

  /**
   * findAll con raw: true para agregados (COUNT/AVG/SUM con alias, GROUP BY). Las filas no son
   * instancias del modelo sino las columnas que pide el llamador: R describe esa forma.
   */
  protected async aggregate<R extends object>(options: Omit<FindOptions<Attributes<M>>, 'raw'>): Promise<R[]> {
    const rows: unknown = await this.model.findAll({ ...options, raw: true });
    return rows as R[];
  }

  // ─── Paginated ────────────────────────────────────────────────────────────

  /**
   * Paginación estándar con filtros, búsqueda e includes.
   *
   * Cuando se llama sin argumentos extra, usa la configuración declarada en
   * el constructor (searchFields, filterIdField/Key, defaultInclude).
   * Los subrepositories pueden sobreescribir pasando sus propios parámetros
   * para casos que se desvían del patrón estándar.
   */
  findAllPaginated(
    filters: ReadRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {},
    searchTerm: string | null = null,
    extraOptions: ReadRepository.PaginatedOptions<M> = {}
  ): Promise<{ rows: M[]; count: number }> {
    const { limit, offset, sortBy, order } = paginationParams;

    // ── Criteria ──
    const criteria: WhereClause = {};

    if (filters.isActive !== undefined) {
      criteria.is_active = filters.isActive;
    }

    if (this._filterIdField && this._filterIdKey && filters[this._filterIdKey]) {
      criteria[this._filterIdField] = filters[this._filterIdKey];
    }

    // Filtros extra que los repos hijos necesiten agregar al WHERE
    const { _extraFilters, _searchFields, ...cleanExtra } = extraOptions;
    Object.assign(criteria, _extraFilters ?? {});

    // ── Search ──
    const searchFields = _searchFields ?? this._searchFields;
    let whereCondition: WhereOptions = { ...criteria };

    if (searchTerm && searchFields.length > 0) {
      whereCondition = {
        [Op.and]: [criteria, { [Op.or]: searchFields.map(f => ({ [f]: { [Op.iLike]: `%${searchTerm}%` } })) }]
      };
    }

    // ── SortBy seguro: solo permite columnas que existen en el modelo ──
    const modelAttributes = Object.keys(this.model.rawAttributes);
    const safeSortBy = sortBy && modelAttributes.includes(sortBy) ? sortBy : 'created_at';

    // ── Include ──
    const include = cleanExtra.include ?? this._defaultInclude;

    return this.model.findAndCountAll({
      where: whereCondition as WhereOptions<Attributes<M>>,
      limit,
      offset,
      order: [[safeSortBy, order as string]],
      ...cleanExtra,
      include
    });
  }
}

// Tipos asociados (fusión de declaraciones con la clase).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ReadRepository {
  export interface Config {
    /** Campos donde aplica iLike en la búsqueda paginada */
    searchFields?: string[];
    /** Campo FK del filtro secundario (ej: 'country_id') */
    filterIdField?: string | null;
    /** Clave del objeto filters que alimenta filterIdField (ej: 'countryId') */
    filterIdKey?: string | null;
    /** Include por defecto para findAllPaginated */
    defaultInclude?: Includeable[];
  }

  export interface PaginationParams {
    limit?: number;
    offset?: number;
    sortBy?: string;
    order?: 'ASC' | 'DESC' | string;
  }

  export type Filters = { isActive?: boolean } & Record<string, unknown>;

  /** Opciones de findAllPaginated: opciones Sequelize + extensiones del repositorio. */
  export type PaginatedOptions<M extends Model> = Omit<FindAndCountOptions<Attributes<M>>, 'where'> & {
    /** Filtros extra que se mergean al WHERE */
    _extraFilters?: WhereClause;
    /** Sobreescribe searchFields del constructor */
    _searchFields?: string[];
  };
}

export = ReadRepository;
