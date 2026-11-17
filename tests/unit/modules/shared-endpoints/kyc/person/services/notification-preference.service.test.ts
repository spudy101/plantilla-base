// tests/unit/modules/shared-endpoints/kyc/person/services/notification-preference.service.test.ts
//
// NotificationPreferenceService — preferencias de notificación del usuario (global + overrides por
// categoría). Aislamos repositorios, transacción Sequelize y DTOs (passthrough) para probar: el
// filtrado de campos presentes (_pickPreferenceFields, undefined => no se toca), el commit/rollback
// de cada mutación, la guarda de categoría inexistente/inactiva (AppError.notFound) y las dos
// vistas de lectura (crudas y efectivas ya resueltas). Se usa el AppError real para el statusCode.

jest.mock('shared/models', () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock('shared/utils/logger.util', () => ({ logAudit: jest.fn() }));

jest.mock('modules/schemas/kyc/person/repositories/user-notification-preference.repository', () => ({
  upsertGlobalPreference: jest.fn(),
  upsertCategoryPreference: jest.fn(),
  deleteCategoryPreference: jest.fn().mockResolvedValue(undefined),
  findAllByUser: jest.fn()
}));

jest.mock('modules/schemas/notification/repositories/notification-category.repository', () => ({
  findByCode: jest.fn(),
  findAllActive: jest.fn()
}));

jest.mock('modules/shared-endpoints/kyc/person/dtos/notification-preference.dto', () => ({
  // Clase: con `new` devuelve el objeto retornado por la impl.
  UpdatePreferenceResponseDTO: jest.fn(preference => ({ built: preference })),
  CategoryPreferencesViewDTO: { buildArray: jest.fn() }
}));

jest.mock('shared/dtos/notification/components-notification.dto', () => ({
  UserNotificationPreferenceComponent: { buildArray: jest.fn() }
}));

import { managedTransaction } from 'tests/helpers/transaction';
import { mocked, Loose, fixture } from 'tests/helpers/mock';
import modelsModule from 'shared/models';
const { sequelize } = mocked(modelsModule);
import loggerUtilModule from 'shared/utils/logger.util';
const { logAudit } = mocked(loggerUtilModule);
import prefRepoModule from 'modules/schemas/kyc/person/repositories/user-notification-preference.repository';
const prefRepo = mocked(prefRepoModule);
import categoryRepoModule from 'modules/schemas/notification/repositories/notification-category.repository';
const categoryRepo = mocked(categoryRepoModule);
import notificationPreferenceDtoModuleModule from 'modules/shared-endpoints/kyc/person/dtos/notification-preference.dto';
const notificationPreferenceDtoModule = mocked(notificationPreferenceDtoModuleModule);
const {
  UpdatePreferenceResponseDTO,
  CategoryPreferencesViewDTO
} = mocked(notificationPreferenceDtoModule);
import componentsNotificationDtoModule from 'shared/dtos/notification/components-notification.dto';
const { UserNotificationPreferenceComponent } = mocked(componentsNotificationDtoModule);
import service from 'modules/shared-endpoints/kyc/person/services/notification-preference.service';

function makeTransaction() {
  return { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
}

describe('NotificationPreferenceService', () => {
  let transaction: Loose;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = makeTransaction();
    sequelize.transaction.mockImplementation(managedTransaction(transaction));
  });

  describe('updateGlobalPreference', () => {
    it('filtra solo los campos presentes, hace upsert, audita y devuelve el DTO', async () => {
      const preference = { userNotificationPreferenceId: 'pref-1' };
      prefRepo.upsertGlobalPreference.mockResolvedValue(preference);

      const result = await service.updateGlobalPreference(
        fixture({ allowPush: false, allowSms: true, quietHoursStart: '22:00', quietHoursEnd: undefined, ignorado: 'x' }),
        'user-1'
      );

      // undefined y keys ajenas no se propagan.
      expect(prefRepo.upsertGlobalPreference).toHaveBeenCalledWith(
        'user-1',
        { allowPush: false, allowSms: true, quietHoursStart: '22:00' }
      );
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_GLOBAL_PREFERENCE_UPDATED',
        'user-1',
        { allowPush: false, allowSms: true, quietHoursStart: '22:00' },
        {
          entityId: 'pref-1',
          entityType: 'UserNotificationPreference',
          entityTable: 'user_notification_preferences'
        }
      );
      expect(UpdatePreferenceResponseDTO).toHaveBeenCalledWith(preference);
      expect(result).toEqual({ built: preference });
    });

    it('si el upsert falla repropaga el error', async () => {
      const boom = new Error('db down');
      prefRepo.upsertGlobalPreference.mockRejectedValue(boom);

      await expect(service.updateGlobalPreference({ allowPush: true }, 'user-1')).rejects.toBe(boom);
      expect(logAudit).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('updateCategoryPreference', () => {
    it('rechaza categoría inexistente con AppError.notFound (404) sin abrir transacción', async () => {
      categoryRepo.findByCode.mockResolvedValue(null);

      await expect(service.updateCategoryPreference('SECURITY', { allowSms: true }, 'user-1')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND'
      });
    });

    it('rechaza categoría inactiva con AppError.notFound (404)', async () => {
      categoryRepo.findByCode.mockResolvedValue({ code: 'SECURITY', isActive: false });

      await expect(service.updateCategoryPreference('SECURITY', { allowSms: true }, 'user-1')).rejects.toMatchObject({
        statusCode: 404
      });
    });

    it('categoría válida: upsert por categoría, audita y devuelve DTO', async () => {
      categoryRepo.findByCode.mockResolvedValue({ code: 'SECURITY', isActive: true });
      const preference = { userNotificationPreferenceId: 'pref-2' };
      prefRepo.upsertCategoryPreference.mockResolvedValue(preference);

      const result = await service.updateCategoryPreference('SECURITY', { allowEmail: true }, 'user-1');

      expect(prefRepo.upsertCategoryPreference).toHaveBeenCalledWith(
        'user-1',
        'SECURITY',
        { allowEmail: true }
      );
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_CATEGORY_PREFERENCE_UPDATED',
        'user-1',
        { notificationCategoryCode: 'SECURITY', allowEmail: true },
        expect.objectContaining({ entityId: 'pref-2' })
      );
      expect(result).toEqual({ built: preference });
    });

    it('si el upsert por categoría falla repropaga', async () => {
      categoryRepo.findByCode.mockResolvedValue({ code: 'SECURITY', isActive: true });
      const boom = new Error('upsert boom');
      prefRepo.upsertCategoryPreference.mockRejectedValue(boom);

      await expect(service.updateCategoryPreference('SECURITY', { allowEmail: true }, 'user-1')).rejects.toBe(boom);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategoryPreference', () => {
    it('rechaza categoría inexistente con AppError.notFound', async () => {
      categoryRepo.findByCode.mockResolvedValue(null);

      await expect(service.deleteCategoryPreference('SECURITY', 'user-1')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('categoría válida: borra override, audita y devuelve el código', async () => {
      categoryRepo.findByCode.mockResolvedValue({ code: 'SECURITY', isActive: true });

      const result = await service.deleteCategoryPreference('SECURITY', 'user-1');

      expect(prefRepo.deleteCategoryPreference).toHaveBeenCalledWith('user-1', 'SECURITY');
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_CATEGORY_PREFERENCE_DELETED',
        'user-1',
        { notificationCategoryCode: 'SECURITY' },
        { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
      );
      expect(result).toEqual({ notificationCategoryCode: 'SECURITY' });
    });

    it('si el borrado falla repropaga', async () => {
      categoryRepo.findByCode.mockResolvedValue({ code: 'SECURITY', isActive: true });
      const boom = new Error('delete boom');
      prefRepo.deleteCategoryPreference.mockRejectedValue(boom);

      await expect(service.deleteCategoryPreference('SECURITY', 'user-1')).rejects.toBe(boom);
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('getPreferences', () => {
    it('devuelve las preferencias crudas mapeadas por el componente y audita el total', async () => {
      const stored = [{ id: 1 }, { id: 2 }];
      prefRepo.findAllByUser.mockResolvedValue(stored);
      UserNotificationPreferenceComponent.buildArray.mockReturnValue(['a', 'b']);

      const result = await service.getPreferences('user-1');

      expect(UserNotificationPreferenceComponent.buildArray).toHaveBeenCalledWith(stored);
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_PREFERENCES_VIEWED',
        'user-1',
        { totalItems: 2 },
        { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
      );
      expect(result).toEqual(['a', 'b']);
    });
  });

  describe('getCategoriesWithPreferences', () => {
    it('separa la global de los overrides por categoría y arma la vista efectiva', async () => {
      const categories = [{ code: 'SECURITY' }, { code: 'MARKETING' }];
      const globalPref = { notificationCategoryCode: null, allowPush: false };
      const override = { notificationCategoryCode: 'SECURITY', allowSms: false };
      prefRepo.findAllByUser.mockResolvedValue([globalPref, override]);
      categoryRepo.findAllActive.mockResolvedValue(categories);
      CategoryPreferencesViewDTO.buildArray.mockReturnValue(['view']);

      const result = await service.getCategoriesWithPreferences('user-1');

      // La global (category_code null) va aparte; el override entra al Map por su code.
      const [passedCategories, passedOverrides, passedGlobal] = CategoryPreferencesViewDTO.buildArray.mock.calls[0];
      expect(passedCategories).toBe(categories);
      expect(passedGlobal).toBe(globalPref);
      expect(passedOverrides).toBeInstanceOf(Map);
      expect(passedOverrides.get('SECURITY')).toBe(override);
      expect(logAudit).toHaveBeenCalledWith(
        'NOTIFICATION_PREFERENCES_VIEWED',
        'user-1',
        { totalItems: 2 },
        { entityType: 'UserNotificationPreference', entityTable: 'user_notification_preferences' }
      );
      expect(result).toEqual(['view']);
    });

    it('sin preferencia global usa null como global', async () => {
      prefRepo.findAllByUser.mockResolvedValue([]);
      categoryRepo.findAllActive.mockResolvedValue([]);
      CategoryPreferencesViewDTO.buildArray.mockReturnValue([]);

      await service.getCategoriesWithPreferences('user-1');

      const [, , passedGlobal] = CategoryPreferencesViewDTO.buildArray.mock.calls[0];
      expect(passedGlobal).toBeNull();
    });
  });
});
