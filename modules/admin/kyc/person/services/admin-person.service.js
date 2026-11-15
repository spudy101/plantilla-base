const { v4: uuidv4 } = require('uuid');
const unitOfWork = require('../../../../../shared/database/unit-of-work');
const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const personRepository = require('../../../../schemas/kyc/person/repositories/person.repository');
const personContactRepository = require('../../../../schemas/kyc/person/repositories/person-contact.repository');
const roleRepository = require('../../../../schemas/kyc/iam/repositories/role.repository');
const KycSharedUtil = require('../../../../schemas/kyc/person/utils/kyc-shared.util');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const requestContext = require('../../../../../shared/utils/request-context.util');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const ProfileHelper = require('../../../../schemas/kyc/person/helpers/profile.helper');
const DualApprovalService = require('../../../../schemas/core/services/dual-approval.service');
const { notifications, RBAC_ROLES, CLIENT_ROLE_NAMES } = require('../../../../../shared/constants');

const {
  UserDTO,
  UserListItemDTO,
  CreateUserDTO,
  ResetPasswordDTO,
  ChangeEmailDTO,
  ChangeNationalIdDTO,
  ToggleUserStatusDTO,
  DisableMFADTO,
  ChangeRoleDTO,
  RoleOptionDTO
} = require('../dtos/admin-person.dto');

/**
 * ============================================================
 * ADMIN PERSON SERVICE
 * ============================================================
 * INCLUDES: se delega a userRepository.findByUserId(id, level)
 * para usar los aliases exactos definidos en los modelos (snake_case).
 *
 * Para consultas puntuales dentro de operaciones (activate, resetPassword,
 * etc.) se sigue usando findById con includes mínimos inline — esos
 * usan solo 'person' y 'contact' que SÍ tienen el alias correcto.
 */

class PersonService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new PersonService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = query.search || null;

    // Construimos los filtros explícitamente para no depender de buildFilters
    // y garantizar que las keys lleguen al repository con el nombre exacto que espera.
    const filters = {};

    // isActive viene como booleano (el validator hace .toBoolean())
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive;
    }

    // El listado de clientes SOLO muestra usuarios con rol CLIENTE o CLIENTE_VERIFICADO
    // (espejo de admin-user.service, que se limita a INTERNAL_ROLE_NAMES). Si llega roleId,
    // se intersecta con los roles cliente; si no queda ninguno válido, se listan todos los
    // roles cliente. Así el endpoint nunca expone usuarios internos ni entidades externas.
    const clientRoleIds = await this._clientRoleIds();
    let roleIds = clientRoleIds;
    if (query.roleId) {
      const requested = String(query.roleId)
        .split(',')
        .map(id => id.trim());
      const valid = requested.filter(id => clientRoleIds.includes(id));
      if (valid.length) {
        roleIds = valid;
      }
    }
    filters.roleIds = roleIds;

    // nationalId se busca por hash exacto (el campo está cifrado con IV aleatorio)
    if (query.nationalId) {
      filters.nationalId = query.nationalId.trim();
    }

    // userId filtra por el PK exacto del usuario
    if (query.userId) {
      filters.userId = query.userId.trim();
    }

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const activeFilters = searchTerm ? { search: searchTerm, ...filters } : filters;

    logAudit(
      'PERSON_LIST_VIEWED',
      adminUserId,
      {
        totalItems: count,
        page: paginationParams.page
      },
      { entityType: 'User', entityTable: 'users' }
    );

    return {
      data: rows.map(u => UserListItemDTO(u)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : null
      })
    };
  }

  /** @private — IDs de los roles de cliente (CLIENTE, CLIENTE_VERIFICADO) */
  async _clientRoleIds() {
    const roles = await this.roleRepository.findByNames(CLIENT_ROLE_NAMES);
    return roles.map(r => r.role_id);
  }

  /**
   * Listado HISTÓRICO de clientes eliminados (read-only). Solo cuentas con deleted_at != null.
   * El listado normal (list) las excluye; estas cuentas son intocables (no se modifican).
   */
  async listDeleted(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = query.search || null;

    const clientRoleIds = await this._clientRoleIds();
    const filters = { roleIds: clientRoleIds, onlyDeleted: true };

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, searchTerm);

    logAudit(
      'PERSON_DELETED_LIST_VIEWED',
      adminUserId,
      { totalItems: count, page: paginationParams.page },
      { entityType: 'User', entityTable: 'users' }
    );

    return {
      data: rows.map(u => UserListItemDTO(u)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order
      })
    };
  }

  /**
   * Catálogo de roles de CLIENTE para poblar el filtro por rol del listado de clientes.
   * Devuelve solo los roles cliente (CLIENTE / CLIENTE_VERIFICADO) — los mismos que filtra `list`.
   * Evita que el front ofrezca todos los roles del sistema en este listado.
   */
  async listRoleOptions(adminUserId) {
    const roles = await this.roleRepository.findByNames(CLIENT_ROLE_NAMES);
    logAudit(
      'PERSON_ROLE_OPTIONS_VIEWED',
      adminUserId,
      { totalItems: roles.length },
      { entityType: 'RbacRole', entityTable: 'roles' }
    );
    return roles.map(RoleOptionDTO);
  }

  /**
   * @private — Bloquea toda operación de escritura sobre una cuenta eliminada (deleted_at != null).
   * Las cuentas eliminadas son intocables: no se reactivan, no cambian de rol, no se editan, etc.
   */
  _assertNotDeleted(user) {
    if (user?.deleted_at) {
      throw AppError.conflict('La cuenta está eliminada y no admite modificaciones', { code: 'USER_DELETED' });
    }
  }

  async getById(userId, adminUserId) {
    const user = await this.userRepository.findByUserId(userId, 'full');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }

    logAudit(
      'PERSON_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return UserDTO(user);
  }

  // ============================================================
  // CREACIÓN
  // ============================================================

  async create(userData, auditContext) {
    const transaction = await this.unitOfWork.begin();
    let transactionFinished = false;

    try {
      const role = await this.roleRepository.findByName(RBAC_ROLES.CLIENTE);
      if (!role) {
        throw AppError.internal(`Rol ${RBAC_ROLES.CLIENTE} no configurado. Ejecuta el seeder RBAC.`);
      }

      KycSharedUtil.validateNationalIdByRole(userData.nationalId, role);
      await ProfileHelper.validateNationalIdUnique(userData.nationalId);
      await ProfileHelper.validateEmailUnique(userData.email);

      const temporaryPassword = KycSharedUtil.generateSecurePassword();
      const authUsername = `user_${uuidv4()}`;

      const user = await this._createDbRecords(userData, authUsername, temporaryPassword, role.role_id, transaction);

      await transaction.commit();
      transactionFinished = true;

      logAudit(
        'PERSON_CREATED',
        auditContext.adminUserId,
        {
          roleId: role.role_id,
          roleName: role.name
        },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
      );

      setImmediate(() => this._sendCreateNotifications(userData, user, auditContext, temporaryPassword));

      const fullUser = await this.userRepository.findByUserId(user.user_id, 'full');
      return CreateUserDTO(fullUser, temporaryPassword);
    } catch (error) {
      if (!transactionFinished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /** @private */
  async _createDbRecords(userData, authUsername, temporaryPassword, roleId, transaction) {
    const person = await this.personRepository.create(
      {
        first_name: userData.firstName,
        middle_name: userData.middleName || null,
        last_name: userData.lastName,
        second_last_name: userData.secondLastName || null,
        national_id: userData.nationalId,
        birth_date: userData.birthDate || null,
        gender_id: userData.genderId || null,
        country_id: userData.countryId || null,
        document_type_id: userData.documentTypeId || null,
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    await this.personContactRepository.create(
      {
        person_id: person.person_id,
        email: userData.email,
        email_verified_at: new Date(),
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    return this.userRepository.create(
      {
        username: authUsername,
        auth_username: authUsername,
        person_id: person.person_id,
        role_id: roleId,
        password: temporaryPassword
      },
      { transaction }
    );
  }

  /** @private */
  _sendCreateNotifications(userData, user, auditContext, temporaryPassword) {
    this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'USUARIO_CREADO_ADMIN',
      userId: user.user_id,
      relatedEntity: null,
      metadata: {
        nombre: userData.firstName,
        email: userData.email,
        passwordTemporal: temporaryPassword,
        logoUrl: notifications.ses.logoUrl
      }
    }).catch(err => logger.warn('Error sending welcome notification', { error: err.message }));

    this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'PERSON_ADMIN_ACTION',
      userId: auditContext.adminUserId,
      relatedEntity: null,
      metadata: {
        nombre: auditContext.adminFirstName,
        accion: 'crear',
        userId: user.user_id,
        logoUrl: notifications.ses.logoUrl
      }
    }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
  }

  // ============================================================
  // ACTIVAR / DESACTIVAR
  // ============================================================

  activate(userId, auditContext) {
    return this._toggleStatus(userId, 'activate', auditContext);
  }

  deactivate(userId, auditContext) {
    return this._toggleStatus(userId, 'deactivate', auditContext);
  }

  async _toggleStatus(userId, action, auditContext) {
    const transaction = await this.unitOfWork.begin();
    const isActivating = action === 'activate';

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          }
        ],
        attributes: ['user_id', 'is_active', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      this._assertNotDeleted(user);

      if (user.is_active === isActivating) {
        throw AppError.badRequest(`El usuario ya está ${isActivating ? 'activo' : 'inactivo'}`);
      }

      await this.userRepository.setActiveStatus(userId, isActivating, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'account_status',
          previousValue: isActivating ? 'inactive' : 'active',
          newValue: isActivating ? 'active' : 'inactive',
          changeReason: `Usuario ${isActivating ? 'activado' : 'desactivado'} por administrador`,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        isActivating ? 'PERSON_ACTIVATED' : 'PERSON_DEACTIVATED',
        auditContext.adminUserId,
        { before: { isActive: !isActivating }, after: { isActive: isActivating } },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const affectedNombre = user.person?.first_name || 'Usuario';
      const affectedEmail = user.person?.contact?.email;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: isActivating ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
          userId: userId,
          relatedEntity: null,
          metadata: {
            nombre: affectedNombre,
            email: affectedEmail,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending status notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: action,
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      user.is_active = isActivating;
      return ToggleUserStatusDTO(user, action);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ============================================================
  // RESET PASSWORD
  // ============================================================

  async resetPassword(userId, auditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          }
        ],
        attributes: ['user_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      this._assertNotDeleted(user);

      const temporaryPassword = KycSharedUtil.generateSecurePassword();

      await this.userRepository.updatePassword(userId, temporaryPassword, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'password',
          previousValue: 'hidden',
          newValue: 'hidden',
          changeReason: 'Contraseña reseteada por administrador',
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        'PERSON_PASSWORD_RESET',
        auditContext.adminUserId,
        {},
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const affectedNombre = user.person?.first_name || 'Usuario';
      const affectedEmail = user.person?.contact?.email;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PASSWORD_RESET_ADMIN',
          userId: user.user_id,
          relatedEntity: null,
          metadata: {
            nombre: affectedNombre,
            email: affectedEmail,
            passwordTemporal: temporaryPassword,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending password reset notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'reset_password',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      return ResetPasswordDTO(user);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // CAMBIAR EMAIL
  // ============================================================

  async changeEmail(userId, newEmail, auditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['person_id', 'first_name'],
            include: [{ association: 'contact', attributes: ['person_contact_id', 'email'] }]
          }
        ],
        attributes: ['user_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      this._assertNotDeleted(user);

      const { oldEmail, newEmail: updatedEmail } = await ProfileHelper.updateEmailLogic({
        userId,
        personId: user.person.person_id,
        newEmail,
        changedByUserId: auditContext.adminUserId,
        changedByRole: 'admin',
        changeReason: 'Email actualizado por administrador',
        auditContext: { ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent },
        transaction,
        skipVerificationCheck: true
      });

      await transaction.commit();

      logAudit(
        'PERSON_EMAIL_CHANGED',
        auditContext.adminUserId,
        {
          before: { email: oldEmail },
          after: { email: updatedEmail }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const firstName = user.person?.first_name;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacionDirecta({
          tipoNotificacion: 'EMAIL_CHANGED_OLD',
          email: oldEmail,
          metadata: { nombre: firstName, email: oldEmail, logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error sending old email notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'EMAIL_CHANGED_NEW',
          userId: user.user_id,
          relatedEntity: null,
          metadata: { nombre: firstName, email: updatedEmail, logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error sending new email notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'cambiar_email',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      return ChangeEmailDTO(user, oldEmail, updatedEmail);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // CAMBIAR NATIONAL ID
  // ============================================================

  async changeNationalId(userId, newNationalId, auditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['person_id', 'national_id', 'first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          },
          { association: 'role', attributes: ['role_id', 'name'] }
        ],
        attributes: ['user_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      this._assertNotDeleted(user);

      const {
        oldNationalId,
        newNationalId: updated,
        unchanged
      } = await ProfileHelper.updateNationalIdLogic({
        userId,
        personId: user.person.person_id,
        newNationalId,
        role: user.role,
        changedByUserId: auditContext.adminUserId,
        changedByRole: 'admin',
        changeReason: 'National ID actualizado por administrador',
        auditContext: { ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent },
        transaction
      });

      await transaction.commit();

      // Idempotente: el valor enviado es igual al actual — no hubo cambio real,
      // se omite auditoría, re-screening SARLAFT y notificaciones; se responde OK.
      if (unchanged) {
        return ChangeNationalIdDTO(user, oldNationalId, updated);
      }

      logAudit(
        'PERSON_NATIONAL_ID_CHANGED',
        auditContext.adminUserId,
        {
          before: { nationalId: oldNationalId },
          after: { nationalId: updated }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const affectedEmail = user.person?.contact?.email;
      const firstName = user.person?.first_name;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'NATIONAL_ID_CHANGED',
          userId: user.user_id,
          relatedEntity: null,
          metadata: { nombre: firstName, email: affectedEmail, logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error sending national id notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'cambiar_national_id',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      return ChangeNationalIdDTO(user, oldNationalId, updated);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // DESHABILITAR MFA
  // ============================================================

  async disableMFA(userId, auditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          }
        ],
        attributes: ['user_id', 'totp_enabled', 'sms_mfa_enabled', 'preferred_mfa_method', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      this._assertNotDeleted(user);
      if (!user.totp_enabled && !user.sms_mfa_enabled) {
        throw AppError.badRequest('El usuario no tiene MFA habilitado');
      }

      const updates = { preferred_mfa_method: 'none' };
      if (user.totp_enabled) {
        updates.totp_enabled = false;
        updates.totp_secret = null;
      }
      if (user.sms_mfa_enabled) {
        updates.sms_mfa_enabled = false;
      }

      await this.userRepository.update(userId, updates, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'MFA desactivado por administrador',
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        'PERSON_MFA_DISABLED',
        auditContext.adminUserId,
        {
          before: { mfaEnabled: true },
          after: { mfaEnabled: false }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      this._notifyMFADisabled(user, userId, auditContext);

      user.totp_enabled = false;
      user.sms_mfa_enabled = false;
      user.preferred_mfa_method = 'none';
      return DisableMFADTO(user);
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /** @private Dispara en background las notificaciones de desactivación de MFA. */
  _notifyMFADisabled(user, userId, auditContext) {
    const affectedNombre = user.person?.first_name || 'Usuario';
    const affectedEmail = user.person?.contact?.email;

    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'RESET_MFA',
        userId: user.user_id,
        relatedEntity: null,
        metadata: {
          nombre: affectedNombre,
          email: affectedEmail,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error sending MFA reset notification', { error: err.message }));

      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'PERSON_ADMIN_ACTION',
        userId: auditContext.adminUserId,
        relatedEntity: null,
        metadata: {
          nombre: auditContext.adminFirstName,
          accion: 'deshabilitar_mfa',
          userId: userId,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
    });
  }

  // ============================================================
  // CAMBIAR ROL
  // ============================================================

  async changeRole(userId, newRoleId, auditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['first_name'],
            include: [{ association: 'contact', attributes: ['email'] }]
          },
          { association: 'role', attributes: ['role_id', 'name', 'description'] }
        ],
        attributes: ['user_id', 'role_id', 'deleted_at']
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }
      this._assertNotDeleted(user);

      if (user.role.name === 'admin') {
        throw AppError.badRequest('No se puede cambiar el rol de un administrador');
      }

      const newRole = await this.roleRepository.findById(newRoleId);
      if (!newRole) {
        throw AppError.notFound('Rol no encontrado');
      }

      if (user.role_id === newRoleId) {
        throw AppError.badRequest('El usuario ya tiene este rol');
      }

      const oldRole = user.role;

      await this.userRepository.update(userId, { role_id: newRoleId }, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'role',
          previousValue: oldRole.name,
          newValue: newRole.name,
          changeReason: 'Rol actualizado por administrador',
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        { transaction }
      );

      await transaction.commit();

      logAudit(
        'PERSON_ROLE_CHANGED',
        auditContext.adminUserId,
        {
          before: { role: oldRole.name },
          after: { role: newRole.name }
        },
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const affectedNombre = user.person?.first_name || 'Usuario';
      const affectedEmail = user.person?.contact?.email;

      setImmediate(() => {
        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'ROL_CHANGE',
          userId: user.user_id,
          relatedEntity: null,
          metadata: {
            nombre: affectedNombre,
            email: affectedEmail,
            nuevo_rol: newRole.name,
            permisos_descripcion: newRole.description,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending role change notification', { error: err.message }));

        this.NotificationUtil.crearNotificacion({
          tipoNotificacion: 'PERSON_ADMIN_ACTION',
          userId: auditContext.adminUserId,
          relatedEntity: null,
          metadata: {
            nombre: auditContext.adminFirstName,
            accion: 'cambiar_rol',
            userId: userId,
            logoUrl: notifications.ses.logoUrl
          }
        }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
      });

      user.role = newRole;
      return ChangeRoleDTO(user, oldRole, newRole);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ============================================================
  // ELIMINAR CUENTA
  // ============================================================

  async deleteAccount(userId, currentPassword, auditContext) {
    // Re-autenticación del admin (maker) ANTES de gatear la doble aprobación.
    const adminUser = await this.userRepository.findByUserId(auditContext.adminUserId, 'minimal');
    if (!adminUser) {
      throw AppError.notFound('Administrador no encontrado');
    }
    await ProfileHelper.validateCurrentPassword(adminUser.password_hash, currentPassword);

    // La cuenta objetivo debe existir y no estar ya eliminada (no se re-elimina).
    const target = await this.userRepository.findById(userId, {
      attributes: ['user_id', 'deleted_at'],
      include: [{ association: 'person', attributes: ['person_id'] }]
    });
    if (!target) {
      throw AppError.notFound('Usuario no encontrado');
    }
    this._assertNotDeleted(target);

    // Doble aprobación (maker-checker). Pendiente → 202 y la eliminación corre luego desde el
    // handler IoC (executeDeleteAccount). Flag off / super_admin → se ejecuta inline.
    const gate = await this.DualApprovalService.gate('CLIENT_ACCOUNT_DELETE', {
      entityType: 'User',
      entityId: userId,
      payload: { userId },
      ctx: auditContext
    });
    if (gate.pending) {
      return { pending: true, approvalRequest: gate.request };
    }

    await this.executeDeleteAccount(userId, auditContext);
    return null;
  }

  /**
   * Ejecuta la eliminación REAL de la cuenta (ofuscación en BD + notificación).
   * Punto de entrada del handler de doble aprobación y de la ejecución directa.
   */
  async executeDeleteAccount(userId, auditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['person_id', 'national_id', 'first_name'],
            include: [{ association: 'contact', attributes: ['person_contact_id', 'email'] }]
          }
        ],
        attributes: ['user_id', 'username'],
        transaction
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }

      const result = await ProfileHelper.deleteAccountLogic({
        userId,
        personId: user.person.person_id,
        nationalId: user.person.national_id,
        email: user.person.contact.email,
        username: user.username,
        firstName: user.person.first_name,
        changedByUserId: auditContext.adminUserId,
        changedByRole: 'admin',
        changeReason: 'Cuenta eliminada por administrador',
        auditContext: { ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent },
        transaction
      });

      await transaction.commit();

      logAudit(
        'PERSON_ACCOUNT_DELETED',
        auditContext.adminUserId,
        {},
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      if (result.deletedEmail) {
        setImmediate(() => {
          this.NotificationUtil.crearNotificacionDirecta({
            tipoNotificacion: 'CUENTA_ELIMINADA',
            email: result.deletedEmail,
            metadata: {
              nombre: result.firstName,
              email: result.deletedEmail,
              logoUrl: notifications.ses.logoUrl
            }
          }).catch(err =>
            logger.warn('Error sending account deletion notification', {
              userId,
              error: err.message
            })
          );

          this.NotificationUtil.crearNotificacion({
            tipoNotificacion: 'PERSON_ADMIN_ACTION',
            userId: auditContext.adminUserId,
            relatedEntity: null,
            metadata: {
              nombre: auditContext.adminFirstName,
              accion: 'eliminar_cuenta',
              userId: userId,
              logoUrl: notifications.ses.logoUrl
            }
          }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
        });
      }

      return null;
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
        logger.info('Transaction rolled back', { userId, adminId: auditContext.adminUserId });
      }
      throw error;
    }
  }
}

module.exports = new PersonService();
module.exports.PersonService = PersonService;
