// tests/unit/modules/admin/records/audit/services/admin-audit-log.service.test.ts
//
// AdminAuditLogService — consulta y exportación de logs de auditoría desde el panel admin. Se prueba
// la orquestación con repo/DTOs/paginación mockeados y AppError real (para assertar statusCode):
//   list: construye el WHERE desde los filtros del query, pagina, mapea con el DTO, arma metadata y
//   audita.  getById: 404 si no existe; camino feliz devuelve el DTO y audita.  exportToResponse:
//   escribe CSV con BOM, cabecera y filas (escapando comas), audita y loguea; con format=xlsx
//   construye el WorkbookWriter y responde con el content-type de Excel.
// ExcelJS se mockea con un WorkbookWriter mínimo para no generar un stream real.

jest.mock('exceljs', () => {
  const workbook = {
    addWorksheet: jest.fn(() => ({ columns: [], addRow: jest.fn(() => ({ commit: jest.fn() })) })),
    commit: jest.fn().mockResolvedValue(undefined)
  };
  return { stream: { xlsx: { WorkbookWriter: jest.fn(() => workbook) } } };
});

jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').default.stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').default.booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ page: 1, limit: 10, offset: 0, sortBy: 'createdAt', order: 'DESC' }),
  buildFilters: jest.fn().mockReturnValue({})
}));

jest.mock('shared/dtos/kyc/components-catalog.dto', () => ({
  MetadataDTO: { build: (meta: Loose) => ({ ...meta }) }
}));

jest.mock('modules/schemas/records/audit/repositories/audit-log.repository', () => ({
  searchPaginated: jest.fn(),
  findByIdFull: jest.fn(),
  searchForExport: jest.fn()
}));

jest.mock('modules/admin/records/audit/dtos/admin-audit-log.dto', () => ({
  AuditLogListDTO: (row: Loose) => ({ dto: 'list', ...row }),
  AuditLogDTO: (row: Loose) => ({ dto: 'detail', ...row })
}));

// El include del executor vive en el repositorio; el mock vacío evita cargar Sequelize real.

import { mocked, Loose, fixture } from 'tests/helpers/mock';
import ExcelJSModule from 'exceljs';
const ExcelJS = mocked(ExcelJSModule);
import loggerUtilModule from 'shared/utils/logger.util';
const { logAudit, logger } = mocked(loggerUtilModule);
import PaginationHelperModule from 'shared/utils/pagination.util';
const PaginationHelper = mocked(PaginationHelperModule);
import auditLogRepoModule from 'modules/schemas/records/audit/repositories/audit-log.repository';
const auditLogRepo = mocked(auditLogRepoModule);
import service from 'modules/admin/records/audit/services/admin-audit-log.service';

const ADMIN = 'admin-1';

function fakeRes() {
  return { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
}

describe('AdminAuditLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PaginationHelper.buildFilters.mockReturnValue({});
  });

  describe('list', () => {
    it('delega los filtros al repositorio, pagina, mapea con el DTO y audita', async () => {
      auditLogRepo.searchPaginated.mockResolvedValue({
        rows: [{ audit_log_id: 'a-1' }, { audit_log_id: 'a-2' }],
        count: 2
      });
      PaginationHelper.buildFilters.mockReturnValue({ action: 'LOGIN' });

      const result = await service.list({ action: 'LOGIN', userId: 'u-9', dateFrom: '2024-01-01' }, ADMIN);

      // El service ya no arma el WHERE (no conoce Sequelize): pasa los filtros de negocio tal cual.
      const [filtersArg, paginationArg] = auditLogRepo.searchPaginated.mock.calls[0];
      expect(filtersArg).toMatchObject({ action: 'LOGIN', userId: 'u-9', dateFrom: '2024-01-01' });
      expect(paginationArg).toMatchObject({ limit: expect.any(Number) });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ dto: 'list', audit_log_id: 'a-1' });
      expect(result.metadata).toMatchObject({ totalItems: 2, page: 1 });
      expect(logAudit).toHaveBeenCalledWith(
        'AUDIT_LOG_LISTED',
        ADMIN,
        expect.objectContaining({ totalItems: 2 }),
        expect.objectContaining({ entityType: 'AuditLog' })
      );
    });
  });

  describe('getById', () => {
    it('lanza 404 si el log no existe', async () => {
      auditLogRepo.findByIdFull.mockResolvedValue(null);

      await expect(service.getById('a-1', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('devuelve el DTO de detalle y audita', async () => {
      auditLogRepo.findByIdFull.mockResolvedValue({ audit_log_id: 'a-1', action: 'LOGIN' });

      const result = await service.getById('a-1', ADMIN);

      expect(result).toMatchObject({ dto: 'detail', audit_log_id: 'a-1' });
      expect(logAudit).toHaveBeenCalledWith(
        'AUDIT_LOG_VIEWED',
        ADMIN,
        { auditLogId: 'a-1' },
        expect.objectContaining({ entityId: 'a-1', entityType: 'AuditLog' })
      );
    });
  });

  describe('exportToResponse', () => {
    it('exporta CSV con BOM, cabecera y filas (escapando comas), audita y loguea', async () => {
      auditLogRepo.searchForExport.mockResolvedValue([
        { audit_log_id: 'a-1', action: 'LOGIN', description: 'texto, con coma' }
      ]);
      const res = fakeRes();

      await service.exportToResponse(fixture(res), {}, ADMIN, 'csv');

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.write).toHaveBeenCalledWith('﻿'); // BOM
      // La descripción con coma va entre comillas dobles.
      const wroteQuoted = res.write.mock.calls.some(([line]) => typeof line === 'string' && line.includes('"texto, con coma"'));
      expect(wroteQuoted).toBe(true);
      expect(res.end).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        'AUDIT_LOG_EXPORTED',
        ADMIN,
        expect.objectContaining({ format: 'csv', count: 1 }),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalled();
    });

    it('exporta XLSX construyendo el WorkbookWriter y con el content-type de Excel', async () => {
      auditLogRepo.searchForExport.mockResolvedValue([{ audit_log_id: 'a-1', action: 'LOGIN' }]);
      const res = fakeRes();

      await service.exportToResponse(fixture(res), {}, ADMIN, 'xlsx');

      expect(ExcelJS.stream.xlsx.WorkbookWriter).toHaveBeenCalledWith({ stream: res });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const workbook = ExcelJS.stream.xlsx.WorkbookWriter.mock.results[0]?.value;
      expect(workbook.commit).toHaveBeenCalled();
    });
  });
});
