// modules/admin/users/services/admin-user.service.js
//
// Gestión de USUARIOS INTERNOS (empleados de Base Project) — RF-ADM-01.
// Separado de la gestión de clientes (admin-person, dominio KYC).
//
// Reutiliza los repositorios y helpers compartidos (no duplica acceso a datos):
//   - InternalUserHelper        → creación en BD con rollback
//   - KycSharedUtil.logChange   → auditoría en user_change_logs (criterio #4)
//   - ProfileHelper.validate*   → unicidad de email / national_id
//   - user/role/session/change-log repositories

const { Op } = require('sequelize');

const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const roleRepository = require('../../../../schemas/kyc/iam/repositories/role.repository');
const documentTypeRepository = require('../../../../schemas/kyc/maintainers/repositories/document-type.repository');
const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const userChangeLogRepository = require('../../../../schemas/records/audit/repositories/user-change-log.repository');
const InternalUserHelper = require('../../../../schemas/kyc/iam/helpers/internal-user.helper');
const ProfileHelper = require('../../../../schemas/kyc/person/helpers/profile.helper');
const KycSharedUtil = require('../../../../schemas/kyc/person/utils/kyc-shared.util');
const TokenBlacklistUtil = require('../../../../../shared/utils/token-blacklist.util');
const { sequelize } = require('../../../../../shared/models');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const { INTERNAL_ROLE_NAMES, SUPERADMIN_ROLE_NAMES, RBAC_ROLES, notifications } = require('../../../../../shared/constants');
const NotificationCreationService = require('../../../../schemas/notification/services/notification-creation.service');
const DualApprovalService = require('../../../../schemas/core/services/dual-approval.service');
const {
  InternalUserDTO,
  InternalUserListDTO,
  InternalUserCreatedDTO,
  UserSessionDTO,
  UserChangeLogDTO,
  RoleOptionDTO
} = require('../dtos/admin-user.dto');
const { buildAuditDiff } = require('../../../../../shared/utils/audit-diff.util');

class AdminUserService {
  // ============================================================
  // LIST / DETAIL
  // ============================================================

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    // El listado nunca expone superadmins (se excluyen de los roles visibles).
    const internalRoleIds = await this._listableInternalRoleIds();

    // Filtro por rol: si viene roleId validamos que sea interno (y no superadmin)
    // antes de usarlo; si no, listamos todos los roles internos visibles.
    const roleIds = query.roleId && internalRoleIds.includes(query.roleId) ? [query.roleId] : internalRoleIds;

    // Excluimos al propio solicitante: un admin no se ve a sí mismo en el listado.
    const filters = { roleIds, excludeUserId: adminUserId };
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive;
    }

    const { rows, count } = await userRepository.findAllPaginated(filters, paginationParams, query.search || null);

    await DualApprovalService.annotatePending('User', rows);

    logAudit(
      'INTERNAL_USER_LIST_VIEWED',
      adminUserId,
      { totalItems: count },
      { entityType: 'InternalUser', entityTable: 'users' }
    );

    const activeFilters = {};
    if (query.roleId) {
      activeFilters.roleId = query.roleId;
    }
    if (query.isActive !== undefined) {
      activeFilters.isActive = query.isActive;
    }

    return {
      data: rows.map(InternalUserListDTO),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }

  /**
   * Listado HISTÓRICO de usuarios internos ELIMINADOS (read-only). Solo cuentas con
   * deleted_at != null. El listado normal (list) las excluye; son intocables.
   */
  async listDeleted(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const internalRoleIds = await this._listableInternalRoleIds();
    const roleIds = query.roleId && internalRoleIds.includes(query.roleId) ? [query.roleId] : internalRoleIds;

    const filters = { roleIds, onlyDeleted: true };
    const { rows, count } = await userRepository.findAllPaginated(filters, paginationParams, query.search || null);

    logAudit(
      'INTERNAL_USER_DELETED_LIST_VIEWED',
      adminUserId,
      { totalItems: count },
      { entityType: 'InternalUser', entityTable: 'users' }
    );

    return {
      data: rows.map(InternalUserListDTO),
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
   * Catálogo de roles INTERNOS para poblar el filtro por rol del listado de usuarios internos.
   * Devuelve solo los roles listables (internos, sin superadmin) — los mismos que filtra `list`.
   * Evita que el front ofrezca roles de cliente (o superadmin) en este listado.
   */
  async listRoleOptions(adminUserId) {
    const roles = await roleRepository.findAll({
      name: { [Op.in]: INTERNAL_ROLE_NAMES, [Op.notIn]: SUPERADMIN_ROLE_NAMES }
    });
    logAudit(
      'INTERNAL_USER_ROLE_OPTIONS_VIEWED',
      adminUserId,
      { totalItems: roles.length },
      { entityType: 'RbacRole', entityTable: 'roles' }
    );
    return roles.map(RoleOptionDTO);
  }

  async getById(userId, adminUserId) {
    const user = await this._getInternalUserOrFail(userId);
    logAudit(
      'INTERNAL_USER_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
    );
    return InternalUserDTO(user);
  }

  // ============================================================
  // CREATE
  // ============================================================

  async create(data, auditCtx) {
    // Mínimo privilegio (criterio #5, RF-ADM-01): todo usuario interno nace como
    // AUDITOR — solo lectura. El admin sube el rol real después con PATCH /:userId/role.
    const role = await roleRepository.findByName(RBAC_ROLES.AUDITOR);
    if (!role) {
      throw AppError.internal(`Rol ${RBAC_ROLES.AUDITOR} no encontrado. Ejecuta el seeder RBAC.`);
    }

    // Los usuarios internos no tienen documento real: siempre llevan el tipo SYSTEM
    // ("Usuario de Sistema") para que su national_id sea un identificador de sistema.
    const systemDocumentType = await documentTypeRepository.findByCode('SYSTEM');
    if (!systemDocumentType) {
      throw AppError.internal("Tipo de documento 'SYSTEM' no encontrado. Ejecuta el seeder de tipos de documento.");
    }

    await ProfileHelper.validateNationalIdUnique(data.nationalId);
    await ProfileHelper.validateEmailUnique(data.email);

    const temporaryPassword = KycSharedUtil.generateSecurePassword();

    const { user } = await InternalUserHelper.createInternalUser({
      email: data.email,
      password: temporaryPassword,
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      secondLastName: data.secondLastName,
      nationalId: data.nationalId,
      documentTypeId: systemDocumentType.document_type_id,
      role
    });

    logAudit(
      'INTERNAL_USER_CREATED',
      auditCtx.adminUserId,
      {
        roleId: role.role_id,
        roleName: role.name
      },
      { entityId: user.user_id, entityType: 'InternalUser', entityTable: 'users' }
    );

    setImmediate(() => {
      const { logoUrl } = notifications.ses;
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_INTERNAL_USER_CREATED',
        userId: user.user_id,
        metadata: { nombre: data.firstName, email: data.email, passwordTemporal: temporaryPassword, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_INTERNAL_USER_CREATED', { error: err.message }));
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_ADMIN_USER_CREATED',
        userId: auditCtx.adminUserId,
        relatedEntity: user.user_id,
        metadata: { nombreUsuario: `${data.firstName} ${data.lastName || ''}`.trim(), email: data.email, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_ADMIN_USER_CREATED', { error: err.message }));
    });

    const fullUser = await userRepository.findByUserId(user.user_id, 'basic');
    // La contraseña temporal se devuelve SOLO en esta respuesta.
    return InternalUserCreatedDTO(fullUser, temporaryPassword);
  }

  // ============================================================
  // UPDATE (datos básicos)
  // ============================================================

  async update(userId, data, auditCtx) {
    const user = await this._getInternalUserOrFail(userId);
    this._assertNotDeleted(user);

    const { person } = user;

    const { before, after } = buildAuditDiff(person, data, {
      firstName: 'first_name',
      middleName: 'middle_name',
      lastName: 'last_name',
      secondLastName: 'second_last_name'
    });

    await person.update({
      first_name: data.firstName ?? person.first_name,
      middle_name: data.middleName ?? person.middle_name,
      last_name: data.lastName ?? person.last_name,
      second_last_name: data.secondLastName ?? person.second_last_name
    });

    logAudit(
      'INTERNAL_USER_UPDATED',
      auditCtx.adminUserId,
      { before, after },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'persons' }
    );

    const fresh = await userRepository.findByUserId(userId, 'basic');
    return InternalUserDTO(fresh);
  }

  // ============================================================
  // CHANGE ROLE (auditado — criterio #4)
  // ============================================================

  async changeRole(userId, newRoleId, auditCtx) {
    const user = await this._getInternalUserOrFail(userId);
    this._assertNotDeleted(user);

    // Protección: el rol de un superadministrador no se puede modificar.
    if (this._isSuperAdminRole(user.role?.name)) {
      throw AppError.forbidden('No se puede cambiar el rol de un super administrador');
    }

    const newRole = await this._getInternalRoleOrFail(newRoleId);
    if (user.role_id === newRoleId) {
      throw AppError.badRequest('El usuario ya tiene este rol');
    }

    // Doble aprobación (maker-checker). Las validaciones de arriba corren ANTES del gate, así una
    // operación inviable (target eliminado/superadmin, rol igual, rol no interno) nunca crea un
    // approval_request. Pendiente → 202; flag off / super_admin maker → inline. El handler IoC
    // reanuda con executeChangeRole (no re-gatea). Se pasan las entidades ya cargadas para no
    // duplicar queries en el camino inline.
    const gate = await DualApprovalService.gate('RBAC_ROLE_CHANGE', {
      entityType: 'User',
      entityId: userId,
      payload: { userId, roleId: newRoleId },
      ctx: auditCtx
    });
    if (gate.pending) {
      return { pending: true, approvalRequest: gate.request };
    }

    return this.executeChangeRole(userId, newRoleId, auditCtx, { user, newRole });
  }

  /**
   * Ejecuta el cambio de rol REAL (update + bitácora + invalidación de sesiones + notificación).
   * Punto de entrada del handler de doble aprobación (reanudación) y de la ejecución directa.
   * @param {Object} [prefetched] — { user, newRole } ya cargados (camino inline); el handler IoC
   *        los omite y se recargan por id (idempotente).
   */
  async executeChangeRole(userId, newRoleId, auditCtx, prefetched = {}) {
    const user = prefetched.user ?? (await this._getInternalUserOrFail(userId));
    const newRole = prefetched.newRole ?? (await this._getInternalRoleOrFail(newRoleId));

    const oldRoleName = user.role?.name || null;

    await userRepository.update(userId, { role_id: newRoleId });

    await KycSharedUtil.logChange({
      userId,
      changedByUserId: auditCtx.adminUserId,
      changedByRole: 'admin',
      changeType: 'role',
      previousValue: oldRoleName,
      newValue: newRole.name,
      changeReason: 'Rol actualizado por administrador',
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent
    });

    // El cambio de rol invalida las sesiones activas para que el nuevo rol surta
    // efecto de inmediato (los JWT vigentes llevan el roleName anterior).
    await this._invalidateSessions(userId, 'role_changed');

    logAudit(
      'INTERNAL_USER_ROLE_CHANGED',
      auditCtx.adminUserId,
      {
        before: { role: oldRoleName },
        after: { role: newRole.name }
      },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
    );

    const empleadoNombreRol = [user.person?.first_name, user.person?.last_name].filter(Boolean).join(' ') || 'Usuario';
    setImmediate(() => {
      const { logoUrl } = notifications.ses;
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_INTERNAL_USER_ROLE_CHANGED',
        userId,
        relatedEntity: userId,
        metadata: { nombre: empleadoNombreRol, rolAnterior: oldRoleName || '—', nuevoRol: newRole.name, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_INTERNAL_USER_ROLE_CHANGED', { error: err.message }));
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_ADMIN_ROLE_CHANGED',
        userId: auditCtx.adminUserId,
        relatedEntity: userId,
        metadata: { nombreUsuario: empleadoNombreRol, rolAnterior: oldRoleName || '—', nuevoRol: newRole.name, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_ADMIN_ROLE_CHANGED', { error: err.message }));
    });

    const fresh = await userRepository.findByUserId(userId, 'basic');
    return InternalUserDTO(fresh);
  }

  // ============================================================
  // STATUS (activar / desactivar — auditado)
  // ============================================================

  async setStatus(userId, isActive, auditCtx) {
    const user = await this._getInternalUserOrFail(userId);
    this._assertNotDeleted(user);

    // Protección: un superadministrador no se puede desactivar.
    if (!isActive && this._isSuperAdminRole(user.role?.name)) {
      throw AppError.forbidden('No se puede desactivar a un super administrador');
    }

    if (user.is_active === isActive) {
      throw AppError.badRequest(`El usuario ya está ${isActive ? 'activo' : 'inactivo'}`);
    }

    await userRepository.setActiveStatus(userId, isActive);

    await KycSharedUtil.logChange({
      userId,
      changedByUserId: auditCtx.adminUserId,
      changedByRole: 'admin',
      changeType: 'account_status',
      previousValue: user.is_active ? 'active' : 'inactive',
      newValue: isActive ? 'active' : 'inactive',
      changeReason: 'Estado de cuenta actualizado por administrador',
      ipAddress: auditCtx.ipAddress,
      userAgent: auditCtx.userAgent
    });

    // Al desactivar, cerramos sus sesiones para forzar el cierre inmediato.
    if (!isActive) {
      await this._invalidateSessions(userId, 'account_deactivated');
    }

    logAudit(
      isActive ? 'INTERNAL_USER_ACTIVATED' : 'INTERNAL_USER_DEACTIVATED',
      auditCtx.adminUserId,
      { before: { isActive: !isActive }, after: { isActive } },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
    );

    const empleadoNombreStatus = [user.person?.first_name, user.person?.last_name].filter(Boolean).join(' ') || 'Usuario';
    const accionStatus = isActive ? 'activado' : 'desactivado';
    setImmediate(() => {
      const { logoUrl } = notifications.ses;
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: isActive ? 'IAM_INTERNAL_USER_ACTIVATED' : 'IAM_INTERNAL_USER_DEACTIVATED',
        userId,
        relatedEntity: userId,
        metadata: { nombre: empleadoNombreStatus, logoUrl }
      }).catch(err =>
        logger.warn(`Error enviando IAM_INTERNAL_USER_${isActive ? 'ACTIVATED' : 'DEACTIVATED'}`, { error: err.message })
      );
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_ADMIN_STATUS_CHANGED',
        userId: auditCtx.adminUserId,
        relatedEntity: userId,
        metadata: { nombreUsuario: empleadoNombreStatus, accion: accionStatus, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_ADMIN_STATUS_CHANGED', { error: err.message }));
    });

    const fresh = await userRepository.findByUserId(userId, 'basic');
    return InternalUserDTO(fresh);
  }

  // ============================================================
  // ELIMINAR usuario interno (ofuscación irreversible + doble aprobación)
  // ============================================================

  async deleteUser(userId, currentPassword, auditCtx) {
    // Re-autenticación del admin (maker) ANTES de gatear la doble aprobación.
    const adminUser = await userRepository.findByUserId(auditCtx.adminUserId, 'minimal');
    if (!adminUser) {
      throw AppError.notFound('Administrador no encontrado');
    }
    await ProfileHelper.validateCurrentPassword(adminUser.password_hash, currentPassword);

    // Debe ser un interno existente, no superadmin y no estar ya eliminado.
    const user = await this._getInternalUserOrFail(userId);
    this._assertNotDeleted(user);
    if (this._isSuperAdminRole(user.role?.name)) {
      throw AppError.forbidden('No se puede eliminar a un super administrador');
    }

    // Doble aprobación (maker-checker). Pendiente → 202 y la eliminación corre luego desde el
    // handler IoC (executeDeleteUser). Flag off / super_admin → se ejecuta inline.
    const gate = await DualApprovalService.gate('INTERNAL_USER_DELETE', {
      entityType: 'User',
      entityId: userId,
      payload: { userId },
      ctx: auditCtx
    });
    if (gate.pending) {
      return { pending: true, approvalRequest: gate.request };
    }

    await this.executeDeleteUser(userId, auditCtx);
    return { userId, deleted: true };
  }

  /**
   * Ejecuta la eliminación REAL del usuario interno (ofuscación en BD + cierre de
   * sesiones). Punto de entrada del handler de doble aprobación y de la ejecución directa.
   */
  async executeDeleteUser(userId, auditCtx) {
    const transaction = await sequelize.transaction();

    try {
      const user = await userRepository.findById(userId, {
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

      await ProfileHelper.deleteAccountLogic({
        userId,
        personId: user.person.person_id,
        nationalId: user.person.national_id,
        email: user.person.contact?.email,
        username: user.username,
        firstName: user.person.first_name,
        changedByUserId: auditCtx.adminUserId,
        changedByRole: 'admin',
        changeReason: 'Usuario interno eliminado por administrador',
        auditContext: { ipAddress: auditCtx.ipAddress, userAgent: auditCtx.userAgent },
        transaction
      });

      await transaction.commit();

      // Tras el commit: cierra sesiones.
      await this._invalidateSessions(userId, 'account_deleted');

      logAudit(
        'INTERNAL_USER_DELETED',
        auditCtx.adminUserId,
        {},
        { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
      );

      const empleadoNombre = user.person?.first_name || 'Usuario';
      setImmediate(() => {
        NotificationCreationService.crearNotificacion({
          tipoNotificacion: 'IAM_ADMIN_STATUS_CHANGED',
          userId: auditCtx.adminUserId,
          relatedEntity: userId,
          metadata: { nombreUsuario: empleadoNombre, accion: 'eliminado', logoUrl: notifications.ses.logoUrl }
        }).catch(err => logger.warn('Error enviando IAM_ADMIN_STATUS_CHANGED (eliminación)', { error: err.message }));
      });

      return null;
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  // ============================================================
  // SESIONES del usuario interno
  // ============================================================

  async listSessions(userId, adminUserId) {
    await this._getInternalUserOrFail(userId);
    const sessions = await userSessionRepository.findActiveByUser(userId);
    logAudit(
      'INTERNAL_USER_SESSIONS_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
    );
    return sessions.map(UserSessionDTO);
  }

  async closeSessions(userId, auditCtx) {
    const user = await this._getInternalUserOrFail(userId);
    this._assertNotDeleted(user);
    await this._invalidateSessions(userId, 'closed_by_admin');
    logAudit(
      'INTERNAL_USER_SESSIONS_CLOSED',
      auditCtx.adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
    );
    const empleadoNombreSesion = [user.person?.first_name, user.person?.last_name].filter(Boolean).join(' ') || 'Usuario';
    setImmediate(() => {
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_INTERNAL_USER_SESSIONS_CLOSED',
        userId,
        relatedEntity: userId,
        metadata: { nombre: empleadoNombreSesion }
      }).catch(err => logger.warn('Error enviando IAM_INTERNAL_USER_SESSIONS_CLOSED', { error: err.message }));
    });
    return { userId, closed: true };
  }

  // ============================================================
  // BITÁCORA de cambios del usuario interno (auditoría)
  // ============================================================

  async listChangeLogs(userId, query, adminUserId) {
    await this._getInternalUserOrFail(userId);
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const { rows, count } = await userChangeLogRepository.findByUserId(userId, paginationParams);

    logAudit(
      'INTERNAL_USER_CHANGE_LOGS_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
    );

    return {
      data: rows.map(UserChangeLogDTO),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order
      })
    };
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /**
   * @private — IDs de los roles internos visibles en el listado.
   * Excluye los roles de superadministrador: nunca se listan usuarios internos
   * con rol superadmin en la gestión de usuarios.
   */
  async _listableInternalRoleIds() {
    const roles = await roleRepository.findAll({
      name: { [Op.in]: INTERNAL_ROLE_NAMES, [Op.notIn]: SUPERADMIN_ROLE_NAMES }
    });
    return roles.map(r => r.role_id);
  }

  /** @private */
  _isSuperAdminRole(roleName) {
    return !!roleName && SUPERADMIN_ROLE_NAMES.includes(roleName);
  }

  /**
   * @private — Bloquea toda operación de escritura sobre un usuario eliminado (deleted_at != null).
   * Las cuentas eliminadas son intocables: no se editan, no cambian de rol/estado, no se re-eliminan.
   */
  _assertNotDeleted(user) {
    if (user?.deleted_at) {
      throw AppError.conflict('El usuario está eliminado y no admite modificaciones', { code: 'USER_DELETED' });
    }
  }

  /** @private */
  async _getInternalUserOrFail(userId) {
    const user = await userRepository.findByUserId(userId, 'basic');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    if (!this._isInternalRole(user.role?.name)) {
      throw AppError.notFound('Usuario interno no encontrado');
    }
    return user;
  }

  /** @private */
  async _getInternalRoleOrFail(roleId) {
    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw AppError.notFound('Rol no encontrado');
    }
    if (!this._isInternalRole(role.name)) {
      throw AppError.badRequest('El rol indicado no es un rol interno');
    }
    return role;
  }

  /** @private */
  _isInternalRole(roleName) {
    return !!roleName && INTERNAL_ROLE_NAMES.includes(roleName);
  }

  /** @private — cierra sesiones en BD y las invalida en Redis */
  async _invalidateSessions(userId, reason) {
    await userSessionRepository.closeAllByUser(userId, reason);
    await TokenBlacklistUtil.invalidateUserSessions(userId).catch(err =>
      logger.warn('Error invalidando sesiones en Redis', { error: err.message, userId })
    );
  }
}

module.exports = new AdminUserService();
