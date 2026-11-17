// tests/unit/modules/admin/records/legal/services/consent-type.service.test.js
//
// ConsentTypeService — CRUD administrativo de tipos de consentimiento. Probamos las cuatro
// operaciones públicas (list/getById/create/update), sus guardas (not found / conflict) y el
// push best-effort al admin vía setImmediate. Mockeamos repo, DTOs, helpers de paginación,
// notificaciones, logger y constants; AppError se usa real (autocontenido).

// setImmediate en cuerpo de bloque para evitar no-promise-executor-return.
const flush = () =>
  new Promise(resolve => {
    setImmediate(resolve);
  });

jest.mock('modules/schemas/records/legal/repositories/consent-type.repository', () => ({
  findAllPaginated: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn()
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').booleanParam,
  getPaginationParams: jest.fn()
}));

jest.mock('shared/dtos/kyc/components-catalog.dto', () => ({
  MetadataDTO: { build: jest.fn(params => ({ meta: params })) }
}));

jest.mock('modules/admin/records/legal/dtos/consent-type.dto', () => ({
  ConsentTypeListDTO: jest.fn(r => ({ list: r.code })),
  ConsentTypeDTO: jest.fn(r => ({ detail: r.code }))
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo' } }
}));

const consentTypeRepository = require('modules/schemas/records/legal/repositories/consent-type.repository');
const NotificationUtil = require('modules/schemas/notification/services/notification-creation.service');
const PaginationHelper = require('shared/utils/pagination.util');
const { logAudit, logger } = require('shared/utils/logger.util');
const service = require('modules/admin/records/legal/services/consent-type.service');

const ADMIN_ID = 'admin-1';
const AUDIT_CTX = { adminUserId: ADMIN_ID };
const PAG = { page: 1, limit: 10, sortBy: 'created_at', order: 'DESC' };

describe('ConsentTypeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PaginationHelper.getPaginationParams.mockReturnValue(PAG);
  });

  describe('list', () => {
    it('pagina, mapea filas a DTO de lista, construye metadata y audita', async () => {
      consentTypeRepository.findAllPaginated.mockResolvedValue({
        rows: [{ code: 'PP' }, { code: 'CC' }],
        count: 2
      });

      const result = await service.list({ search: 'x' }, ADMIN_ID);

      expect(consentTypeRepository.findAllPaginated).toHaveBeenCalledWith({}, PAG, 'x');
      expect(result.data).toEqual([{ list: 'PP' }, { list: 'CC' }]);
      expect(result.metadata).toEqual({ meta: expect.objectContaining({ totalItems: 2, page: 1 }) });
      expect(logAudit).toHaveBeenCalledWith(
        'CONSENT_TYPE_LIST_VIEWED',
        ADMIN_ID,
        expect.objectContaining({ totalItems: 2 }),
        expect.any(Object)
      );
    });
  });

  describe('getById', () => {
    it('lanza notFound si el registro no existe', async () => {
      consentTypeRepository.findById.mockResolvedValue(null);
      await expect(service.getById('ct-1', ADMIN_ID)).rejects.toMatchObject({ statusCode: 404 });
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('devuelve el DTO de detalle y audita cuando existe', async () => {
      consentTypeRepository.findById.mockResolvedValue({ code: 'PP', consent_type_id: 'ct-1' });
      const result = await service.getById('ct-1', ADMIN_ID);
      expect(result).toEqual({ detail: 'PP' });
      expect(logAudit).toHaveBeenCalledWith(
        'CONSENT_TYPE_DETAIL_VIEWED',
        ADMIN_ID,
        expect.objectContaining({ code: 'PP' }),
        expect.any(Object)
      );
    });
  });

  describe('create', () => {
    it('lanza conflict si ya existe un tipo con el mismo código', async () => {
      consentTypeRepository.findOne.mockResolvedValue({ code: 'PP' });
      await expect(service.create({ code: 'PP', name: 'x' }, AUDIT_CTX)).rejects.toMatchObject({ statusCode: 409 });
      expect(consentTypeRepository.create).not.toHaveBeenCalled();
    });

    it('crea con el código en mayúsculas, audita, loguea y notifica al admin', async () => {
      consentTypeRepository.findOne.mockResolvedValue(null);
      consentTypeRepository.create.mockResolvedValue({ consent_type_id: 'ct-9', code: 'PRIVACY', name: 'Política' });

      const result = await service.create({ code: 'privacy', name: 'Política' }, AUDIT_CTX);

      expect(consentTypeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'PRIVACY', name: 'Política', is_mandatory: true, is_revocable: false, is_active: true })
      );
      expect(result).toEqual({ detail: 'PRIVACY' });
      expect(logAudit).toHaveBeenCalledWith('CONSENT_TYPE_CREATED', ADMIN_ID, expect.any(Object), expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'CONSENT_TYPE_ADMIN_ACTION', userId: ADMIN_ID })
      );
    });

    it('respeta isMandatory:false e isRevocable:true del body', async () => {
      consentTypeRepository.findOne.mockResolvedValue(null);
      consentTypeRepository.create.mockResolvedValue({ consent_type_id: 'ct-9', code: 'CC' });

      await service.create({ code: 'cc', name: 'x', isMandatory: false, isRevocable: true }, AUDIT_CTX);

      expect(consentTypeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_mandatory: false, is_revocable: true })
      );
    });

    it('no tumba la operación si la notificación al admin falla', async () => {
      consentTypeRepository.findOne.mockResolvedValue(null);
      consentTypeRepository.create.mockResolvedValue({ consent_type_id: 'ct-9', code: 'CC' });
      NotificationUtil.crearNotificacion.mockRejectedValueOnce(new Error('push down'));

      await service.create({ code: 'cc', name: 'x' }, AUDIT_CTX);
      await flush();

      expect(logger.warn).toHaveBeenCalledWith(
        'Error enviando notificación admin consent-type',
        expect.objectContaining({ error: 'push down' })
      );
    });
  });

  describe('update', () => {
    it('lanza notFound si el registro no existe', async () => {
      consentTypeRepository.findById.mockResolvedValue(null);
      await expect(service.update('ct-1', { name: 'x' }, AUDIT_CTX)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('actualiza aplicando defaults del registro, audita, notifica y devuelve DTO', async () => {
      const updated = { code: 'PP', name: 'Nuevo' };
      const record = {
        code: 'PP',
        name: 'Viejo',
        description: 'desc',
        is_active: true,
        update: jest.fn().mockResolvedValue(updated)
      };
      consentTypeRepository.findById.mockResolvedValue(record);

      const result = await service.update('ct-1', { name: 'Nuevo' }, AUDIT_CTX);

      expect(record.update).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nuevo', description: 'desc', is_active: true })
      );
      expect(result).toEqual({ detail: 'PP' });
      expect(logAudit).toHaveBeenCalledWith('CONSENT_TYPE_UPDATED', ADMIN_ID, expect.any(Object), expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalled();
    });
  });
});
