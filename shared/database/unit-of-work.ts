// shared/database/unit-of-work.ts
//
// ============================================================
// UNIT OF WORK — puerto de transacciones (SOLID: D, Dependency Inversion)
// ============================================================
// Los services y casos de uso NO conocen Sequelize: cuando necesitan
// atomicidad piden una transacción a la Unit of Work.
//
//   const tx = await this.unitOfWork.begin();
//   try { ...; await tx.commit(); } catch (e) { await tx.rollback(); throw e; }
//
//   // o en modo gestionado (commit/rollback automáticos):
//   await this.unitOfWork.run(async (tx) => { ... });
//
// Hoy la implementación delega en `sequelize.transaction()`. Si mañana se
// cambia de ORM, solo se reemplaza esta clase (el adaptador) y los services
// quedan intactos. En tests se inyecta un fake con la misma forma.
// ============================================================
import { interopDefault } from '../utils/interop.util';
import type { Sequelize, Transaction, TransactionOptions } from 'sequelize';

class SequelizeUnitOfWork implements SequelizeUnitOfWork.Port {
  private readonly _sequelize: Sequelize | null;

  /**
   * @param deps.sequelize Instancia de Sequelize. Si no se pasa, se resuelve de forma perezosa
   *   desde `shared/models` (así los mocks de test sobre ese módulo siguen aplicando).
   */
  constructor({ sequelize }: { sequelize?: Sequelize } = {}) {
    this._sequelize = sequelize ?? null;
  }

  private _db(): Sequelize {
    // require diferido: shared/models carga todos los modelos y no debe resolverse al importar este puerto.
    return this._sequelize ?? (interopDefault(require('../models') as typeof import('../models')) as { sequelize: Sequelize }).sequelize;
  }

  /** Abre una transacción manual (el llamador hace commit/rollback). */
  begin(options?: TransactionOptions): Promise<Transaction> {
    return options === undefined ? this._db().transaction() : this._db().transaction(options);
  }

  /** Ejecuta `work(tx)` dentro de una transacción gestionada. */
  run<T>(work: (transaction: Transaction) => PromiseLike<T>, options: TransactionOptions = {}): Promise<T> {
    return this._db().transaction(options, work);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SequelizeUnitOfWork {
  /** Transacción mínima que ven los services (independiente del ORM). */
  export interface UnitTransaction {
    commit(): Promise<void>;
    rollback(): Promise<void>;
  }

  /**
   * Contrato que cualquier implementación de Unit of Work debe respetar (SOLID: L).
   * Los services dependen de este puerto, no de Sequelize.
   */
  export interface Port {
    begin(options?: TransactionOptions): Promise<UnitTransaction>;
    run<T>(work: (transaction: Transaction) => PromiseLike<T>, options?: TransactionOptions): Promise<T>;
  }
}

// Instancia por defecto + la clase (tests y composición), igual que el resto de los services.
const unitOfWork = Object.assign(new SequelizeUnitOfWork(), { SequelizeUnitOfWork });

export default unitOfWork;
