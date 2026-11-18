// shared/database/unit-of-work.ts
//
// ============================================================
// UNIT OF WORK — puerto de transacciones (SOLID: D, Dependency Inversion)
// ============================================================
// Los services y casos de uso NO conocen el ORM: cuando necesitan atomicidad piden una unidad de
// trabajo. Todo lo que pasa dentro de `work` se confirma junto o se revierte junto:
//
//   const user = await this.unitOfWork.run(async () => {
//     const user = await this.userRepository.create(data);
//     await this.personContactRepository.create({ personId: user.personId, … });
//     return user;
//   });
//   logAudit(…);  // lo que va DESPUÉS del commit, fuera de run()
//
// `run()` abre una transacción interactiva de Prisma y la publica en transaction-context: los
// repositorios (PrismaRepository#db) la toman solos, así el service no la pasa por cada llamada. Si
// `work` lanza, Prisma revierte; si no, confirma.
//
// Un `run()` dentro de otro se une a la unidad activa (no abre otra).
// No hay `begin()` manual: con commit/rollback a mano el contexto no se propaga a quien llama, y
// Prisma no tiene transacciones manuales.
// ============================================================
import { interopDefault } from '../utils/interop.util';
import type { Prisma } from './generated/prisma/client';
import txContext from './transaction-context';
import type { ActiveUnit } from './transaction-context';

/** Lo que el Unit of Work necesita del cliente de Prisma (inyectable en tests). */
interface PrismaTransactional {
  $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<R>;
}

// Prisma corta una transacción interactiva a los 5 s por defecto; los flujos con bcrypt + varias
// escrituras pueden acercarse. maxWait: cuánto esperar una conexión libre del pool.
const PRISMA_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 };

class PrismaUnitOfWork implements PrismaUnitOfWork.Port {
  private readonly _prisma: PrismaTransactional | null;

  /**
   * @param deps.prisma Cliente. Si no se pasa, se resuelve de forma perezosa (`shared/database/prisma`),
   *   así el mock de test sobre ese módulo aplica y importar el puerto no crea el cliente.
   */
  constructor({ prisma }: { prisma?: PrismaTransactional } = {}) {
    this._prisma = prisma ?? null;
  }

  private _client(): PrismaTransactional {
    return this._prisma ?? (interopDefault(require('./prisma') as typeof import('./prisma')) as unknown as PrismaTransactional);
  }

  /** Ejecuta `work` dentro de una unidad de trabajo (commit/rollback automáticos). */
  run<T>(work: () => PromiseLike<T>, options: PrismaUnitOfWork.Options = {}): Promise<T> {
    if (txContext.activeUnit()) {
      return Promise.resolve(work());
    }
    return this._client().$transaction(
      async tx => {
        const unit: ActiveUnit = { prisma: () => Promise.resolve(tx) };
        try {
          return await txContext.runInUnit(unit, work);
        } finally {
          // Lo que `work` dejó programado en segundo plano ya no se une a esta unidad
          unit.closed = true;
        }
      },
      { ...PRISMA_TX_OPTIONS, ...options }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PrismaUnitOfWork {
  export interface Options {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeout?: number;
  }

  /**
   * Contrato que cualquier implementación de Unit of Work debe respetar (SOLID: L).
   * Los services dependen de este puerto, no del ORM.
   */
  export interface Port {
    run<T>(work: () => PromiseLike<T>, options?: Options): Promise<T>;
  }
}

// Instancia por defecto + la clase (tests y composición), igual que el resto de los services.
const unitOfWork = Object.assign(new PrismaUnitOfWork(), { PrismaUnitOfWork });

export default unitOfWork;
