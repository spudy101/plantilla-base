// modules/schemas/core/repositories/system-global-config.repository.ts
//
// Acceso a `system_global_config`. Antes varios services llamaban directo a
// `SystemGlobalConfig.findOne(...)` (el modelo de Sequelize), saltándose la capa
// de repositorios. Centralizarlo aquí cumple Dependency Inversion: los services
// dependen de este repositorio (inyectable) y no del ORM.
import BaseRepository = require('../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../shared/models');
const { SystemGlobalConfig } = modelsModule;
import type defineSystemGlobalConfig = require('../models/system-global-config.model');

class SystemGlobalConfigRepository extends BaseRepository<defineSystemGlobalConfig.Instance> {
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

export = new SystemGlobalConfigRepository();
