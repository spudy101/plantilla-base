// tests/unit/modules/schemas/repositories/query-encapsulation.test.ts
//
// Las consultas con operadores de Sequelize (Op.in, Op.notIn…) viven en los
// repositorios, no en los services (SOLID: D e I). Aquí se cubre la traducción
// "filtros de negocio → WHERE" que antes estaba repartida en los services.

jest.mock('sequelize', () => ({
  Op: {
    in: Symbol('in'),
    notIn: Symbol('notIn'),
    between: Symbol('between'),
    gte: Symbol('gte'),
    lte: Symbol('lte'),
    and: Symbol('and'),
    or: Symbol('or'),
    iLike: Symbol('iLike')
  },
  QueryTypes: { SELECT: 'SELECT' }
}));

const mockMakeModel = () => ({
  primaryKeyAttribute: 'id',
  rawAttributes: { id: {}, created_at: {} },
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
  update: jest.fn().mockResolvedValue([1])
});

jest.mock('shared/models', () => ({
  Role: mockMakeModel()
}));

import { mocked } from 'tests/helpers/mock';
import sequelizeModule from 'sequelize';
const { Op } = mocked(sequelizeModule);
import modelsModule from 'shared/models';
const { Role } = mocked(modelsModule);
import roleRepository from 'modules/schemas/kyc/iam/repositories/role.repository';

describe('RoleRepository.findByNames', () => {
  it('filtra por IN', async () => {
    await roleRepository.findByNames(['cliente']);
    expect(Role.findAll).toHaveBeenCalledWith({ where: { name: { [Op.in]: ['cliente'] } } });
  });

  it('con exclude agrega NOT IN', async () => {
    await roleRepository.findByNames(['admin', 'superadmin'], { exclude: ['superadmin'] });
    expect(Role.findAll).toHaveBeenCalledWith({
      where: { name: { [Op.in]: ['admin', 'superadmin'], [Op.notIn]: ['superadmin'] } }
    });
  });
});

