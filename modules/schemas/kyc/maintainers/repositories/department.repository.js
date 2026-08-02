// modules/schemas/kyc/src/repositories/department.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { Department } = require('../../../../../shared/models');

class DepartmentRepository extends BaseRepository {
  constructor() {
    super(Department, {
      searchFields: ['name'],
      filterIdField: 'country_id',
      filterIdKey: 'countryId',
      defaultInclude: [{ association: 'country', attributes: ['country_id', 'name', 'code'] }]
    });
  }
}

module.exports = new DepartmentRepository();
