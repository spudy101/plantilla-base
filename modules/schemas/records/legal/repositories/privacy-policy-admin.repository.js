// modules/admin/privacy-policy/repositories/privacy-policy-admin.repository.js
//
// Extiende el repositorio base de PrivacyPolicy con capacidades de
// administración: paginación, búsqueda y detalle por ID.
// El repositorio público (kyc) maneja solo findActive() y createVersion().
// Este repositorio es exclusivo del panel admin.

const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { PrivacyPolicy } = require('../../../../../shared/models');

class PrivacyPolicyAdminRepository extends BaseRepository {
  constructor() {
    super(PrivacyPolicy, {
      searchFields: ['version', 'summary']
    });
  }

  findAllPaginated(filters = {}, paginationParams = {}, searchTerm = null) {
    return super.findAllPaginated(
      filters,
      { ...paginationParams, sortBy: paginationParams.sortBy || 'effective_date' },
      searchTerm
    );
  }

  findById(id, options = {}) {
    return super.findById(id, options);
  }

  findByVersion(version) {
    return this.findOne({ version });
  }

  // ✅ Agregado
  async createVersion(data) {
    await this.model.update({ is_active: false }, { where: { is_active: true } });

    return this.model.create({
      ...data,
      is_active: true
    });
  }
}

module.exports = new PrivacyPolicyAdminRepository();
