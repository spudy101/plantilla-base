// shared/database/unit-of-work.js
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
//
// Contrato (lo que cualquier implementación debe respetar — SOLID: L):
//   begin(options?)          → Promise<{ commit(): Promise, rollback(): Promise }>
//   run(work, options?)      → Promise<resultado de work(tx)>
// ============================================================

class SequelizeUnitOfWork {
  /**
   * @param {object} [deps]
   * @param {object} [deps.sequelize] Instancia de Sequelize. Si no se pasa,
   *   se resuelve de forma perezosa desde `shared/models` (así los mocks de
   *   test sobre ese módulo siguen aplicando).
   */
  constructor({ sequelize } = {}) {
    this._sequelize = sequelize ?? null;
  }

  _db() {
    return this._sequelize ?? require('../models').sequelize;
  }

  /** Abre una transacción manual (el llamador hace commit/rollback). */
  begin(...args) {
    return this._db().transaction(...args);
  }

  /** Ejecuta `work(tx)` dentro de una transacción gestionada. */
  run(work, options = {}) {
    return this._db().transaction(options, work);
  }
}

module.exports = new SequelizeUnitOfWork();
module.exports.SequelizeUnitOfWork = SequelizeUnitOfWork;
