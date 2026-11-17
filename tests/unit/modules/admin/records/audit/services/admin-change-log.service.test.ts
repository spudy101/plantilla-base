// tests/unit/modules/admin/records/audit/services/admin-change-log.service.test.ts
//
// ChangeLogService — listado paginado del historial de cambios de usuario para el panel admin.
// Orquesta paginación + filtros, consulta el repositorio, audita la consulta (CHANGE_LOG_VIEWED) y
// arma la respuesta vía DTO. Probamos: (1) camino base sin filtros opcionales; (2) camino con
// userId/dateFrom/dateTo/search, verificando que se inyectan en filters/metadata y que la auditoría
// incluye targetUserId. Repos, paginación, logger y DTO se mockean para aislar la lógica.

jest.mock('modules/schemas/records/audit/repositories/user-change-log.repository', () => ({
  findAllPaginated: jest.fn()
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').default.stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').default.booleanParam,
  getPaginationParams: jest.fn(),
  buildFilters: jest.fn()
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('modules/admin/records/audit/dtos/admin-change-log.dto', () => ({
  ListUserChangeLogsResponseDTO: jest.fn((rows, metadata) => ({ data: rows, metadata }))
}));

import { mocked } from 'tests/helpers/mock';
import userChangeLogRepositoryModule from 'modules/schemas/records/audit/repositories/user-change-log.repository';
const userChangeLogRepository = mocked(userChangeLogRepositoryModule);
import PaginationHelperModule from 'shared/utils/pagination.util';
const PaginationHelper = mocked(PaginationHelperModule);
import loggerUtilModule from 'shared/utils/logger.util';
const { logAudit } = mocked(loggerUtilModule);
import adminChangeLogDtoModule from 'modules/admin/records/audit/dtos/admin-change-log.dto';
const { ListUserChangeLogsResponseDTO } = mocked(adminChangeLogDtoModule);
import service from 'modules/admin/records/audit/services/admin-change-log.service';

const ADMIN = 'admin-1';
const PAGINATION = { page: 2, limit: 20, sortBy: 'created_at', order: 'DESC' };

describe('ChangeLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PaginationHelper.getPaginationParams.mockReturnValue(PAGINATION);
    PaginationHelper.buildFilters.mockReturnValue({});
    userChangeLogRepository.findAllPaginated.mockResolvedValue({ rows: [{ id: 'c1' }], count: 1 });
  });

  describe('listUserChangeLogs', () => {
    it('lista con filtros base (sin userId/fechas/search) y audita sin targetUserId', async () => {
      const result = await service.listUserChangeLogs({}, ADMIN);

      // filtros base = lo que devuelve buildFilters (aquí {})
      expect(userChangeLogRepository.findAllPaginated).toHaveBeenCalledWith({}, PAGINATION, null);

      expect(logAudit).toHaveBeenCalledWith(
        'CHANGE_LOG_VIEWED',
        ADMIN,
        { totalItems: 1, page: 2 },
        { entityId: null, entityType: 'AuditRecord' }
      );

      // metadata.filters sin search === filters tal cual
      expect(ListUserChangeLogsResponseDTO).toHaveBeenCalledWith(
        [{ id: 'c1' }],
        expect.objectContaining({ totalItems: 1, page: 2, limit: 20, sortBy: 'created_at', order: 'DESC', filters: {} })
      );
      expect(result).toEqual({
        data: [{ id: 'c1' }],
        metadata: expect.objectContaining({ totalItems: 1 })
      });
    });

    it('inyecta userId/dateFrom/dateTo/search en filtros y auditoría (targetUserId)', async () => {
      PaginationHelper.buildFilters.mockReturnValue({ change_type: 'password' });
      const query = {
        userId: 'u-9',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
        search: 'admin',
        changeType: 'password'
      };

      await service.listUserChangeLogs(query, ADMIN);

      expect(userChangeLogRepository.findAllPaginated).toHaveBeenCalledWith(
        { change_type: 'password', user_id: 'u-9', dateFrom: '2026-01-01', dateTo: '2026-02-01' },
        PAGINATION,
        'admin'
      );

      expect(logAudit).toHaveBeenCalledWith(
        'CHANGE_LOG_VIEWED',
        ADMIN,
        { totalItems: 1, page: 2, targetUserId: 'u-9' },
        { entityId: 'u-9', entityType: 'AuditRecord' }
      );

      // Con search, metadata.filters incluye search + filtros
      const [, metadata] = ListUserChangeLogsResponseDTO.mock.calls[0];
      expect(metadata.filters).toEqual({
        search: 'admin',
        change_type: 'password',
        user_id: 'u-9',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01'
      });
    });
  });
});
