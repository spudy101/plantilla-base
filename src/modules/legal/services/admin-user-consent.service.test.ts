// tests/unit/modules/admin/records/legal/services/admin-user-consent.service.test.ts
//
// AdminUserConsentService — consulta administrativa de consentimientos. Probamos la orquestación:
// list() arma filtros desde el query (_buildFilters), pagina y mapea con metadata; getHistoryByUser()
// lanza 404 cuando el usuario no tiene consentimientos y, si los tiene, mapea + audita. Repositorio,
// paginación, DTOs y logger se mockean para aislar la lógica. AppError es el real (verificado con
// .rejects / statusCode).

jest.mock('../../../shared/observability/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../audit/audit.service', () => ({ record: jest.fn() }));

// Paginación determinista para no depender de su parsing interno.
jest.mock('../../../shared/http/pagination.util', () => ({
  stringParam: jest.requireActual('../../../shared/http/pagination.util').default.stringParam,
  booleanParam: jest.requireActual('../../../shared/http/pagination.util').default.booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ page: 1, limit: 10, offset: 0, sortBy: 'created_at', order: 'DESC' })
}));

jest.mock('../../catalogs/responses/catalog-components.response', () => ({
  MetadataDTO: { build: jest.fn(meta => ({ ...meta })) }
}));

jest.mock('../repositories/user-consent.repository', () => ({
  findAllPaginatedForAdmin: jest.fn(),
  findHistoryByUser: jest.fn()
}));

jest.mock('../responses/admin-user-consent.response', () => ({
  UserConsentAuditItemDTO: jest.fn(r => ({ dto: true, ...r }))
}));

import { mocked } from 'tests/helpers/mock';
import consentRepoModule from '../repositories/user-consent.repository';
const consentRepo = mocked(consentRepoModule);
import componentsCatalogDtoModule from '../../catalogs/responses/catalog-components.response';
const { MetadataDTO } = mocked(componentsCatalogDtoModule);
import auditServiceModule from '../../audit/audit.service';
const logAudit = mocked(auditServiceModule).record;
import service from './admin-user-consent.service';

const ADMIN = 'admin-1';

describe('AdminUserConsentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('arma filtros desde el query, pagina, mapea y audita', async () => {
      consentRepo.findAllPaginatedForAdmin.mockResolvedValue({
        rows: [{ user_consent_id: 'c-1' }, { user_consent_id: 'c-2' }],
        count: 2
      });

      const query = {
        userId: 'u-9',
        consentTypeCode: 'PRIVACY_POLICY',
        isCurrent: 'true',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01'
      };
      const result = await service.list(query, ADMIN);

      // _buildFilters debe traducir cada campo del query (isCurrent → boolean, fechas → Date)
      expect(consentRepo.findAllPaginatedForAdmin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-9',
          consentTypeCode: 'PRIVACY_POLICY',
          isCurrent: true,
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date)
        }),
        { limit: 10, offset: 0 }
      );
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ dto: true, user_consent_id: 'c-1' });
      expect(MetadataDTO.build).toHaveBeenCalledWith(expect.objectContaining({ totalItems: 2, page: 1 }));
      expect(logAudit).toHaveBeenCalledWith('CONSENT_LIST_VIEWED', expect.objectContaining({ actorId: ADMIN, details: expect.objectContaining({ totalItems: 2, filters: expect.arrayContaining(['userId', 'consentTypeCode']) }), entityType: 'UserConsent' })
      );
    });

    it('sin filtros deja metadata.filters como undefined', async () => {
      consentRepo.findAllPaginatedForAdmin.mockResolvedValue({ rows: [], count: 0 });

      await service.list({}, ADMIN);

      expect(MetadataDTO.build).toHaveBeenCalledWith(expect.objectContaining({ filters: undefined }));
      expect(logAudit).toHaveBeenCalledWith('CONSENT_LIST_VIEWED', expect.objectContaining({ actorId: ADMIN, details: { totalItems: 0, filters: [] } })
      );
    });

    it('interpreta isCurrent="false" como boolean false', async () => {
      consentRepo.findAllPaginatedForAdmin.mockResolvedValue({ rows: [], count: 0 });

      await service.list({ isCurrent: 'false' }, ADMIN);

      expect(consentRepo.findAllPaginatedForAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ isCurrent: false }),
        expect.anything()
      );
    });
  });

  describe('getHistoryByUser', () => {
    it('lanza 404 cuando el usuario no tiene consentimientos', async () => {
      consentRepo.findHistoryByUser.mockResolvedValue({ rows: [], count: 0 });

      await expect(service.getHistoryByUser('u-9', {}, ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('mapea el historial, arma metadata y audita', async () => {
      consentRepo.findHistoryByUser.mockResolvedValue({
        rows: [{ user_consent_id: 'c-1' }],
        count: 1
      });

      const result = await service.getHistoryByUser('u-9', {}, ADMIN);

      expect(consentRepo.findHistoryByUser).toHaveBeenCalledWith('u-9', { limit: 10, offset: 0 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ dto: true, user_consent_id: 'c-1' });
      expect(MetadataDTO.build).toHaveBeenCalledWith(expect.objectContaining({ totalItems: 1 }));
      expect(logAudit).toHaveBeenCalledWith('CONSENT_HISTORY_VIEWED', expect.objectContaining({ actorId: ADMIN, details: { targetUserId: 'u-9' }, entityId: 'u-9', entityType: 'UserConsent' })
      );
    });
  });
});
