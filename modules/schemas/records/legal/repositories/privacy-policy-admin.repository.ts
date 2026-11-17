// modules/admin/privacy-policy/repositories/privacy-policy-admin.repository.ts
//
// Extiende el repositorio base de PrivacyPolicy con capacidades de
// administración: paginación, búsqueda y detalle por ID.
// El repositorio público (kyc) maneja solo findActive() y createVersion().
// Este repositorio es exclusivo del panel admin.

import BaseRepository from '../../../../../shared/repositories/base.repository';
import ReadRepository from '../../../../../shared/repositories/read.repository';
import modelsModule from '../../../../../shared/models';
const { PrivacyPolicy } = modelsModule;
import type definePrivacyPolicy from '../models/privacy-policy.model';

class PrivacyPolicyAdminRepository extends BaseRepository<definePrivacyPolicy.Instance> {
  constructor() {
    super(PrivacyPolicy, {
      searchFields: ['version', 'summary']
    });
  }

  override findAllPaginated(
    filters: ReadRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {},
    searchTerm: string | null = null
  ) {
    return super.findAllPaginated(
      filters,
      { ...paginationParams, sortBy: paginationParams.sortBy || 'effective_date' },
      searchTerm
    );
  }

  findByVersion(version: string) {
    return this.findOne({ version });
  }

  // ✅ Agregado
  async createVersion(data: Omit<definePrivacyPolicy.CreationAttributes, 'is_active'>) {
    await this.model.update({ is_active: false }, { where: { is_active: true } });

    return this.model.create({
      ...data,
      is_active: true
    });
  }
}

export default new PrivacyPolicyAdminRepository();
