// shared/repositories/base.repository.js
//
// CRUD completo = lecturas (ReadRepository) + escrituras.
// Es la clase base por defecto para los repositorios del proyecto.
const ReadRepository = require('./read.repository');

class BaseRepository extends ReadRepository {
  // ─── Writes ───────────────────────────────────────────────────────────────

  create(data, options = {}) {
    return this.model.create(data, options);
  }

  async update(id, data, options = {}) {
    const instance = await this.findById(id, options);
    if (!instance) {
      return null;
    }
    return instance.update(data, options);
  }

  delete(id, options = {}) {
    return this.model.destroy({
      where: { [this.model.primaryKeyAttribute]: id },
      ...options
    });
  }

  bulkCreate(data, options = {}) {
    return this.model.bulkCreate(data, options);
  }

  bulkUpdate(data, criteria, options = {}) {
    return this.model.update(data, { where: criteria, ...options });
  }

  bulkDelete(criteria, options = {}) {
    return this.model.destroy({ where: criteria, ...options });
  }
}

module.exports = BaseRepository;
