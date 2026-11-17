// tests/unit/modules/admin/kyc/person/services/admin-person.service.test.js
//
// PersonService (admin) — CRUD y operaciones administrativas sobre cuentas de cliente. Es un servicio
// grande y transaccional; aquí cubrimos las ramas principales de cada operación aislando TODA la
// infraestructura (repositorios, helpers, utils, DTOs, constantes, sequelize). Verificamos:
//   - list/listDeleted/listRoleOptions/getById: filtros, roles cliente, auditoría y not-found.
//   - create: camino feliz (commit + auditoría + notificaciones en background) y rol no configurado.
//   - _toggleStatus (activate/deactivate): feliz, not-found, cuenta eliminada, ya activo/inactivo.
//   - resetPassword / changeEmail / changeNationalId (feliz + idempotente) / disableMFA (feliz + sin MFA).
//   - changeRole: feliz + guardas (admin intocable, rol inexistente, mismo rol).
//   - deleteAccount: doble aprobación pendiente vs. ejecución inline; executeDeleteAccount feliz.
// Las notificaciones se disparan en setImmediate → se vacía la cola de macrotareas antes de assertar.

// --- Infra base (node_modules) ---
jest.mock('uuid', () => ({ v4: jest.fn(() => 'uuid-fixed') }));
jest.mock('sequelize', () => ({ Op: { in: Symbol('in') } }));

// --- sequelize models: fábrica de transacción controlable por test ---
jest.mock('shared/models', () => ({
  sequelize: { transaction: jest.fn() }
}));

// --- Repositorios ---
jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({
  findByUserId: jest.fn(),
  findById: jest.fn(),
  findAllPaginated: jest.fn(),
  createWithPassword: jest.fn(),
  setActiveStatus: jest.fn(),
  updatePassword: jest.fn(),
  update: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/repositories/person.repository', () => ({
  create: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/repositories/person-contact.repository', () => ({
  create: jest.fn()
}));
jest.mock('modules/schemas/kyc/iam/repositories/role.repository', () => ({
  findAll: jest.fn(),
  findByNames: jest.fn(),
  findByName: jest.fn(),
  findById: jest.fn()
}));

// --- Helpers / utils ---
jest.mock('modules/schemas/kyc/person/utils/kyc-shared.util', () => ({
  validateNationalIdByRole: jest.fn(),
  generateSecurePassword: jest.fn(() => 'TempPass123!'),
  logChange: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined),
  crearNotificacionDirecta: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('modules/schemas/kyc/person/helpers/profile.helper', () => ({
  validateNationalIdUnique: jest.fn().mockResolvedValue(undefined),
  validateEmailUnique: jest.fn().mockResolvedValue(undefined),
  updateEmailLogic: jest.fn(),
  updateNationalIdLogic: jest.fn(),
  validateCurrentPassword: jest.fn().mockResolvedValue(undefined),
  deleteAccountLogic: jest.fn()
}));
jest.mock('modules/schemas/core/services/dual-approval.service', () => ({
  gate: jest.fn()
}));
jest.mock('shared/utils/pagination.util', () => ({
  stringParam: jest.requireActual('shared/utils/pagination.util').stringParam,
  booleanParam: jest.requireActual('shared/utils/pagination.util').booleanParam,
  getPaginationParams: jest.fn(() => ({ page: 1, limit: 10, sortBy: 'created_at', order: 'DESC' }))
}));
jest.mock('shared/utils/request-context.util', () => ({
  originFromContext: jest.fn(() => ({ origin_session_id: 'sess-1' }))
}));

jest.mock('shared/utils/logger.util', () => ({
  logAudit: jest.fn(),
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

// AppError real-ish: factories que devuelven Error con statusCode/code para poder usar .rejects.
// Dos roles de cliente para poder probar el cambio entre ellos (la plantilla trae solo CLIENTE).
jest.mock('shared/constants/rbac', () => ({
  ...jest.requireActual('shared/constants/rbac'),
  CLIENT_ROLE_NAMES: ['CLIENTE', 'CLIENTE_VERIFICADO']
}));

jest.mock('shared/utils/app-error.util', () => {
  const make = (statusCode, code) => (message, details = null) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.code = code;
    err.details = details;
    return err;
  };
  return {
    badRequest: make(400, 'BAD_REQUEST'),
    forbidden: make(403, 'FORBIDDEN'),
    notFound: make(404, 'NOT_FOUND'),
    conflict: make(409, 'CONFLICT'),
    internal: make(500, 'INTERNAL_ERROR')
  };
});

// --- Constantes (el real valida .env y hace process.exit) ---
jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } },
  RBAC_ROLES: { CLIENTE: 'cliente' },
  CLIENT_ROLE_NAMES: ['cliente', 'cliente_verificado']
}));

// --- DTOs a passthrough/marcadores ---
jest.mock('shared/dtos/kyc/components-catalog.dto', () => ({
  MetadataDTO: { build: jest.fn(meta => ({ metadata: true, ...meta })) }
}));
jest.mock('modules/admin/kyc/person/dtos/admin-person.dto', () => ({
  UserDTO: jest.fn(u => ({ dto: 'UserDTO', id: u.user_id })),
  UserListItemDTO: jest.fn(u => ({ dto: 'UserListItemDTO', id: u.user_id })),
  CreateUserDTO: jest.fn((u, pwd) => ({ dto: 'CreateUserDTO', id: u.user_id, pwd })),
  ResetPasswordDTO: jest.fn(u => ({ dto: 'ResetPasswordDTO', id: u.user_id })),
  ChangeEmailDTO: jest.fn((u, oldE, newE) => ({ dto: 'ChangeEmailDTO', oldE, newE })),
  ChangeNationalIdDTO: jest.fn((u, oldN, newN) => ({ dto: 'ChangeNationalIdDTO', oldN, newN })),
  ToggleUserStatusDTO: jest.fn((u, action) => ({ dto: 'ToggleUserStatusDTO', action })),
  DisableMFADTO: jest.fn(u => ({ dto: 'DisableMFADTO', id: u.user_id })),
  ChangeRoleDTO: jest.fn((u, oldR, newR) => ({ dto: 'ChangeRoleDTO', oldR: oldR.name, newR: newR.name })),
  RoleOptionDTO: jest.fn(r => ({ dto: 'RoleOptionDTO', id: r.role_id }))
}));

const { sequelize } = require('shared/models');
const userRepository = require('modules/schemas/kyc/iam/repositories/user.repository');
const personRepository = require('modules/schemas/kyc/person/repositories/person.repository');
const personContactRepository = require('modules/schemas/kyc/person/repositories/person-contact.repository');
const roleRepository = require('modules/schemas/kyc/iam/repositories/role.repository');
const KycSharedUtil = require('modules/schemas/kyc/person/utils/kyc-shared.util');
const NotificationUtil = require('modules/schemas/notification/services/notification-creation.service');
const ProfileHelper = require('modules/schemas/kyc/person/helpers/profile.helper');
const DualApprovalService = require('modules/schemas/core/services/dual-approval.service');
const { logAudit } = require('shared/utils/logger.util');
const service = require('modules/admin/kyc/person/services/admin-person.service');

const flushMacrotasks = () => new Promise(resolve => { setImmediate(resolve); });

const AUDIT_CTX = {
  adminUserId: 'admin-1',
  adminFirstName: 'Ana',
  ipAddress: '1.2.3.4',
  userAgent: 'jest'
};

// Transacción con `finished` que se marca al hacer commit/rollback (espejo del real de sequelize).
function makeTransaction() {
  const txn = { finished: undefined };
  txn.commit = jest.fn().mockImplementation(() => { txn.finished = 'commit'; return Promise.resolve(); });
  txn.rollback = jest.fn().mockImplementation(() => { txn.finished = 'rollback'; return Promise.resolve(); });
  return txn;
}

describe('PersonService (admin)', () => {
  let txn;

  beforeEach(() => {
    jest.clearAllMocks();
    txn = makeTransaction();
    sequelize.transaction.mockResolvedValue(txn);
    // roles cliente por defecto para _clientRoleIds
    roleRepository.findByNames.mockResolvedValue([{ role_id: 'rc1' }, { role_id: 'rc2' }]);
  });

  // ============================================================
  // CONSULTAS
  // ============================================================

  describe('list', () => {
    it('lista clientes con filtros por defecto (roles cliente) y audita', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [{ user_id: 'u1' }, { user_id: 'u2' }], count: 2 });

      const result = await service.list({}, AUDIT_CTX.adminUserId);

      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        { roleIds: ['rc1', 'rc2'] },
        { page: 1, limit: 10, sortBy: 'created_at', order: 'DESC' },
        null
      );
      expect(logAudit).toHaveBeenCalledWith(
        'PERSON_LIST_VIEWED',
        AUDIT_CTX.adminUserId,
        { totalItems: 2, page: 1 },
        { entityType: 'User', entityTable: 'users' }
      );
      expect(result.data).toEqual([
        { dto: 'UserListItemDTO', id: 'u1' },
        { dto: 'UserListItemDTO', id: 'u2' }
      ]);
    });

    it('intersecta roleId solicitado con los roles cliente válidos', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [], count: 0 });

      await service.list({ roleId: 'rc1, rX', isActive: true, nationalId: ' 111 ', userId: ' u9 ', search: 'foo' }, 'admin-1');

      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        { isActive: true, roleIds: ['rc1'], nationalId: '111', userId: 'u9' },
        expect.any(Object),
        'foo'
      );
    });

    it('si el roleId solicitado no es cliente, cae a todos los roles cliente', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [], count: 0 });

      await service.list({ roleId: 'rX,rY' }, 'admin-1');

      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        { roleIds: ['rc1', 'rc2'] },
        expect.any(Object),
        null
      );
    });
  });

  describe('listDeleted', () => {
    it('lista solo cuentas eliminadas (onlyDeleted) y audita', async () => {
      userRepository.findAllPaginated.mockResolvedValue({ rows: [{ user_id: 'ud1' }], count: 1 });

      const result = await service.listDeleted({}, 'admin-1');

      expect(userRepository.findAllPaginated).toHaveBeenCalledWith(
        { roleIds: ['rc1', 'rc2'], onlyDeleted: true },
        expect.any(Object),
        null
      );
      expect(logAudit).toHaveBeenCalledWith('PERSON_DELETED_LIST_VIEWED', 'admin-1', { totalItems: 1, page: 1 }, expect.any(Object));
      expect(result.data).toEqual([{ dto: 'UserListItemDTO', id: 'ud1' }]);
    });
  });

  describe('listRoleOptions', () => {
    it('devuelve solo los roles cliente y audita', async () => {
      roleRepository.findByNames.mockResolvedValue([{ role_id: 'rc1' }, { role_id: 'rc2' }]);

      const result = await service.listRoleOptions('admin-1');

      expect(roleRepository.findByNames).toHaveBeenCalledWith(['cliente', 'cliente_verificado']);
      expect(logAudit).toHaveBeenCalledWith('PERSON_ROLE_OPTIONS_VIEWED', 'admin-1', { totalItems: 2 }, expect.any(Object));
      expect(result).toEqual([{ dto: 'RoleOptionDTO', id: 'rc1' }, { dto: 'RoleOptionDTO', id: 'rc2' }]);
    });
  });

  describe('getById', () => {
    it('devuelve el usuario y audita PERSON_VIEWED', async () => {
      userRepository.findByUserId.mockResolvedValue({ user_id: 'u1' });

      const result = await service.getById('u1', 'admin-1');

      expect(userRepository.findByUserId).toHaveBeenCalledWith('u1', 'full');
      expect(logAudit).toHaveBeenCalledWith('PERSON_VIEWED', 'admin-1', { targetUserId: 'u1' }, expect.objectContaining({ entityId: 'u1' }));
      expect(result).toEqual({ dto: 'UserDTO', id: 'u1' });
    });

    it('lanza 404 si el usuario no existe', async () => {
      userRepository.findByUserId.mockResolvedValue(null);
      await expect(service.getById('nope', 'admin-1')).rejects.toThrow('Usuario no encontrado');
    });
  });

  // ============================================================
  // CREACIÓN
  // ============================================================

  describe('create', () => {
    const userData = {
      firstName: 'Juan',
      lastName: 'Pérez',
      nationalId: '11111111-1',
      email: 'juan@test.com'
    };

    beforeEach(() => {
      roleRepository.findByName.mockResolvedValue({ role_id: 'rc1', name: 'cliente' });
      personRepository.create.mockResolvedValue({ person_id: 'p1' });
      personContactRepository.create.mockResolvedValue({});
      userRepository.createWithPassword.mockResolvedValue({ user_id: 'u1' });
      userRepository.findByUserId.mockResolvedValue({ user_id: 'u1' });
    });

    it('crea persona/contacto/usuario, commitea, audita y notifica en background', async () => {
      const result = await service.create(userData, AUDIT_CTX);

      expect(KycSharedUtil.validateNationalIdByRole).toHaveBeenCalledWith('11111111-1', { role_id: 'rc1', name: 'cliente' });
      expect(ProfileHelper.validateNationalIdUnique).toHaveBeenCalledWith('11111111-1');
      expect(ProfileHelper.validateEmailUnique).toHaveBeenCalledWith('juan@test.com');
      expect(personRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ first_name: 'Juan', national_id: '11111111-1', origin_session_id: 'sess-1' }),
        { transaction: txn }
      );
      expect(userRepository.createWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({ auth_username: 'user_uuid-fixed', person_id: 'p1', role_id: 'rc1', password: 'TempPass123!' }),
        { transaction: txn }
      );
      expect(txn.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        'PERSON_CREATED',
        AUDIT_CTX.adminUserId,
        { roleId: 'rc1', roleName: 'cliente' },
        expect.objectContaining({ entityId: 'u1' })
      );
      expect(result).toEqual({ dto: 'CreateUserDTO', id: 'u1', pwd: 'TempPass123!' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'USUARIO_CREADO_ADMIN' }));
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'PERSON_ADMIN_ACTION' }));
    });

    it('lanza error interno y hace rollback si el rol CLIENTE no está configurado', async () => {
      roleRepository.findByName.mockResolvedValue(null);

      await expect(service.create(userData, AUDIT_CTX)).rejects.toThrow(/no configurado/);
      expect(txn.rollback).toHaveBeenCalled();
      expect(txn.commit).not.toHaveBeenCalled();
    });

    it('hace rollback si falla la creación de registros', async () => {
      personRepository.create.mockRejectedValue(new Error('db down'));

      await expect(service.create(userData, AUDIT_CTX)).rejects.toThrow('db down');
      expect(txn.rollback).toHaveBeenCalled();
    });
  });

  // ============================================================
  // ACTIVAR / DESACTIVAR
  // ============================================================

  describe('activate / deactivate', () => {
    const baseUser = {
      user_id: 'u1',
      is_active: false,
      deleted_at: null,
      person: { first_name: 'Juan', contact: { email: 'juan@test.com' } }
    };

    it('activa una cuenta inactiva: cambia estado, registra cambio, commitea y audita', async () => {
      userRepository.findById.mockResolvedValue({ ...baseUser, is_active: false });

      const result = await service.activate('u1', AUDIT_CTX);

      expect(userRepository.setActiveStatus).toHaveBeenCalledWith('u1', true, { transaction: txn });
      expect(KycSharedUtil.logChange).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'account_status', previousValue: 'inactive', newValue: 'active' }),
        { transaction: txn }
      );
      expect(txn.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PERSON_ACTIVATED', AUDIT_CTX.adminUserId, expect.any(Object), expect.any(Object));
      expect(result).toEqual({ dto: 'ToggleUserStatusDTO', action: 'activate' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'ACCOUNT_ACTIVATED' }));
    });

    it('desactiva una cuenta activa y audita PERSON_DEACTIVATED', async () => {
      userRepository.findById.mockResolvedValue({ ...baseUser, is_active: true });

      const result = await service.deactivate('u1', AUDIT_CTX);

      expect(userRepository.setActiveStatus).toHaveBeenCalledWith('u1', false, { transaction: txn });
      expect(logAudit).toHaveBeenCalledWith('PERSON_DEACTIVATED', AUDIT_CTX.adminUserId, expect.any(Object), expect.any(Object));
      expect(result).toEqual({ dto: 'ToggleUserStatusDTO', action: 'deactivate' });
    });

    it('lanza 404 y rollback si el usuario no existe', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(service.activate('u1', AUDIT_CTX)).rejects.toThrow('Usuario no encontrado');
      expect(txn.rollback).toHaveBeenCalled();
    });

    it('lanza 409 si la cuenta está eliminada', async () => {
      userRepository.findById.mockResolvedValue({ ...baseUser, deleted_at: new Date() });
      await expect(service.activate('u1', AUDIT_CTX)).rejects.toThrow(/eliminada/);
      expect(txn.rollback).toHaveBeenCalled();
    });

    it('lanza 400 si ya está en el estado solicitado', async () => {
      userRepository.findById.mockResolvedValue({ ...baseUser, is_active: true });
      await expect(service.activate('u1', AUDIT_CTX)).rejects.toThrow(/ya está activo/);
      expect(txn.rollback).toHaveBeenCalled();
    });
  });

  // ============================================================
  // RESET PASSWORD
  // ============================================================

  describe('resetPassword', () => {
    const user = { user_id: 'u1', deleted_at: null, person: { first_name: 'Juan', contact: { email: 'juan@test.com' } } };

    it('resetea la contraseña, registra cambio, commitea y audita', async () => {
      userRepository.findById.mockResolvedValue(user);

      const result = await service.resetPassword('u1', AUDIT_CTX);

      expect(userRepository.updatePassword).toHaveBeenCalledWith('u1', 'TempPass123!', { transaction: txn });
      expect(KycSharedUtil.logChange).toHaveBeenCalledWith(expect.objectContaining({ changeType: 'password' }), { transaction: txn });
      expect(logAudit).toHaveBeenCalledWith('PERSON_PASSWORD_RESET', AUDIT_CTX.adminUserId, {}, expect.any(Object));
      expect(result).toEqual({ dto: 'ResetPasswordDTO', id: 'u1' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'PASSWORD_RESET_ADMIN' }));
    });

    it('lanza 404 y rollback si el usuario no existe', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(service.resetPassword('u1', AUDIT_CTX)).rejects.toThrow('Usuario no encontrado');
      expect(txn.rollback).toHaveBeenCalled();
    });
  });

  // ============================================================
  // CAMBIAR EMAIL
  // ============================================================

  describe('changeEmail', () => {
    const user = {
      user_id: 'u1',
      deleted_at: null,
      person: { person_id: 'p1', first_name: 'Juan', contact: { person_contact_id: 'pc1', email: 'old@test.com' } }
    };

    it('cambia el email vía ProfileHelper, commitea, audita y notifica', async () => {
      userRepository.findById.mockResolvedValue(user);
      ProfileHelper.updateEmailLogic.mockResolvedValue({ oldEmail: 'old@test.com', newEmail: 'new@test.com' });

      const result = await service.changeEmail('u1', 'new@test.com', AUDIT_CTX);

      expect(ProfileHelper.updateEmailLogic).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', personId: 'p1', newEmail: 'new@test.com', skipVerificationCheck: true, transaction: txn })
      );
      expect(txn.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        'PERSON_EMAIL_CHANGED',
        AUDIT_CTX.adminUserId,
        { before: { email: 'old@test.com' }, after: { email: 'new@test.com' } },
        expect.any(Object)
      );
      expect(result).toEqual({ dto: 'ChangeEmailDTO', oldE: 'old@test.com', newE: 'new@test.com' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'EMAIL_CHANGED_OLD' }));
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'EMAIL_CHANGED_NEW' }));
    });

    it('lanza 404 y rollback si el usuario no existe', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(service.changeEmail('u1', 'new@test.com', AUDIT_CTX)).rejects.toThrow('Usuario no encontrado');
      expect(txn.rollback).toHaveBeenCalled();
    });
  });

  // ============================================================
  // CAMBIAR NATIONAL ID
  // ============================================================

  describe('changeNationalId', () => {
    const user = {
      user_id: 'u1',
      deleted_at: null,
      person: { person_id: 'p1', national_id: 'old', first_name: 'Juan', contact: { email: 'juan@test.com' } },
      role: { role_id: 'rc1', name: 'cliente' }
    };

    it('cambia el national id, audita PERSON_NATIONAL_ID_CHANGED y notifica', async () => {
      userRepository.findById.mockResolvedValue(user);
      ProfileHelper.updateNationalIdLogic.mockResolvedValue({ oldNationalId: 'old', newNationalId: 'new', unchanged: false });

      const result = await service.changeNationalId('u1', 'new', AUDIT_CTX);

      expect(txn.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        'PERSON_NATIONAL_ID_CHANGED',
        AUDIT_CTX.adminUserId,
        { before: { nationalId: 'old' }, after: { nationalId: 'new' } },
        expect.any(Object)
      );
      expect(result).toEqual({ dto: 'ChangeNationalIdDTO', oldN: 'old', newN: 'new' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'NATIONAL_ID_CHANGED' }));
    });

    it('es idempotente si no hubo cambio: commitea pero no audita ni notifica', async () => {
      userRepository.findById.mockResolvedValue(user);
      ProfileHelper.updateNationalIdLogic.mockResolvedValue({ oldNationalId: 'same', newNationalId: 'same', unchanged: true });

      const result = await service.changeNationalId('u1', 'same', AUDIT_CTX);

      expect(txn.commit).toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalledWith('PERSON_NATIONAL_ID_CHANGED', expect.anything(), expect.anything(), expect.anything());
      expect(result).toEqual({ dto: 'ChangeNationalIdDTO', oldN: 'same', newN: 'same' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // DESHABILITAR MFA
  // ============================================================

  describe('disableMFA', () => {
    const base = {
      user_id: 'u1',
      deleted_at: null,
      person: { first_name: 'Juan', contact: { email: 'juan@test.com' } }
    };

    it('deshabilita TOTP y SMS, limpia secreto, audita y notifica', async () => {
      userRepository.findById.mockResolvedValue({ ...base, totp_enabled: true, sms_mfa_enabled: true, preferred_mfa_method: 'totp' });

      const result = await service.disableMFA('u1', AUDIT_CTX);

      expect(userRepository.update).toHaveBeenCalledWith(
        'u1',
        { preferred_mfa_method: 'none', totp_enabled: false, totp_secret: null, sms_mfa_enabled: false },
        { transaction: txn }
      );
      expect(KycSharedUtil.logChange).toHaveBeenCalledWith(expect.objectContaining({ changeType: 'mfa_status' }), { transaction: txn });
      expect(logAudit).toHaveBeenCalledWith('PERSON_MFA_DISABLED', AUDIT_CTX.adminUserId, expect.any(Object), expect.any(Object));
      expect(result).toEqual({ dto: 'DisableMFADTO', id: 'u1' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'RESET_MFA' }));
    });

    it('lanza 400 si el usuario no tiene MFA habilitado', async () => {
      userRepository.findById.mockResolvedValue({ ...base, totp_enabled: false, sms_mfa_enabled: false });
      await expect(service.disableMFA('u1', AUDIT_CTX)).rejects.toThrow(/no tiene MFA habilitado/);
      expect(txn.rollback).toHaveBeenCalled();
    });
  });

  // ============================================================
  // CAMBIAR ROL
  // ============================================================

  describe('changeRole', () => {
    const user = {
      user_id: 'u1',
      role_id: 'rc1',
      deleted_at: null,
      person: { first_name: 'Juan', contact: { email: 'juan@test.com' } },
      role: { role_id: 'rc1', name: 'CLIENTE', description: 'Cliente base' }
    };

    it('cambia el rol, registra cambio, commitea, audita y notifica', async () => {
      userRepository.findById.mockResolvedValue(user);
      roleRepository.findById.mockResolvedValue({ role_id: 'rc2', name: 'CLIENTE_VERIFICADO', description: 'Verificado' });

      const result = await service.changeRole('u1', 'rc2', AUDIT_CTX);

      expect(userRepository.update).toHaveBeenCalledWith('u1', { role_id: 'rc2' }, { transaction: txn });
      expect(logAudit).toHaveBeenCalledWith(
        'PERSON_ROLE_CHANGED',
        AUDIT_CTX.adminUserId,
        { before: { role: 'CLIENTE' }, after: { role: 'CLIENTE_VERIFICADO' } },
        expect.any(Object)
      );
      expect(result).toEqual({ dto: 'ChangeRoleDTO', oldR: 'CLIENTE', newR: 'CLIENTE_VERIFICADO' });

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'ROL_CHANGE' }));
    });

    // Regresión (fase 4 TS): antes comparaba contra 'admin' en minúsculas (nunca coincidía) y este
    // endpoint podía cambiar el rol de un ADMIN o promover un cliente a interno.
    it('lanza 403 si la cuenta no es de cliente (p. ej. ADMIN)', async () => {
      userRepository.findById.mockResolvedValue({ ...user, role: { role_id: 'ra', name: 'ADMIN' } });
      await expect(service.changeRole('u1', 'rc2', AUDIT_CTX)).rejects.toMatchObject({ statusCode: 403 });
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(txn.rollback).toHaveBeenCalled();
    });

    it('lanza 400 si el rol destino no es de cliente (no promueve a interno)', async () => {
      userRepository.findById.mockResolvedValue(user);
      roleRepository.findById.mockResolvedValue({ role_id: 'rs', name: 'SUPERADMIN' });
      await expect(service.changeRole('u1', 'rs', AUDIT_CTX)).rejects.toMatchObject({ statusCode: 400 });
      expect(userRepository.update).not.toHaveBeenCalled();
      expect(txn.rollback).toHaveBeenCalled();
    });

    it('lanza 404 si el rol destino no existe', async () => {
      userRepository.findById.mockResolvedValue(user);
      roleRepository.findById.mockResolvedValue(null);
      await expect(service.changeRole('u1', 'rZ', AUDIT_CTX)).rejects.toThrow('Rol no encontrado');
      expect(txn.rollback).toHaveBeenCalled();
    });

    it('lanza 400 si el usuario ya tiene el rol', async () => {
      userRepository.findById.mockResolvedValue(user);
      roleRepository.findById.mockResolvedValue({ role_id: 'rc1', name: 'CLIENTE' });
      await expect(service.changeRole('u1', 'rc1', AUDIT_CTX)).rejects.toThrow(/ya tiene este rol/);
      expect(txn.rollback).toHaveBeenCalled();
    });
  });

  // ============================================================
  // ELIMINAR CUENTA (doble aprobación)
  // ============================================================

  describe('deleteAccount', () => {
    beforeEach(() => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });
      userRepository.findById.mockResolvedValue({ user_id: 'u1', deleted_at: null, person: { person_id: 'p1' } });
    });

    it('devuelve pending cuando la doble aprobación queda pendiente (no ejecuta la eliminación)', async () => {
      DualApprovalService.gate.mockResolvedValue({ pending: true, request: { id: 'req-1' } });
      const execSpy = jest.spyOn(service, 'executeDeleteAccount');

      const result = await service.deleteAccount('u1', 'pwd', AUDIT_CTX);

      expect(ProfileHelper.validateCurrentPassword).toHaveBeenCalledWith('hash', 'pwd');
      expect(DualApprovalService.gate).toHaveBeenCalledWith('CLIENT_ACCOUNT_DELETE', expect.objectContaining({ entityType: 'User', entityId: 'u1' }));
      expect(execSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ pending: true, approvalRequest: { id: 'req-1' } });
      execSpy.mockRestore();
    });

    it('ejecuta la eliminación inline cuando la doble aprobación no aplica', async () => {
      DualApprovalService.gate.mockResolvedValue({ pending: false });
      const execSpy = jest.spyOn(service, 'executeDeleteAccount').mockResolvedValue(null);

      const result = await service.deleteAccount('u1', 'pwd', AUDIT_CTX);

      expect(execSpy).toHaveBeenCalledWith('u1', AUDIT_CTX);
      expect(result).toBeNull();
      execSpy.mockRestore();
    });

    it('lanza 404 si el admin (maker) no existe', async () => {
      userRepository.findByUserId.mockResolvedValue(null);
      await expect(service.deleteAccount('u1', 'pwd', AUDIT_CTX)).rejects.toThrow('Administrador no encontrado');
    });

    it('lanza 404 si la cuenta objetivo no existe', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(service.deleteAccount('u1', 'pwd', AUDIT_CTX)).rejects.toThrow('Usuario no encontrado');
    });
  });

  describe('executeDeleteAccount', () => {
    const user = {
      user_id: 'u1',
      username: 'user_x',
      person: { person_id: 'p1', national_id: 'nid', first_name: 'Juan', contact: { person_contact_id: 'pc1', email: 'juan@test.com' } }
    };

    it('ofusca la cuenta vía ProfileHelper, commitea, audita y notifica cuando hay email', async () => {
      userRepository.findById.mockResolvedValue(user);
      ProfileHelper.deleteAccountLogic.mockResolvedValue({ deletedEmail: 'juan@test.com', firstName: 'Juan' });

      const result = await service.executeDeleteAccount('u1', AUDIT_CTX);

      expect(ProfileHelper.deleteAccountLogic).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', personId: 'p1', email: 'juan@test.com', changedByRole: 'admin', transaction: txn })
      );
      expect(txn.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PERSON_ACCOUNT_DELETED', AUDIT_CTX.adminUserId, {}, expect.any(Object));
      expect(result).toBeNull();

      await flushMacrotasks();
      expect(NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(expect.objectContaining({ tipoNotificacion: 'CUENTA_ELIMINADA' }));
    });

    it('hace rollback si falla la ofuscación', async () => {
      userRepository.findById.mockResolvedValue(user);
      ProfileHelper.deleteAccountLogic.mockRejectedValue(new Error('boom'));

      await expect(service.executeDeleteAccount('u1', AUDIT_CTX)).rejects.toThrow('boom');
      expect(txn.rollback).toHaveBeenCalled();
    });
  });
});
