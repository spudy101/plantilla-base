// shared/repositories/prisma.repository.ts
//
// Base de los repositorios que ya usan Prisma (docs/prisma-migration.md). Durante la migración conviven
// con los de Sequelize (ReadRepository / BaseRepository / AppendOnlyRepository): cada repositorio cambia
// de ORM sin que sus services se enteren, porque siguen dependiendo del repositorio (SOLID: D).
//
// `await this.db()` es el cliente con el que consulta el repositorio: el de la transacción de la unidad
// de trabajo si el llamador está dentro de `unitOfWork.run()` (la abre ahí, perezosa:
// shared/database/transaction-context.ts), si no el cliente único. Los repositorios no reciben ni pasan
// transacciones.
//
// Los helpers de paginación reproducen el contrato de ReadRepository#findAllPaginated (mismos
// parámetros, que arma PaginationHelper), así un service no distingue un repositorio del otro.
import prisma from '../database/prisma';
import txContext from '../database/transaction-context';
import type { Prisma } from '../database/generated/prisma/client';

type PrismaClientInstance = typeof prisma;
/** Lo que ve un repositorio: los delegates de los modelos (el cliente único o el de una transacción). */
type PrismaDb = Prisma.TransactionClient;

const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

abstract class PrismaRepository {
  private readonly _client: PrismaDb;

  /** @param client cliente inyectable (tests); por defecto el único de la app. */
  constructor(client: PrismaDb | PrismaClientInstance = prisma) {
    // El cliente único lleva piiExtension ($extends): una extensión de consulta no cambia los tipos de
    // los modelos, pero TS no reconoce el cliente extendido como TransactionClient
    this._client = client as PrismaDb;
  }

  /** Cliente de la transacción de la unidad de trabajo en curso, o el cliente por defecto. */
  protected db(): Promise<PrismaDb> {
    const unit = txContext.activeUnit();
    return unit ? unit.prisma() : Promise.resolve(this._client);
  }

  /**
   * Cliente por defecto, aunque haya una unidad de trabajo activa. Para escrituras que deben quedar aunque
   * el flujo que las disparó se revierta (bitácoras de auditoría: con Sequelize se escribían sin transacción).
   */
  protected independentDb(): PrismaDb {
    return this._client;
  }

  /** `$transaction` propia, fuera de cualquier unidad de trabajo (p. ej. un SET LOCAL + borrado). */
  protected ownTransaction<T>(fn: (db: PrismaDb) => Promise<T>): Promise<T> {
    return (this._client as unknown as PrismaClientInstance).$transaction(tx => fn(tx as PrismaDb));
  }

  /**
   * Ejecuta `fn` de forma atómica: dentro de `unitOfWork.run()` se une a su transacción; fuera, abre
   * una propia (`$transaction`). Para escrituras de varios pasos que no deben quedar a medias aunque
   * el llamador no haya pedido una unidad de trabajo (p. ej. "desactivar la anterior + crear").
   */
  protected async atomic<T>(fn: (db: PrismaDb) => Promise<T>): Promise<T> {
    const unit = txContext.activeUnit();
    if (unit) {
      return fn(await unit.prisma());
    }
    return (this._client as unknown as PrismaClientInstance).$transaction(tx => fn(tx as PrismaDb));
  }

  /**
   * skip/take/orderBy de un listado paginado. `sortBy` llega de la query string con el nombre de la
   * columna (`created_at`, como hasta ahora) o del campo (`createdAt`); solo se acepta si es un campo
   * del modelo, si no se ordena por `defaultSort` (mismo criterio "sortBy seguro" de ReadRepository).
   */
  protected paginationArgs(
    sortableFields: readonly string[],
    { limit, offset, sortBy, order }: PrismaRepository.PaginationParams = {},
    defaultSort = 'createdAt'
  ) {
    const requested = sortBy ? camel(sortBy) : '';
    const field = sortableFields.includes(requested) ? requested : defaultSort;
    return {
      take: limit,
      skip: offset,
      orderBy: { [field]: String(order).toUpperCase() === 'ASC' ? ('asc' as const) : ('desc' as const) }
    };
  }

  /** `OR` de `contains` sin distinguir mayúsculas (el iLike de Sequelize); `{}` sin término. */
  protected searchWhere(searchTerm: string | null | undefined, fields: readonly string[]) {
    if (!searchTerm || fields.length === 0) {
      return {};
    }
    return { OR: fields.map(f => ({ [f]: { contains: searchTerm, mode: 'insensitive' as const } })) };
  }

  /**
   * `where` + paginación de un listado de catálogo, con el contrato de ReadRepository#findAllPaginated:
   * `filters.isActive` → isActive; `filterId` mapea un filtro de la query (p. ej. `countryId`) a su
   * campo; `searchTerm` busca sin mayúsculas en `searchFields`. El `where` sale sin tipo de modelo: el
   * repositorio lo castea a su `Prisma.XWhereInput` (los nombres vienen de su propia config).
   */
  protected listQuery(
    filters: PrismaRepository.Filters,
    pagination: PrismaRepository.PaginationParams,
    searchTerm: string | null,
    config: PrismaRepository.ListConfig
  ) {
    const where: Record<string, unknown> = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...this.searchWhere(searchTerm, config.searchFields ?? [])
    };
    if (config.filterId && filters[config.filterId.key]) {
      where[config.filterId.field] = filters[config.filterId.key];
    }
    return { where, page: this.paginationArgs(config.sortable, pagination) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PrismaRepository {
  export type Db = PrismaDb;
  /** Igual que ReadRepository.PaginationParams (lo arma PaginationHelper.getPaginationParams). */
  export interface PaginationParams {
    limit?: number;
    offset?: number;
    sortBy?: string;
    order?: 'ASC' | 'DESC' | string;
  }
  export type Filters = { isActive?: boolean } & Record<string, unknown>;
  export interface ListConfig {
    /** Campos por los que se puede ordenar (Object.values(Prisma.XScalarFieldEnum)). */
    sortable: readonly string[];
    searchFields?: readonly string[];
    /** Filtro por id padre: `filters[key]` → `where[field]` (ej. countryId → countryId). */
    filterId?: { key: string; field: string };
  }
  /** Resultado de un listado paginado (mismo que ReadRepository#findAllPaginated). */
  export interface Page<Row> {
    rows: Row[];
    count: number;
  }
}

export default PrismaRepository;
