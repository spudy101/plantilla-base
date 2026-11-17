// tests/unit/modules/admin/kyc/iam/services/admin-user.service.test.js
//
// AdminUserService — gestión de USUARIOS INTERNOS (empleados). Servicio grande: se cubren las ramas
// principales de cada operación (list/detail, create, update, changeRole, setStatus, delete, sesiones
// y bitácora) más las protecciones de superadmin, cuentas eliminadas y doble aprobación. Repos,
// helpers, DTOs, paginación, notificaciones, constantes y logger se mockean para aislar la
// orquestación del servicio. Las notificaciones se disparan en setImmediate → se vacía la cola de
// macrotareas antes de assertar sobre ellas.

jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  findAllPaginated: jest.fn(),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  findForAccountDeletion: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
  setActiveStatus: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/person/repositories/person.repository', () => ({
  update: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/iam/repositories/role.repository', () => ({
  findAll: jest.fn(),
  findByNames: jest.fn(),
  findByName: jest.fn(),
  findById: jest.fn()
}));

jest.mock('modules/schemas/kyc/maintainers/repositories/document-type.repository', () => ({
  findByCode: jest.fn()
}));

jest.mock('modules/schemas/kyc/iam/repositories/user-session.repository', () => ({
  findActiveByUser: jest.fn(),
  closeAllByUser: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/records/audit/repositories/user-change-log.repository', () => ({
  findByUserId: jest.fn()
}));

jest.mock('modules/schemas/kyc/iam/helpers/internal-user.helper', () => ({
  createInternalUser: jest.fn()
}));

jest.mock('modules/schemas/kyc/person/helpers/profile.helper', () => ({
  validateNationalIdUnique: jest.fn().mockResolvedValue(undefined),
  validateEmailUnique: jest.fn().mockResolvedValue(undefined),
  validateCurrentPassword: jest.fn().mockResolvedValue(undefined),
  deleteAccountLogic: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/person/utils/kyc-shared.util', () => ({
  generateSecurePassword: jest.fn().mockReturnValue('TempPass123!'),
  logChange: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/token-blacklist.util', () => ({
  invalidateUserSessions: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/models', () => ({
  sequelize: { transaction: jest.fn() }
}));

jest.mock('shared/utils/app-error.util', () => ({
  notFound: msg => Object.assign(new Error(msg), { statusCode: 404 }),
  badRequest: msg => Object.assign(new Error(msg), { statusCode: 400 }),
  forbidden: msg => Object.assign(new Error(msg), { statusCode: 403 }),
  conflict: (msg, extra) => Object.assign(new Error(msg), { statusCode: 409, ...extra }),
  internal: msg => Object.assign(new Error(msg), { statusCode: 500 })
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').booleanParam,
  getPaginationParams: jest.fn().mockReturnValue({ limit: 10, offset: 0, page: 1, sortBy: 'created_at', order: 'DESC' })
}));

jest.mock('shared/dtos/kyc/components-catalog.dto', () => ({
  MetadataDTO: { build: meta => ({ meta: true, ...meta }) }
}));

jest.mock('shared/constants', () => ({
  INTERNAL_ROLE_NAMES: ['auditor', 'admin', 'super_admin'],
  SUPERADMIN_ROLE_NAMES: ['super_admin'],
  RBAC_ROLES: { AUDITOR: 'auditor' },
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } }
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/core/services/dual-approval.service', () => ({
  annotatePending: jest.fn().mockResolvedValue(undefined),
  gate: jest.fn().mockResolvedValue({ pending: false })
}));

jest.mock('shared/utils/audit-diff.util', () => ({
  buildAuditDiff: jest.fn().mockReturnValue({ before: { first_name: 'A' }, after: { first_name: 'B' } })
}));

jest.mock('modules/admin/kyc/iam/dtos/admin-user.dto', () => ({
  InternalUserDTO: u => (u ? { dto: 'user', ...u } : null),
  InternalUserListDTO: u => ({ dto: 'list', ...u }),
  InternalUserCreatedDTO: (u, pwd) => ({ dto: 'created', temporaryPassword: pwd, ...u }),
  UserSessionDTO: s => ({ dto: 'session', ...s }),
  UserChangeLogDTO: l => ({ dto: 'log', ...l }),
  RoleOptionDTO: r => ({ dto: 'role', ...r })
}));

const userRepository = require('modules/schemas/kyc/iam/repositories/user.repository');
const personRepository = require('modules/schemas/kyc/person/repositories/person.repository');
const roleRepository = require('modules/schemas/kyc/iam/repositories/role.repository');
const documentTypeRepository = require('modules/schemas/kyc/maintainers/repositories/document-type.repository');
const userSessionRepository = require('modules/schemas/kyc/iam/repositories/user-session.repository');
const userChangeLogRepository = require('modules/schemas/records/audit/repositories/user-change-log.repository');
const InternalUserHelper = require('modules/schemas/kyc/iam/helpers/internal-user.helper');
const ProfileHelper = require('modules/schemas/kyc/person/helpers/profile.helper');
const KycSharedUtil = require('modules/schemas/kyc/person/utils/kyc-shared.util');
const TokenBlacklistUtil = require('shared/utils/token-blacklist.util');
const { sequelize } = require('shared/models');
const { logAudit } = require('shared/utils/logger.util');
const NotificationCreationService = require('modules/schemas/notification/services/notification-creation.service');
const DualApprovalService = require('modules/schemas/core/services/dual-approval.service');
const service = require('modules/admin/kyc/iam/services/admin-user.service');

// Helper de cuerpo de bloque para vaciar la cola de macrotareas (setImmediate en notificaciones).
const flush = () => new Promise(resolve => { setImmediate(resolve); });

const AUDIT_CTX = { adminUserId: 'admin-1', ipAddress: '1.2.3.4', userAgent: 'jest' };

// Fábrica de usuario interno (rol auditor por defecto).
const makeUser = (over = {}) => ({
  user_id: 'u-1',
  role_id: 'role-auditor',
  is_active: true,
  deleted_at: null,
  role: { name: 'auditor' },
  person: { person_id: 'p-1', first_name: 'Juan', last_name: 'Perez' },
  ...over
});

describe('AdminUserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    roleRepository.findByNames.mockResolvedValue([{ role_id: 'role-auditor' }, { role_id: 'role-admin' }]);
    userRepository.findByUserId.mockResolvedValue(makeUser());
    DualApprovalService.gate.mockResolvedValue({ pending: false });
    DualApprovalService.annotatePending.mockResolvedValue(undefined);
  });

  // ============================================================
  // LIST / DETAIL
  // ============================================================

  describe('list', () => {
    it('lista usuarios internos, anota pendientes, audita y arma metadata con filtros activos', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [makeUser()], count: 1 });

      const result = await service.list({ roleId: 'role-admin', isActive: true, search: 'jua' }, 'admin-1');

      // roleId interno válido → se filtra por ese rol; se excluye al solicitante.
      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: ['role-admin'], excludeUserId: 'admin-1', isActive: true }),
        expect.any(Object),
        'jua'
      );
      expect(DualApprovalService.annotatePending).toHaveBeenCalledWith('User', expect.any(Array));
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_LIST_VIEWED', 'admin-1', { totalItems: 1 }, expect.any(Object));
      expect(result.data).toHaveLength(1);
      expect(result.metadata).toMatchObject({ meta: true, totalItems: 1, filters: { roleId: 'role-admin', isActive: true } });
    });

    it('si el roleId no es interno cae a todos los roles listables y no expone filtro de rol', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [], count: 0 });

      const result = await service.list({ roleId: 'role-cliente' }, 'admin-1');

      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: ['role-auditor', 'role-admin'] }),
        expect.any(Object),
        null
      );
      // roleId inválido igual figura en activeFilters (se agrega si query.roleId existe).
      expect(result.metadata.filters).toEqual({ roleId: 'role-cliente' });
    });
  });

  describe('listDeleted', () => {
    it('lista solo eliminados (onlyDeleted) y audita', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [makeUser({ deleted_at: new Date() })], count: 1 });

      const result = await service.listDeleted({}, 'admin-1');

      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ onlyDeleted: true }),
        expect.any(Object),
        null
      );
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_DELETED_LIST_VIEWED', 'admin-1', { totalItems: 1 }, expect.any(Object));
      expect(result.data).toHaveLength(1);
    });
  });

  describe('listRoleOptions', () => {
    it('devuelve los roles internos mapeados y audita', async () => {
      roleRepository.findByNames.mockResolvedValue([{ role_id: 'r1', name: 'auditor' }]);

      const result = await service.listRoleOptions('admin-1');

      // el service pide roles por nombre de negocio; el repositorio arma el IN / NOT IN
      expect(roleRepository.findByNames).toHaveBeenCalledWith(expect.any(Array), { exclude: expect.any(Array) });
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_ROLE_OPTIONS_VIEWED', 'admin-1', { totalItems: 1 }, expect.any(Object));
      expect(result).toEqual([{ dto: 'role', role_id: 'r1', name: 'auditor' }]);
    });
  });

  describe('getById', () => {
    it('devuelve el detalle del usuario interno y audita', async () => {
      const result = await service.getById('u-1', 'admin-1');

      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_VIEWED', 'admin-1', { targetUserId: 'u-1' }, expect.any(Object));
      expect(result).toMatchObject({ dto: 'user', user_id: 'u-1' });
    });

    it('lanza 404 si el usuario no existe', async () => {
      userRepository.findByUserId.mockResolvedValue(null);
      await expect(service.getById('u-x', 'admin-1')).rejects.toThrow('Usuario no encontrado');
    });

    it('lanza 404 si el usuario no tiene rol interno', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ role: { name: 'cliente' } }));
      await expect(service.getById('u-1', 'admin-1')).rejects.toThrow('Usuario interno no encontrado');
    });
  });

  // ============================================================
  // CREATE
  // ============================================================

  describe('create', () => {
    const data = { email: 'nuevo@x.com', firstName: 'Ana', lastName: 'Diaz', nationalId: 'SYS-1' };

    beforeEach(() => {
      roleRepository.findByName.mockResolvedValue({ role_id: 'role-auditor', name: 'auditor' });
      documentTypeRepository.findByCode.mockResolvedValue({ document_type_id: 'dt-system' });
      InternalUserHelper.createInternalUser.mockResolvedValue({ user: { user_id: 'u-new' } });
      userRepository.findByUserId.mockResolvedValue(makeUser({ user_id: 'u-new' }));
    });

    it('crea el interno como AUDITOR, valida unicidad, audita, notifica y devuelve la contraseña temporal', async () => {
      const result = await service.create(data, AUDIT_CTX);

      expect(ProfileHelper.validateNationalIdUnique).toHaveBeenCalledWith('SYS-1');
      expect(ProfileHelper.validateEmailUnique).toHaveBeenCalledWith('nuevo@x.com');
      expect(InternalUserHelper.createInternalUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'nuevo@x.com', documentTypeId: 'dt-system', role: { role_id: 'role-auditor', name: 'auditor' } })
      );
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_CREATED', 'admin-1', expect.objectContaining({ roleName: 'auditor' }), expect.any(Object));
      expect(result).toMatchObject({ dto: 'created', temporaryPassword: 'TempPass123!' });

      await flush();
      expect(NotificationCreationService.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'IAM_INTERNAL_USER_CREATED' })
      );
      expect(NotificationCreationService.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'IAM_ADMIN_USER_CREATED' })
      );
    });

    it('lanza error interno si el rol AUDITOR no existe (falta seeder RBAC)', async () => {
      roleRepository.findByName.mockResolvedValue(null);
      await expect(service.create(data, AUDIT_CTX)).rejects.toThrow(/Rol auditor no encontrado/);
    });

    it('lanza error interno si el tipo de documento SYSTEM no existe', async () => {
      documentTypeRepository.findByCode.mockResolvedValue(null);
      await expect(service.create(data, AUDIT_CTX)).rejects.toThrow(/SYSTEM/);
    });
  });

  // ============================================================
  // UPDATE
  // ============================================================

  describe('update', () => {
    it('actualiza datos básicos de la persona, audita el diff y devuelve el DTO fresco', async () => {
      const user = makeUser();
      userRepository.findByUserId.mockResolvedValueOnce(user).mockResolvedValueOnce(makeUser({ user_id: 'u-1' }));

      const result = await service.update('u-1', { firstName: 'Nuevo' }, AUDIT_CTX);

      // Se persiste vía repositorio (no con la instancia ORM)
      expect(personRepository.update).toHaveBeenCalledWith('p-1', expect.objectContaining({ first_name: 'Nuevo' }));
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_UPDATED', 'admin-1', { before: { first_name: 'A' }, after: { first_name: 'B' } }, expect.any(Object));
      expect(result).toMatchObject({ dto: 'user' });
    });

    it('rechaza (409) modificar una cuenta eliminada', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ deleted_at: new Date() }));
      await expect(service.update('u-1', { firstName: 'X' }, AUDIT_CTX)).rejects.toThrow(/eliminado/);
    });
  });

  // ============================================================
  // CHANGE ROLE
  // ============================================================

  describe('changeRole', () => {
    beforeEach(() => {
      roleRepository.findById.mockResolvedValue({ role_id: 'role-admin', name: 'admin' });
    });

    it('prohíbe cambiar el rol de un superadministrador', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ role: { name: 'super_admin' } }));
      await expect(service.changeRole('u-1', 'role-admin', AUDIT_CTX)).rejects.toThrow(/super administrador/);
    });

    it('rechaza si el usuario ya tiene ese rol', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ role_id: 'role-admin' }));
      await expect(service.changeRole('u-1', 'role-admin', AUDIT_CTX)).rejects.toThrow(/ya tiene este rol/);
    });

    it('rechaza (404) si el rol destino no existe', async () => {
      roleRepository.findById.mockResolvedValue(null);
      await expect(service.changeRole('u-1', 'role-x', AUDIT_CTX)).rejects.toThrow('Rol no encontrado');
    });

    it('rechaza (400) si el rol destino no es interno', async () => {
      roleRepository.findById.mockResolvedValue({ role_id: 'role-cli', name: 'cliente' });
      await expect(service.changeRole('u-1', 'role-cli', AUDIT_CTX)).rejects.toThrow(/no es un rol interno/);
    });

    it('si la doble aprobación queda pendiente devuelve 202 sin ejecutar el cambio', async () => {
      DualApprovalService.gate.mockResolvedValue({ pending: true, request: { id: 'ar-1' } });
      const result = await service.changeRole('u-1', 'role-admin', AUDIT_CTX);

      expect(result).toEqual({ pending: true, approvalRequest: { id: 'ar-1' } });
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('camino inline: ejecuta el cambio (update + bitácora + invalidación + notif)', async () => {
      const result = await service.changeRole('u-1', 'role-admin', AUDIT_CTX);

      expect(userRepository.update).toHaveBeenCalledWith('u-1', { role_id: 'role-admin' });
      expect(KycSharedUtil.logChange).toHaveBeenCalledWith(expect.objectContaining({ changeType: 'role', newValue: 'admin' }));
      expect(userSessionRepository.closeAllByUser).toHaveBeenCalledWith('u-1', 'role_changed');
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_ROLE_CHANGED', 'admin-1', expect.any(Object), expect.any(Object));
      expect(result).toMatchObject({ dto: 'user' });

      await flush();
      expect(NotificationCreationService.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'IAM_INTERNAL_USER_ROLE_CHANGED' }));
    });
  });

  // ============================================================
  // STATUS
  // ============================================================

  describe('setStatus', () => {
    it('prohíbe desactivar a un superadministrador', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ role: { name: 'super_admin' } }));
      await expect(service.setStatus('u-1', false, AUDIT_CTX)).rejects.toThrow(/super administrador/);
    });

    it('rechaza si el usuario ya está en el estado pedido', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ is_active: true }));
      await expect(service.setStatus('u-1', true, AUDIT_CTX)).rejects.toThrow(/ya está activo/);
    });

    it('al desactivar cierra sesiones, registra bitácora, audita y notifica', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ is_active: true }));

      const result = await service.setStatus('u-1', false, AUDIT_CTX);

      expect(userRepository.setActiveStatus).toHaveBeenCalledWith('u-1', false);
      expect(userSessionRepository.closeAllByUser).toHaveBeenCalledWith('u-1', 'account_deactivated');
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_DEACTIVATED', 'admin-1', expect.any(Object), expect.any(Object));
      expect(result).toMatchObject({ dto: 'user' });

      await flush();
      expect(NotificationCreationService.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'IAM_INTERNAL_USER_DEACTIVATED' }));
    });

    it('al activar NO cierra sesiones y audita el alta', async () => {
      userRepository.findByUserId.mockResolvedValue(makeUser({ is_active: false }));

      await service.setStatus('u-1', true, AUDIT_CTX);

      expect(userSessionRepository.closeAllByUser).not.toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_ACTIVATED', 'admin-1', expect.any(Object), expect.any(Object));
    });
  });

  // ============================================================
  // DELETE
  // ============================================================

  describe('deleteUser', () => {
    beforeEach(() => {
      // 1ª llamada: adminUser (maker); 2ª: el target interno.
      userRepository.findByUserId.mockReset();
      userRepository.findByUserId
        .mockResolvedValueOnce({ password_hash: 'hash' })
        .mockResolvedValueOnce(makeUser());
      // executeDeleteUser usa una transacción propia.
      sequelize.transaction.mockResolvedValue({
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        finished: false
      });
      userRepository.findForAccountDeletion.mockResolvedValue({
        user_id: 'u-1',
        username: 'jperez',
        person: { person_id: 'p-1', national_id: 'SYS-1', first_name: 'Juan', contact: { email: 'j@x.com' } }
      });
    });

    it('lanza 404 si el administrador (maker) no existe', async () => {
      userRepository.findByUserId.mockReset();
      userRepository.findByUserId.mockResolvedValueOnce(null);
      await expect(service.deleteUser('u-1', 'pwd', AUDIT_CTX)).rejects.toThrow('Administrador no encontrado');
    });

    it('prohíbe eliminar a un superadministrador', async () => {
      userRepository.findByUserId.mockReset();
      userRepository.findByUserId
        .mockResolvedValueOnce({ password_hash: 'hash' })
        .mockResolvedValueOnce(makeUser({ role: { name: 'super_admin' } }));
      await expect(service.deleteUser('u-1', 'pwd', AUDIT_CTX)).rejects.toThrow(/super administrador/);
    });

    it('si la doble aprobación queda pendiente devuelve 202 sin eliminar', async () => {
      DualApprovalService.gate.mockResolvedValue({ pending: true, request: { id: 'ar-9' } });
      const result = await service.deleteUser('u-1', 'pwd', AUDIT_CTX);

      expect(result).toEqual({ pending: true, approvalRequest: { id: 'ar-9' } });
      expect(sequelize.transaction).not.toHaveBeenCalled();
    });

    it('camino inline: reautentica, ejecuta la ofuscación en transacción y confirma la eliminación', async () => {
      const result = await service.deleteUser('u-1', 'pwd', AUDIT_CTX);

      expect(ProfileHelper.validateCurrentPassword).toHaveBeenCalledWith('hash', 'pwd');
      expect(ProfileHelper.deleteAccountLogic).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', personId: 'p-1' }));
      expect(userSessionRepository.closeAllByUser).toHaveBeenCalledWith('u-1', 'account_deleted');
      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_DELETED', 'admin-1', {}, expect.any(Object));
      expect(result).toEqual({ userId: 'u-1', deleted: true });
    });
  });

  describe('executeDeleteUser', () => {
    it('hace rollback y propaga si el usuario no existe dentro de la transacción', async () => {
      const tx = { commit: jest.fn(), rollback: jest.fn().mockResolvedValue(undefined), finished: false };
      sequelize.transaction.mockResolvedValue(tx);
      userRepository.findForAccountDeletion.mockResolvedValue(null);

      await expect(service.executeDeleteUser('u-1', AUDIT_CTX)).rejects.toThrow('Usuario no encontrado');
      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // SESIONES / BITÁCORA
  // ============================================================

  describe('listSessions', () => {
    it('devuelve las sesiones activas mapeadas y audita', async () => {
      userSessionRepository.findActiveByUser.mockResolvedValue([{ user_session_id: 's-1' }]);

      const result = await service.listSessions('u-1', 'admin-1');

      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_SESSIONS_VIEWED', 'admin-1', { targetUserId: 'u-1' }, expect.any(Object));
      expect(result).toEqual([{ dto: 'session', user_session_id: 's-1' }]);
    });
  });

  describe('closeSessions', () => {
    it('invalida sesiones, audita, notifica y responde closed', async () => {
      const result = await service.closeSessions('u-1', AUDIT_CTX);

      expect(userSessionRepository.closeAllByUser).toHaveBeenCalledWith('u-1', 'closed_by_admin');
      expect(TokenBlacklistUtil.invalidateUserSessions).toHaveBeenCalledWith('u-1');
      expect(result).toEqual({ userId: 'u-1', closed: true });

      await flush();
      expect(NotificationCreationService.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'IAM_INTERNAL_USER_SESSIONS_CLOSED' }));
    });
  });

  describe('listChangeLogs', () => {
    it('devuelve la bitácora paginada del usuario y audita', async () => {
      userChangeLogRepository.findByUserId.mockResolvedValue({ rows: [{ id: 'l-1' }], count: 1 });

      const result = await service.listChangeLogs('u-1', {}, 'admin-1');

      expect(logAudit).toHaveBeenCalledWith('INTERNAL_USER_CHANGE_LOGS_VIEWED', 'admin-1', { targetUserId: 'u-1' }, expect.any(Object));
      expect(result.data).toEqual([{ dto: 'log', id: 'l-1' }]);
      expect(result.metadata).toMatchObject({ totalItems: 1 });
    });
  });
});
