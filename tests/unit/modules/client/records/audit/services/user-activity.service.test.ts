// tests/unit/modules/client/records/audit/services/user-activity.service.test.ts
//
// UserActivityService — feed de actividad del propio usuario, mezcla de audit_logs (self) + user_change_logs
// (cambios de terceros). Probamos: fusión y orden descendente por fecha con corte de página, resolución por
// lote del dispositivo por sesión (solo sesiones del propio usuario), y el corto-circuito cuando no hay
// session_ids. Repos y DTO mockeados; la paginación real se ejercita.

jest.mock('modules/schemas/records/audit/repositories/audit-log.repository', () => ({
  findClientSafeByUser: jest.fn()
}));

jest.mock('modules/schemas/records/audit/repositories/user-change-log.repository', () => ({
  findExternalChangesByUserId: jest.fn()
}));

jest.mock('modules/schemas/kyc/iam/repositories/user-session.repository', () => ({
  findByIdsWithDeviceForUser: jest.fn()
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

jest.mock('modules/client/records/audit/dtos/user-activity.dto', () => ({
  UserActivityListResponseDTO: jest.fn((merged, metadata, deviceBySession) => ({ merged, metadata, deviceBySession }))
}));

import { mocked, Loose } from 'tests/helpers/mock';
import auditLogRepositoryModule = require('modules/schemas/records/audit/repositories/audit-log.repository');
const auditLogRepository = mocked(auditLogRepositoryModule);
import userChangeLogRepositoryModule = require('modules/schemas/records/audit/repositories/user-change-log.repository');
const userChangeLogRepository = mocked(userChangeLogRepositoryModule);
import userSessionRepositoryModule = require('modules/schemas/kyc/iam/repositories/user-session.repository');
const userSessionRepository = mocked(userSessionRepositoryModule);
import loggerUtilModule = require('shared/utils/logger.util');
const { logAudit } = mocked(loggerUtilModule);
import userActivityDtoModule = require('modules/client/records/audit/dtos/user-activity.dto');
const { UserActivityListResponseDTO } = mocked(userActivityDtoModule);
import service = require('modules/client/records/audit/services/user-activity.service');

const USER_ID = 'user-1';

describe('UserActivityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentActivity', () => {
    it('fusiona ambas fuentes, ordena por fecha desc, audita y resuelve dispositivos por sesión', async () => {
      auditLogRepository.findClientSafeByUser.mockResolvedValue({
        rows: [{ audit_log_id: 'a1', session_id: 'sess1', createdAt: new Date('2026-01-02') }],
        count: 1
      });
      userChangeLogRepository.findExternalChangesByUserId.mockResolvedValue({
        rows: [{ log_id: 'c1', origin_session_id: 'sess2', created_at: new Date('2026-01-03') }],
        count: 1
      });
      userSessionRepository.findByIdsWithDeviceForUser.mockResolvedValue([
        { user_session_id: 'sess1', device: { user_trusted_device_id: 'd1', device_name: 'iPhone' } },
        { user_session_id: 'sess2', device: null }
      ]);

      // UserActivityListResponseDTO está mockeado: el resultado tiene la forma del mock
      const result: Loose = await service.getRecentActivity(USER_ID, { page: '1', limit: '10' });

      // La fuente audit se consulta con la whitelist client-safe y offset+limit filas.
      expect(auditLogRepository.findClientSafeByUser).toHaveBeenCalledWith(
        USER_ID,
        expect.arrayContaining(['LOGIN_SUCCESS', 'PASSWORD_CHANGED']),
        { limit: 10, offset: 0 }
      );

      // Orden descendente por fecha: el cambio (03-ene) va antes que el audit (02-ene).
      const { merged } = result;
      expect(merged.map((m: Loose) => m.__source)).toEqual(['change', 'audit']);

      // deviceBySession resuelto solo con sesiones del propio usuario.
      expect(userSessionRepository.findByIdsWithDeviceForUser).toHaveBeenCalledWith(
        expect.arrayContaining(['sess1', 'sess2']),
        USER_ID
      );
      const deviceMap = UserActivityListResponseDTO.mock.calls[0][2];
      expect(deviceMap.get('sess1')).toEqual({ deviceId: 'd1', name: 'iPhone' });
      expect(deviceMap.get('sess2')).toBeNull();

      expect(logAudit).toHaveBeenCalledWith(
        'RECENT_ACTIVITY_VIEWED',
        USER_ID,
        { totalItems: 2, page: 1 },
        expect.anything()
      );
      expect(result.metadata).toEqual(expect.objectContaining({ totalItems: 2, page: 1, order: 'DESC' }));
    });

    it('no consulta dispositivos cuando ningún ítem tiene session_id', async () => {
      auditLogRepository.findClientSafeByUser.mockResolvedValue({
        rows: [{ audit_log_id: 'a1', session_id: null, createdAt: new Date('2026-01-02') }],
        count: 1
      });
      userChangeLogRepository.findExternalChangesByUserId.mockResolvedValue({
        rows: [{ log_id: 'c1', origin_session_id: null, created_at: new Date('2026-01-01') }],
        count: 1
      });

      const result: Loose = await service.getRecentActivity(USER_ID, {});

      expect(userSessionRepository.findByIdsWithDeviceForUser).not.toHaveBeenCalled();
      const deviceMap = UserActivityListResponseDTO.mock.calls[0][2];
      expect(deviceMap.size).toBe(0);
      expect(result.metadata.totalItems).toBe(2);
    });
  });
});
