// shared/database/unit-of-work.ts
//
// ============================================================
// UNIT OF WORK — puerto de transacciones (SOLID: D, Dependency Inversion)
// ============================================================
// Los services y casos de uso NO conocen el ORM: cuando necesitan atomicidad piden una unidad de
// trabajo. Todo lo que pasa dentro de `work` se confirma junto o se revierte junto:
//
//   const user = await this.unitOfWork.run(async transaction => {
//     const user = await this.userRepository.create(data, { transaction });  // repo Sequelize
//     await this.genderRepository.exists({ genderId });                     // repo Prisma: solo
//     return user;
//   });
//   logAudit(…);  // lo que va DESPUÉS del commit, fuera de run()
//
// Migración a Prisma (docs/prisma-migration.md, fase 2): `run()` abre la transacción de Sequelize (que
// recibe `work` para pasarla a esos repositorios) y publica la unidad en transaction-context. Si un
// repositorio Prisma la usa, se abre ahí una transacción interactiva de Prisma (perezosa: si nadie la
// pide, no hay segunda conexión). Si `work` lanza, se revierten las dos; si no, se confirma primero la
// de Prisma y después la de Sequelize.
//
// Mientras convivan son DOS conexiones: (1) no es atómico si falla el commit de la segunda (un error
// de negocio dentro de `work` revierte las dos) y (2) un flujo no puede tocar la misma fila con los dos
// ORMs (la segunda conexión esperaría el lock de la primera hasta el timeout). Por eso cada flujo
// transaccional se migra entero a Prisma (fase 5). Con Sequelize fuera queda solo la de Prisma.
//
// Un `run()` dentro de otro se une a la unidad activa (no abre otra).
// No hay `begin()` manual: con commit/rollback a mano el contexto no se propaga a quien llama, y
// Prisma no tiene transacciones manuales.
// ============================================================
import { interopDefault } from '../utils/interop.util';
import type { Sequelize, Transaction, TransactionOptions } from 'sequelize';
import type { Prisma } from './generated/prisma/client';
import txContext from './transaction-context';

/** Lo que el Unit of Work necesita del cliente de Prisma (inyectable en tests). */
interface PrismaTransactional {
  $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<R>;
}

// Prisma corta una transacción interactiva a los 5 s por defecto; los flujos con bcrypt + varias
// escrituras pueden acercarse. maxWait: cuánto esperar una conexión libre del pool.
const PRISMA_TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 };

/**
 * Transacción interactiva de Prisma que se confirma o revierte desde afuera: `$transaction` recibe un
 * callback, así que se lo deja esperando una promesa que el Unit of Work resuelve al final de `run()`.
 */
function deferredPrismaTransaction(getClient: () => PrismaTransactional) {
  let opened: Promise<Prisma.TransactionClient> | null = null;
  let settled: Promise<unknown> | null = null;
  let finish: { resolve: () => void; reject: (e: unknown) => void } | null = null;

  return {
    get(): Promise<Prisma.TransactionClient> {
      opened ??= new Promise((resolveTx, rejectOpen) => {
        settled = getClient().$transaction(
          tx =>
            new Promise<void>((resolve, reject) => {
              finish = { resolve, reject };
              resolveTx(tx);
            }),
          PRISMA_TX_OPTIONS
        );
        settled.catch(rejectOpen); // si no llegó a abrir (sin conexión, maxWait), falla quien la pidió
      });
      return opened;
    },
    async commit(): Promise<void> {
      if (!settled) return;
      finish?.resolve();
      await settled;
    },
    async rollback(error: unknown): Promise<void> {
      if (!settled) return;
      finish?.reject(error);
      await settled.catch(() => undefined); // el error que se propaga es el de `work`
    }
  };
}

class SequelizeUnitOfWork implements SequelizeUnitOfWork.Port {
  private readonly _sequelize: Sequelize | null;
  private readonly _prisma: PrismaTransactional | null;

  /**
   * @param deps.sequelize / deps.prisma Clientes. Si no se pasan, se resuelven de forma perezosa
   *   (`shared/models` y `shared/database/prisma`), así los mocks de test sobre esos módulos aplican.
   */
  constructor({ sequelize, prisma }: { sequelize?: Sequelize; prisma?: PrismaTransactional } = {}) {
    this._sequelize = sequelize ?? null;
    this._prisma = prisma ?? null;
  }

  private _db(): Sequelize {
    // require diferido: shared/models carga todos los modelos y no debe resolverse al importar este puerto.
    return this._sequelize ?? (interopDefault(require('../models') as typeof import('../models')) as { sequelize: Sequelize }).sequelize;
  }

  private _prismaClient(): PrismaTransactional {
    return this._prisma ?? (interopDefault(require('./prisma') as typeof import('./prisma')) as unknown as PrismaTransactional);
  }

  /** Ejecuta `work` dentro de una unidad de trabajo (commit/rollback automáticos). */
  run<T>(work: (transaction: Transaction) => PromiseLike<T>, options: TransactionOptions = {}): Promise<T> {
    const active = txContext.activeUnit();
    if (active) {
      return Promise.resolve(work(active.sequelize));
    }
    return this._db().transaction(options, async sequelizeTx => {
      const prismaTx = deferredPrismaTransaction(() => this._prismaClient());
      let result: T;
      try {
        result = await txContext.runInUnit({ sequelize: sequelizeTx, prisma: () => prismaTx.get() }, () => work(sequelizeTx));
      } catch (error) {
        await prismaTx.rollback(error);
        throw error; // Sequelize revierte la suya al ver el rechazo
      }
      await prismaTx.commit();
      return result;
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SequelizeUnitOfWork {
  /**
   * Contrato que cualquier implementación de Unit of Work debe respetar (SOLID: L).
   * Los services dependen de este puerto, no del ORM.
   */
  export interface Port {
    run<T>(work: (transaction: Transaction) => PromiseLike<T>, options?: TransactionOptions): Promise<T>;
  }
}

// Instancia por defecto + la clase (tests y composición), igual que el resto de los services.
const unitOfWork = Object.assign(new SequelizeUnitOfWork(), { SequelizeUnitOfWork });

export default unitOfWork;
