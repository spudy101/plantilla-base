// modules/schemas/core/repositories/system-global-config.repository.js
//
// Acceso a `system_global_config`. Antes varios services llamaban directo a
// `SystemGlobalConfig.findOne(...)` (el modelo de Sequelize), saltándose la capa
// de repositorios. Centralizarlo aquí cumple Dependency Inversion: los services
// dependen de este repositorio (inyectable) y no del ORM.
const BaseRepository = require('../../../../shared/repositories/base.repository');
const { SystemGlobalConfig } = require('../../../../shared/models');

class SystemGlobalConfigRepository extends BaseRepository {
  constructor() {
    super(SystemGlobalConfig);
  }

  /** Configuración global activa (o null si no existe). */
  /** Solo la configuración de resiliencia de integraciones de la global activa. */
  findActiveResilience() {
    return this.findOne({ is_active: true }, { attributes: ['integration_resilience'] });
  }

  findActive() {
    return this.findOne({ is_active: true });
  }

  /**
   * Crea una configuración activa con los valores por defecto del modelo.
   * @param {object} [extra] - columnas adicionales (ej. origen de la sesión)
   */
  createActive(extra = {}) {
    return this.create({ is_active: true, ...extra });
  }
}

module.exports = new SystemGlobalConfigRepository();
