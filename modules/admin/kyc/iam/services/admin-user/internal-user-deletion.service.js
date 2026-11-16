// modules/admin/kyc/iam/services/admin-user/internal-user-deletion.service.js
//
// Eliminación de usuarios internos: re-autenticación del admin, doble aprobación y ofuscación
// irreversible. Extraído de AdminUserService (SOLID: S).

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const ProfileHelper = require('../../../../../schemas/kyc/person/helpers/profile.helper');
const NotificationCreationService = require('../../../../../schemas/notification/services/notification-creation.service');
const DualApprovalService = require('../../../../../schemas/core/services/dual-approval.service');
const unitOfWork = require('../../../../../../shared/database/unit-of-work');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { notifications } = require('../../../../../../shared/constants');
const { InternalUserGuards } = require('./internal-user-guards');

class InternalUserDeletionService {
  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada AdminUserService. */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.profileHelper = deps.profileHelper ?? ProfileHelper;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
    this.guards = deps.guards ?? new InternalUserGuards(deps);
  }

  async deleteUser(userId, currentPassword, auditCtx) {
    // Re-autenticación del admin (maker) ANTES de gatear la doble aprobación.
    const adminUser = await this.userRepository.findByUserId(auditCtx.adminUserId, 'minimal');
    if (!adminUser) {
      throw AppError.notFound('Administrador no encontrado');
    }
    await this.profileHelper.validateCurrentPassword(adminUser.password_hash, currentPassword);

    // Debe ser un interno existente, no superadmin y no estar ya eliminado.
    const user = await this.guards.getInternalUserOrFail(userId);
    this.guards.assertNotDeleted(user);
    if (this.guards.isSuperAdminRole(user.role?.name)) {
      throw AppError.forbidden('No se puede eliminar a un super administrador');
    }

    // Doble aprobación (maker-checker). Pendiente → 202 y la eliminación corre luego desde el
    // handler IoC (executeDeleteUser). Flag off / super_admin → se ejecuta inline.
    const gate = await this.DualApprovalService.gate('INTERNAL_USER_DELETE', {
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
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findForAccountDeletion(userId, { transaction });
      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }

      await this.profileHelper.deleteAccountLogic({
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
      await this.guards.invalidateSessions(userId, 'account_deleted');

      logAudit(
        'INTERNAL_USER_DELETED',
        auditCtx.adminUserId,
        {},
        { entityId: userId, entityType: 'InternalUser', entityTable: 'users' }
      );

      const empleadoNombre = user.person?.first_name || 'Usuario';
      setImmediate(() => {
        this.NotificationCreationService.crearNotificacion({
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
}

module.exports = InternalUserDeletionService;
