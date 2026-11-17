// modules/schemas/kyc/src/repositories/department.repository.ts
import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { Department } = modelsModule;
import type defineDepartment from '../models/department.model';

class DepartmentRepository extends BaseRepository<defineDepartment.Instance> {
  constructor() {
    super(Department, {
      searchFields: ['name'],
      filterIdField: 'country_id',
      filterIdKey: 'countryId',
      defaultInclude: [{ association: 'country', attributes: ['country_id', 'name', 'code'] }]
    });
  }
}

export default new DepartmentRepository();
