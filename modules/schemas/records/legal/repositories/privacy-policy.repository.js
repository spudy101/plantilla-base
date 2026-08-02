const BaseRepository = require('../../../../../shared/repositories/base.repository');
const AppError = require('../../../../../shared/utils/app-error.util');
const { PrivacyPolicy } = require('../../../../../shared/models');

class PrivacyPolicyRepository extends BaseRepository {
  constructor() {
    super(PrivacyPolicy);
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  /**
   * Retorna la versión activa actualmente.
   * Siempre debe existir una — si no hay ninguna es un error de configuración.
   */
  findActive() {
    return this.findOne({ is_active: true });
  }

  /**
   * Busca una versión por su string de versión (ej: "1.0").
   */
  findByVersion(version) {
    return this.findOne({ version });
  }

  /**
   * Lista todas las versiones ordenadas de más reciente a más antigua.
   */
  findAll(where = {}, options = {}) {
    return super.findAll(where, {
      order: [['effective_date', 'DESC']],
      ...options
    });
  }

  // ============================================================
  // ESCRITURA
  // ============================================================

  /**
   * Crea una nueva versión y la marca como activa,
   * desactivando automáticamente la versión anterior.
   *
   * Reglas de negocio:
   *   - Solo puede existir UNA versión activa
   *   - Al insertar una nueva, la anterior queda is_active: false
   *   - Nunca se editan ni eliminan versiones existentes
   *
   * @param {Object} data
   * @param {string} data.version        - Ej: "1.1"
   * @param {string} data.document_url   - URL pública del PDF
   * @param {string} [data.summary]      - Resumen de cambios
   * @param {Date}   data.effective_date - Fecha de entrada en vigor
   */
  async createVersion(data) {
    const existing = await this.findByVersion(data.version);
    if (existing) {
      throw AppError.conflict(`La versión ${data.version} ya existe`);
    }

    // Desactivar la versión activa anterior
    await this.bulkUpdate({ is_active: false }, { is_active: true });

    return this.create({
      version: data.version,
      document_url: data.document_url,
      summary: data.summary || null,
      is_active: true,
      effective_date: data.effective_date || new Date()
    });
  }
}

module.exports = new PrivacyPolicyRepository();
