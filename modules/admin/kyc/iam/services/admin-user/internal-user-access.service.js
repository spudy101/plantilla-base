// modules/admin/kyc/iam/services/admin-user/internal-user-access.service.js
//
// Control de acceso de usuarios internos: cambio de rol (doble aprobación), activar/desactivar
// y cierre de sesiones. Extraído de AdminUserService (SOLID: S).

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const KycSharedUtil = require('../../../../../schemas/kyc/person/utils/kyc-shared.util');
const NotificationCreationService = require('../../../../../schemas/notification/services/notification-creation.service');
const DualApprovalService = require('../../../../../schemas/core/services/dual-approval.service');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { notifications } = require('../../../../../../shared/constants');
const { InternalUserDTO } = require('../../dtos/admin-user.dto');
const { InternalUserGuards, displayName } = require('./internal-user-guards');

const ENTITY = { entityType: 'InternalUser', entityTable: 'users' };

class InternalUserAccessService {
  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada AdminUserService. */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.kycSharedUtil = deps.kycSharedUtil ?? KycSharedUtil;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
    this.guards = deps.guards ?? new InternalUserGuards(deps);
  }

  // ============================================================
  // CAMBIO DE ROL (auditado — criterio #4, doble aprobación)
  // ============================================================

  async changeRole(userId, newRoleId, auditCtx) {
    const user = await this.guards.getInternalUserOrFail(userId);
    this.guards.assertNotDeleted(user);

    // Protección: el rol de un superadministrador no se puede modificar.
    if (this.guards.isSuperAdminRole(user.role?.name)) {
      throw AppError.forbidden('No se puede cambiar el rol de un super administrador');
    }

    const newRole = await this.guards.getInternalRoleOrFail(newRoleId);
    if (user.role_id === newRoleId) {
      throw AppError.badRequest('El usuario ya tiene este rol');
    }

    // Doble aprobación (maker-checker). Las validaciones de arriba corren ANTES del gate, así una
    // operación inviable nunca crea un approval_request. Pendiente → 202; inline en otro caso.
    // El handler IoC reanuda con executeChangeRole (no re-gatea).
    const gate = await this.DualApprovalService.gate('RBAC_ROLE_CHANGE', {
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
    const user = prefetched.user ?? (await this.guards.getInternalUserOrFail(userId));
    const newRole = prefetched.newRole ?? (await this.guards.getInternalRoleOrFail(newRoleId));

    const oldRoleName = user.role?.name || null;

    await this.userRepository.update(userId, { role_id: newRoleId });

    await this.kycSharedUtil.logChange({
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
    await this.guards.invalidateSessions(userId, 'role_changed');

    logAudit(
      'INTERNAL_USER_ROLE_CHANGED',
      auditCtx.adminUserId,
      { before: { role: oldRoleName }, after: { role: newRole.name } },
      { entityId: userId, ...ENTITY }
    );

    const nombre = displayName(user);
    setImmediate(() => {
      const { logoUrl } = notifications.ses;
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_INTERNAL_USER_ROLE_CHANGED',
        userId,
        relatedEntity: userId,
        metadata: { nombre, rolAnterior: oldRoleName || '—', nuevoRol: newRole.name, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_INTERNAL_USER_ROLE_CHANGED', { error: err.message }));
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_ADMIN_ROLE_CHANGED',
        userId: auditCtx.adminUserId,
        relatedEntity: userId,
        metadata: { nombreUsuario: nombre, rolAnterior: oldRoleName || '—', nuevoRol: newRole.name, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_ADMIN_ROLE_CHANGED', { error: err.message }));
    });

    const fresh = await this.userRepository.findByUserId(userId, 'basic');
    return InternalUserDTO(fresh);
  }

  // ============================================================
  // ESTADO (activar / desactivar — auditado)
  // ============================================================

  async setStatus(userId, isActive, auditCtx) {
    const user = await this.guards.getInternalUserOrFail(userId);
    this.guards.assertNotDeleted(user);

    // Protección: un superadministrador no se puede desactivar.
    if (!isActive && this.guards.isSuperAdminRole(user.role?.name)) {
      throw AppError.forbidden('No se puede desactivar a un super administrador');
    }

    if (user.is_active === isActive) {
      throw AppError.badRequest(`El usuario ya está ${isActive ? 'activo' : 'inactivo'}`);
    }

    await this.userRepository.setActiveStatus(userId, isActive);

    await this.kycSharedUtil.logChange({
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
      await this.guards.invalidateSessions(userId, 'account_deactivated');
    }

    logAudit(
      isActive ? 'INTERNAL_USER_ACTIVATED' : 'INTERNAL_USER_DEACTIVATED',
      auditCtx.adminUserId,
      { before: { isActive: !isActive }, after: { isActive } },
      { entityId: userId, ...ENTITY }
    );

    const nombre = displayName(user);
    const accion = isActive ? 'activado' : 'desactivado';
    setImmediate(() => {
      const { logoUrl } = notifications.ses;
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: isActive ? 'IAM_INTERNAL_USER_ACTIVATED' : 'IAM_INTERNAL_USER_DEACTIVATED',
        userId,
        relatedEntity: userId,
        metadata: { nombre, logoUrl }
      }).catch(err =>
        logger.warn(`Error enviando IAM_INTERNAL_USER_${isActive ? 'ACTIVATED' : 'DEACTIVATED'}`, { error: err.message })
      );
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_ADMIN_STATUS_CHANGED',
        userId: auditCtx.adminUserId,
        relatedEntity: userId,
        metadata: { nombreUsuario: nombre, accion, logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_ADMIN_STATUS_CHANGED', { error: err.message }));
    });

    const fresh = await this.userRepository.findByUserId(userId, 'basic');
    return InternalUserDTO(fresh);
  }

  // ============================================================
  // CIERRE DE SESIONES
  // ============================================================

  async closeSessions(userId, auditCtx) {
    const user = await this.guards.getInternalUserOrFail(userId);
    this.guards.assertNotDeleted(user);
    await this.guards.invalidateSessions(userId, 'closed_by_admin');
    logAudit('INTERNAL_USER_SESSIONS_CLOSED', auditCtx.adminUserId, { targetUserId: userId }, { entityId: userId, ...ENTITY });

    const nombre = displayName(user);
    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_INTERNAL_USER_SESSIONS_CLOSED',
        userId,
        relatedEntity: userId,
        metadata: { nombre }
      }).catch(err => logger.warn('Error enviando IAM_INTERNAL_USER_SESSIONS_CLOSED', { error: err.message }));
    });
    return { userId, closed: true };
  }
}

module.exports = InternalUserAccessService;
