// modules/schemas/kyc/src/repositories/department.repository.ts
import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { Department } = modelsModule;
import type defineDepartment = require('../models/department.model');

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

export = new DepartmentRepository();
