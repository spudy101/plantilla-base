// shared/database/transaction-context.ts
//
// Unidad de trabajo activa de la petición en curso, en AsyncLocalStorage. `unitOfWork.run()` la abre y
// la publica acá; los repositorios la toman solos (PrismaRepository#db), así un service no pasa la
// transacción por cada llamada.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from './generated/prisma/client';

export interface ActiveUnit {
  /** Cliente de la transacción interactiva de Prisma. */
  prisma(): Promise<Prisma.TransactionClient>;
  /**
   * true cuando el trabajo de la unidad ya terminó (antes del commit/rollback). El AsyncLocalStorage
   * sigue visible para lo que se programó adentro (setImmediate, promesas sueltas): eso no debe usar
   * una transacción que ya se cerró, así que deja de ser activa.
   */
  closed?: boolean;
}

const storage = new AsyncLocalStorage<ActiveUnit>();

/** La unidad de trabajo en curso, o null fuera de `unitOfWork.run()`. */
export function activeUnit(): ActiveUnit | null {
  const unit = storage.getStore();
  return unit && !unit.closed ? unit : null;
}

/** Ejecuta `fn` con `unit` como unidad activa (solo lo usa el Unit of Work). */
export function runInUnit<T>(unit: ActiveUnit, fn: () => T): T {
  return storage.run(unit, fn);
}

export default { activeUnit, runInUnit };
