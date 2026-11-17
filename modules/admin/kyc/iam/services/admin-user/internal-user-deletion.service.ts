// modules/admin/kyc/iam/services/admin-user/internal-user-deletion.service.ts
//
// Eliminación de usuarios internos: re-autenticación del admin, doble aprobación y ofuscación
// irreversible. Extraído de AdminUserService (SOLID: S).

import type { AdminAuditContext } from '../../../../../../shared/types/audit-context';
import userRepository from '../../../../../schemas/kyc/iam/repositories/user.repository';
import ProfileHelper from '../../../../../schemas/kyc/person/helpers/profile.helper';
import NotificationCreationService from '../../../../../schemas/notification/services/notification-creation.service';
import DualApprovalService from '../../../../../schemas/core/services/dual-approval.service';
import unitOfWork from '../../../../../../shared/database/unit-of-work';
import AppError from '../../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import constantsModule from '../../../../../../shared/constants';
const { notifications } = constantsModule;
import internalUserGuardsModule from './internal-user-guards';
const { InternalUserGuards } = internalUserGuardsModule;

class InternalUserDeletionService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  profileHelper: typeof ProfileHelper;
  NotificationCreationService: typeof NotificationCreationService;
  DualApprovalService: typeof DualApprovalService;
  guards: InstanceType<typeof InternalUserGuards>;

  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada AdminUserService. */
  constructor(deps: InternalUserDeletionService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.profileHelper = deps.profileHelper ?? ProfileHelper;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
    this.guards = deps.guards ?? new InternalUserGuards(deps);
  }

  async deleteUser(userId: string, currentPassword: string, auditCtx: AdminAuditContext) {
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
  async executeDeleteUser(userId: string, auditCtx: AdminAuditContext) {
    const user = await this.unitOfWork.run(async transaction => {
      const user = await this.userRepository.findForAccountDeletion(userId, { transaction });
      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }

      const person = this.guards.requirePerson(user);
      await this.profileHelper.deleteAccountLogic({
        userId,
        personId: person.person_id,
        nationalId: person.national_id,
        email: person.contact?.email,
        username: user.username,
        firstName: person.first_name,
        changedByUserId: auditCtx.adminUserId,
        changedByRole: 'admin',
        changeReason: 'Usuario interno eliminado por administrador',
        auditContext: { ipAddress: auditCtx.ipAddress, userAgent: auditCtx.userAgent },
        transaction
      });
      return user;
    });

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
        relatedEntity: { type: 'User', id: userId },
        metadata: { nombreUsuario: empleadoNombre, accion: 'eliminado', logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_ADMIN_STATUS_CHANGED (eliminación)', { error: err.message }));
    });

    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace InternalUserDeletionService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    profileHelper?: typeof ProfileHelper;
    NotificationCreationService?: typeof NotificationCreationService;
    DualApprovalService?: typeof DualApprovalService;
    guards?: InstanceType<typeof InternalUserGuards>;
  }
}

export default InternalUserDeletionService;
