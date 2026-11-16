// shared/repositories/query.ts
//
// Piezas para los repositorios que arman el `where` por partes según filtros opcionales
// (if (status) where.status = status; …). Sequelize tipa el where como una unión de formas que no se
// puede ir mutando, así que se arma como WhereClause y se entrega con toWhere() al llamar al modelo.
// Las claves pueden ser atributos o nombres de columna (created_at en modelos underscored).
import { Op } from 'sequelize';
import type { WhereOperators, WhereOptions } from 'sequelize';

/** where en construcción: columna → valor u operadores ({ [Op.gte]: … }). */
export type WhereClause = Record<string | symbol, unknown>;

/** Entrega el where construido al modelo (único punto donde se afirma la forma). */
export function toWhere<A>(where: WhereClause): WhereOptions<A> {
  return where as WhereOptions<A>;
}

type Bound = Date | string | number;

/**
 * Rango cerrado [from, to] con los extremos que vengan. undefined si no viene ninguno, para
 * poder hacer `const r = range(a, b); if (r) where.created_at = r;`.
 */
export function range(from?: Bound | null, to?: Bound | null): WhereOperators | undefined {
  if (from == null && to == null) {
    return undefined;
  }
  const ops: WhereOperators = {};
  if (from != null) {
    ops[Op.gte] = from;
  }
  if (to != null) {
    ops[Op.lte] = to;
  }
  return ops;
}

/** Como range(), pero convierte cada extremo con new Date() (filtros que llegan como string ISO). */
export function dateRange(from?: Bound | null, to?: Bound | null): WhereOperators | undefined {
  return range(from ? new Date(from) : null, to ? new Date(to) : null);
}
