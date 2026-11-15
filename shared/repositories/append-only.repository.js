// shared/repositories/append-only.repository.js
//
// ============================================================
// APPEND-ONLY REPOSITORY — lecturas + inserción (SOLID: L e I)
// ============================================================
// Para tablas donde los registros nunca se modifican ni se borran desde la
// aplicación (ej. `audit_logs`, protegida además por un trigger de BD).
// No hereda `update`/`delete`, así que ningún consumidor puede llamarlos y
// no hace falta sobrescribirlos para lanzar error.
// ============================================================
const ReadRepository = require('./read.repository');

class AppendOnlyRepository extends ReadRepository {
  create(data, options = {}) {
    return this.model.create(data, options);
  }

  bulkCreate(data, options = {}) {
    return this.model.bulkCreate(data, options);
  }
}

module.exports = AppendOnlyRepository;
