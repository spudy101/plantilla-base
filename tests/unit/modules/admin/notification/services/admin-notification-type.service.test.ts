// tests/unit/modules/admin/notification/services/admin-notification-type.service.test.ts
//
// NotificationTypeService — gestión de tipos de notificación (admin) + envío de notificaciones
// generales/directas. Probamos list (paginación + auditoría), update (404, categoría inexistente,
// sin cambios → rollback + DTO, camino feliz con commit + auditoría), createGlobalNotification
// (crea + audita) y createDirectNotification (404 usuario, usuario inactivo, camino feliz). Repos,
// notification-creation, paginación, DTOs y la transacción de Sequelize se mockean; AppError es el
// real para conservar statusCode.

jest.mock('modules/schemas/notification/repositories/notification-type.repository', () => ({
  findAllPaginated: jest.fn(),
  findById: jest.fn()
}));

jest.mock('modules/schemas/notification/repositories/notification-category.repository', () => ({
  findById: jest.fn()
}));

jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  findByUserId: jest.fn()
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn()
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').default.stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').default.booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' }),
  buildFilters: jest.fn().mockReturnValue({})
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } }
}));

jest.mock('shared/models', () => ({
  sequelize: { transaction: jest.fn() }
}));

jest.mock('modules/admin/notification/dtos/admin-notification-type.dto', () => ({
  ListNotificationTypesResponseDTO: (rows: Loose, metadata: Loose) => ({ data: rows, metadata }),
  UpdateNotificationTypeResponseDTO: (nt: Loose) => ({ dto: 'type', code: nt.code }),
  CreateGlobalNotificationResponseDTO: (p: Loose) => ({ dto: 'global', ...p }),
  CreateDirectNotificationResponseDTO: (p: Loose) => ({ dto: 'direct', ...p })
}));

import { managedTransaction } from 'tests/helpers/transaction';
import { mocked, Loose, fixture } from 'tests/helpers/mock';
import typeRepoModule from 'modules/schemas/notification/repositories/notification-type.repository';
const typeRepo = mocked(typeRepoModule);
import categoryRepoModule from 'modules/schemas/notification/repositories/notification-category.repository';
const categoryRepo = mocked(categoryRepoModule);
import userRepoModule from 'modules/schemas/kyc/iam/repositories/user.repository';
const userRepo = mocked(userRepoModule);
import notificationCreationModule from 'modules/schemas/notification/services/notification-creation.service';
const notificationCreation = mocked(notificationCreationModule);
import loggerUtilModule from 'shared/utils/logger.util';
const { logAudit } = mocked(loggerUtilModule);
import modelsModule from 'shared/models';
const { sequelize } = mocked(modelsModule);
import service from 'modules/admin/notification/services/admin-notification-type.service';

const ADMIN = 'admin-1';

describe('NotificationTypeService', () => {
  let transaction: Loose;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
    sequelize.transaction.mockImplementation(managedTransaction(transaction));
  });

  describe('list', () => {
    it('pagina, audita y responde vía DTO de lista', async () => {
      typeRepo.findAllPaginated.mockResolvedValue({ rows: [{ notification_type_id: 't-1' }], count: 1 });

      const result = await service.list({ search: 'foo' }, ADMIN);

      expect(typeRepo.findAllPaginated).toHaveBeenCalledWith({}, expect.any(Object), 'foo');
      expect(result.data).toHaveLength(1);
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_TYPE_LIST_VIEWED',
        ADMIN,
        expect.objectContaining({ totalItems: 1 }),
        expect.objectContaining({ entityType: 'NotificationType' })
      );
    });
  });

  describe('update', () => {
    it('lanza 404 si el tipo no existe, sin abrir transacción', async () => {
      typeRepo.findById.mockResolvedValue(null);

      await expect(service.update('t-x', { name: 'X' }, ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(sequelize.transaction).not.toHaveBeenCalled();
    });

    it('lanza badRequest si la categoría reasignada no existe, sin abrir transacción', async () => {
      typeRepo.findById.mockResolvedValue({ code: 'X', update: jest.fn() });
      categoryRepo.findById.mockResolvedValue(null);

      await expect(service.update('t-1', { notificationCategoryId: 'c-x' }, ADMIN)).rejects.toMatchObject({ statusCode: 400 });
      expect(sequelize.transaction).not.toHaveBeenCalled();
    });

    it('sin campos mapeables devuelve el DTO actual sin abrir transacción', async () => {
      const nt = { code: 'X', update: jest.fn() };
      typeRepo.findById.mockResolvedValue(nt);

      const result = await service.update('t-1', { campoNoMapeado: 1 }, ADMIN);

      expect(nt.update).not.toHaveBeenCalled();
      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(result).toMatchObject({ dto: 'type', code: 'X' });
    });

    it('actualiza campos mapeados, commitea y audita', async () => {
      const updated = { code: 'X' };
      const nt = { code: 'X', update: jest.fn().mockResolvedValue(updated) };
      typeRepo.findById.mockResolvedValue(nt);
      categoryRepo.findById.mockResolvedValue({ notification_category_id: 'c-1' });

      const result = await service.update('t-1', { name: 'Nuevo', priority: 5, notificationCategoryId: 'c-1' }, ADMIN);

      expect(nt.update).toHaveBeenCalledWith(
        { name: 'Nuevo', priority: 5, notification_category_id: 'c-1' },
        { transaction }
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(result).toMatchObject({ dto: 'type' });
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_TYPE_UPDATED',
        ADMIN,
        expect.objectContaining({ updatedFields: ['name', 'priority', 'notification_category_id'] }),
        expect.objectContaining({ entityId: 't-1' })
      );
    });

    it('hace rollback y re-lanza si el update falla', async () => {
      const nt = { code: 'X', update: jest.fn().mockRejectedValue(new Error('db error')) };
      typeRepo.findById.mockResolvedValue(nt);

      await expect(service.update('t-1', { name: 'Nuevo' }, ADMIN)).rejects.toThrow('db error');
      expect(transaction.rollback).toHaveBeenCalled();
    });
  });

  describe('createGlobalNotification', () => {
    it('crea la notificación global, audita y responde vía DTO', async () => {
      notificationCreation.crearNotificacion.mockResolvedValue({ global_notification_id: 'g-1' });

      const result = await service.createGlobalNotification({ titulo: 'T', contenido: 'C', asunto: 'A' }, ADMIN);

      expect(notificationCreation.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'NOTIFICACION_GENERAL', userId: null })
      );
      expect(result).toMatchObject({ dto: 'global', titulo: 'T' });
      expect(logAudit).toHaveBeenCalledWith(
        'GLOBAL_NOTIFICATION_SENT',
        ADMIN,
        { titulo: 'T' },
        expect.objectContaining({ entityId: 'g-1', entityType: 'GlobalNotification' })
      );
    });
  });

  describe('createDirectNotification', () => {
    it('lanza 404 si el usuario no existe', async () => {
      userRepo.findByUserId.mockResolvedValue(null);

      await expect(service.createDirectNotification(fixture({ userId: 'u-x', titulo: 'T' }), ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(notificationCreation.crearNotificacion).not.toHaveBeenCalled();
    });

    it('lanza badRequest si el usuario está inactivo', async () => {
      userRepo.findByUserId.mockResolvedValue({ user_id: 'u-1', is_active: false });

      await expect(service.createDirectNotification(fixture({ userId: 'u-1', titulo: 'T' }), ADMIN)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('crea la notificación directa, audita y responde vía DTO', async () => {
      userRepo.findByUserId.mockResolvedValue({ user_id: 'u-1', is_active: true });
      notificationCreation.crearNotificacion.mockResolvedValue({ notification_id: 'n-1' });

      const result = await service.createDirectNotification({ userId: 'u-1', titulo: 'T', contenido: 'C', asunto: 'A' }, ADMIN);

      expect(notificationCreation.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'NOTIFICACION_GENERAL', userId: 'u-1' })
      );
      expect(result).toMatchObject({ dto: 'direct', userId: 'u-1' });
      expect(logAudit).toHaveBeenCalledWith(
        'DIRECT_NOTIFICATION_SENT',
        ADMIN,
        { userId: 'u-1', titulo: 'T' },
        expect.objectContaining({ entityId: 'n-1', entityType: 'Notification' })
      );
    });
  });
});
