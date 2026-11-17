// shared/database/transaction-context.ts
//
// Unidad de trabajo activa de la petición en curso, en AsyncLocalStorage (docs/prisma-migration.md,
// fase 2). `unitOfWork.run()` la abre y la publica acá; los repositorios de Prisma la toman solos
// (PrismaRepository#db), así un service no pasa la transacción por cada llamada.
//
// La transacción de Prisma se abre de forma PEREZOSA: la primera vez que un repositorio Prisma la pide
// dentro de la unidad. Un flujo que solo usa repositorios Sequelize no ocupa una segunda conexión.
//
// Los repositorios de Sequelize siguen recibiendo `{ transaction }` explícito (el `transaction` que
// `run()` le pasa al trabajo). No se activa el CLS de Sequelize a propósito: cambiaría qué consultas
// se unen solas a una transacción (p. ej. un setImmediate disparado dentro), y esa capa se va con
// Sequelize en la fase 7.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transaction } from 'sequelize';
import type { Prisma } from './generated/prisma/client';

export interface ActiveUnit {
  /** Transacción de Sequelize (los repositorios Sequelize la reciben por parámetro). */
  sequelize: Transaction;
  /** Cliente de la transacción interactiva de Prisma; la abre la primera llamada. */
  prisma(): Promise<Prisma.TransactionClient>;
}

const storage = new AsyncLocalStorage<ActiveUnit>();

/** La unidad de trabajo en curso, o null fuera de `unitOfWork.run()`. */
export function activeUnit(): ActiveUnit | null {
  return storage.getStore() ?? null;
}

/** Ejecuta `fn` con `unit` como unidad activa (solo lo usa el Unit of Work). */
export function runInUnit<T>(unit: ActiveUnit, fn: () => T): T {
  return storage.run(unit, fn);
}

export default { activeUnit, runInUnit };
