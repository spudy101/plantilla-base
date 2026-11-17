// tests/unit/modules/admin/notification/services/admin-notification-category.service.test.js
//
// NotificationCategoryService — CRUD de categorías de notificación (admin). Probamos list
// (paginación + filtros + auditoría), getById (404 vs DTO), create (código duplicado, camino feliz
// con commit y rollback ante error), update (404, sin cambios → rollback + DTO, camino feliz con
// commit) y remove (404, bloqueo si hay tipos asignados, borrado feliz). Repos, paginación, DTOs y
// la transacción de Sequelize se mockean; AppError es el real para conservar statusCode.

jest.mock('modules/schemas/notification/repositories/notification-category.repository', () => ({
  findAllPaginated: jest.fn(),
  findById: jest.fn(),
  codeExists: jest.fn(),
  create: jest.fn(),
  delete: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/repositories/notification-type.repository', () => ({
  count: jest.fn()
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' }),
  buildFilters: jest.fn().mockReturnValue({})
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/models', () => ({
  sequelize: { transaction: jest.fn() }
}));

jest.mock('modules/admin/notification/dtos/admin-notification-category.dto', () => ({
  NotificationCategoryAdminDTO: cat => ({ dto: 'category', id: cat.notification_category_id, code: cat.code }),
  ListNotificationCategoriesResponseDTO: (rows, metadata) => ({ data: rows, metadata })
}));

const categoryRepo = require('modules/schemas/notification/repositories/notification-category.repository');
const typeRepo = require('modules/schemas/notification/repositories/notification-type.repository');
const { logAudit } = require('shared/utils/logger.util');
const { sequelize } = require('shared/models');
const service = require('modules/admin/notification/services/admin-notification-category.service');

const ADMIN = 'admin-1';

describe('NotificationCategoryService', () => {
  let transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
    sequelize.transaction.mockResolvedValue(transaction);
  });

  describe('list', () => {
    it('pagina, filtra, audita y responde vía DTO de lista', async () => {
      categoryRepo.findAllPaginated.mockResolvedValue({ rows: [{ notification_category_id: 'c-1' }], count: 1 });

      const result = await service.list({ search: 'foo' }, ADMIN);

      expect(categoryRepo.findAllPaginated).toHaveBeenCalledWith({}, expect.any(Object), 'foo');
      expect(result.data).toHaveLength(1);
      expect(result.metadata.filters).toMatchObject({ search: 'foo' });
      expect(logAudit).toHaveBeenCalledWith('NOTIFICATION_CATEGORY_LIST_VIEWED', ADMIN, { totalItems: 1 }, expect.any(Object));
    });
  });

  describe('getById', () => {
    it('lanza 404 si no existe', async () => {
      categoryRepo.findById.mockResolvedValue(null);
      await expect(service.getById('c-x', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('devuelve DTO y audita la vista', async () => {
      categoryRepo.findById.mockResolvedValue({ notification_category_id: 'c-1', code: 'ALERTS' });

      const result = await service.getById('c-1', ADMIN);

      expect(result).toMatchObject({ dto: 'category', code: 'ALERTS' });
      expect(logAudit).toHaveBeenCalledWith('NOTIFICATION_CATEGORY_VIEWED', ADMIN, { code: 'ALERTS' }, expect.objectContaining({ entityId: 'c-1' }));
    });
  });

  describe('create', () => {
    it('lanza badRequest si el código ya existe', async () => {
      categoryRepo.codeExists.mockResolvedValue(true);

      await expect(service.create({ code: 'alerts' }, ADMIN)).rejects.toMatchObject({ statusCode: 400 });
      expect(sequelize.transaction).not.toHaveBeenCalled();
    });

    it('normaliza el código, crea en transacción, commitea y audita', async () => {
      categoryRepo.codeExists.mockResolvedValue(false);
      categoryRepo.create.mockResolvedValue({ notification_category_id: 'c-9', code: 'ALERTS' });

      const result = await service.create({ code: '  alerts  ', name: 'Alertas', supportsEmail: true }, ADMIN);

      expect(categoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ALERTS', name: 'Alertas', supports_email: true }),
        { transaction }
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(result).toMatchObject({ dto: 'category', code: 'ALERTS' });
      expect(logAudit).toHaveBeenCalledWith('NOTIFICATION_CATEGORY_CREATED', ADMIN, { code: 'ALERTS' }, expect.objectContaining({ entityId: 'c-9' }));
    });

    it('hace rollback y re-lanza si la creación falla', async () => {
      categoryRepo.codeExists.mockResolvedValue(false);
      categoryRepo.create.mockRejectedValue(new Error('db error'));

      await expect(service.create({ code: 'alerts' }, ADMIN)).rejects.toThrow('db error');
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('lanza 404 (con rollback) si no existe', async () => {
      categoryRepo.findById.mockResolvedValue(null);

      await expect(service.update('c-x', { name: 'X' }, ADMIN)).rejects.toMatchObject({ statusCode: 404 });
      expect(transaction.rollback).toHaveBeenCalled();
    });

    it('sin campos a actualizar hace rollback y devuelve el DTO actual', async () => {
      const category = { notification_category_id: 'c-1', code: 'ALERTS', update: jest.fn() };
      categoryRepo.findById.mockResolvedValue(category);

      const result = await service.update('c-1', { campoNoMapeado: 1 }, ADMIN);

      expect(category.update).not.toHaveBeenCalled();
      expect(transaction.rollback).toHaveBeenCalled();
      expect(result).toMatchObject({ dto: 'category', code: 'ALERTS' });
    });

    it('actualiza columnas mapeadas, commitea y audita', async () => {
      const updated = { notification_category_id: 'c-1', code: 'ALERTS' };
      const category = { notification_category_id: 'c-1', code: 'ALERTS', update: jest.fn().mockResolvedValue(updated) };
      categoryRepo.findById.mockResolvedValue(category);

      const result = await service.update('c-1', { name: 'Nuevo', isActive: false }, ADMIN);

      expect(category.update).toHaveBeenCalledWith({ name: 'Nuevo', is_active: false }, { transaction });
      expect(transaction.commit).toHaveBeenCalled();
      expect(result).toMatchObject({ dto: 'category' });
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_CATEGORY_UPDATED',
        ADMIN,
        expect.objectContaining({ updatedFields: ['name', 'is_active'] }),
        expect.objectContaining({ entityId: 'c-1' })
      );
    });
  });

  describe('remove', () => {
    it('lanza 404 si no existe', async () => {
      categoryRepo.findById.mockResolvedValue(null);
      await expect(service.remove('c-x', ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lanza badRequest si la categoría tiene tipos asignados', async () => {
      categoryRepo.findById.mockResolvedValue({ notification_category_id: 'c-1', code: 'ALERTS' });
      typeRepo.count.mockResolvedValue(3);

      await expect(service.remove('c-1', ADMIN)).rejects.toMatchObject({ statusCode: 400 });
      expect(categoryRepo.delete).not.toHaveBeenCalled();
    });

    it('borra, audita y responde deleted:true', async () => {
      categoryRepo.findById.mockResolvedValue({ notification_category_id: 'c-1', code: 'ALERTS' });
      typeRepo.count.mockResolvedValue(0);

      const result = await service.remove('c-1', ADMIN);

      expect(categoryRepo.delete).toHaveBeenCalledWith('c-1');
      expect(result).toEqual({ notificationCategoryId: 'c-1', deleted: true });
      expect(logAudit).toHaveBeenCalledWith('NOTIFICATION_CATEGORY_DELETED', ADMIN, { code: 'ALERTS' }, expect.objectContaining({ entityId: 'c-1' }));
    });
  });
});
