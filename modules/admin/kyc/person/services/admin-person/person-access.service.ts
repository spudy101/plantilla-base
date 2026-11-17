// modules/admin/kyc/person/services/admin-person/person-access.service.ts
//
// Control de acceso de una cuenta: activar/desactivar y cambio de rol.
// Extraído de PersonService (SOLID: S).

import type { AdminAuditContext } from '../../../../../../shared/types/audit-context';
import unitOfWork = require('../../../../../../shared/database/unit-of-work');
import userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
import roleRepository = require('../../../../../schemas/kyc/iam/repositories/role.repository');
import KycSharedUtil = require('../../../../../schemas/kyc/person/utils/kyc-shared.util');
import NotificationUtil = require('../../../../../schemas/notification/services/notification-creation.service');
import AppError = require('../../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import constantsModule = require('../../../../../../shared/constants');
const { notifications } = constantsModule;

import adminPersonDtoModule = require('../../dtos/admin-person.dto');
const { ToggleUserStatusDTO, ChangeRoleDTO } = adminPersonDtoModule;
import personGuardsModule = require('./person-guards');
const { assertNotDeleted, isClientRole } = personGuardsModule;

class PersonAccessService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  roleRepository: typeof roleRepository;
  NotificationUtil: typeof NotificationUtil;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps: PersonAccessService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  // ============================================================
  // ACTIVAR / DESACTIVAR
  // ============================================================

  activate(userId: string, auditContext: AdminAuditContext) {
    return this._toggleStatus(userId, 'activate', auditContext);
  }

  deactivate(userId: string, auditContext: AdminAuditContext) {
    return this._toggleStatus(userId, 'deactivate', auditContext);
  }

  async _toggleStatus(userId: string, action: 'activate' | 'deactivate', auditContext: AdminAuditContext) {
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
      assertNotDeleted(user);

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
  // CAMBIAR ROL
  // ============================================================

  async changeRole(userId: string, newRoleId: string, auditContext: AdminAuditContext) {
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
      assertNotDeleted(user);

      // Antes: `user.role.name === 'admin'` (los roles son MAYÚSCULAS → nunca coincidía) y sin límite sobre
      // el rol nuevo. Este endpoint podía cambiar el rol de un ADMIN/SUPERADMIN o promover un cliente a
      // interno, salteando la doble aprobación de admin-user. Solo opera entre roles de cliente.
      if (!isClientRole(user.role?.name)) {
        throw AppError.forbidden('Solo se puede cambiar el rol de una cuenta de cliente');
      }

      const newRole = await this.roleRepository.findById(newRoleId);
      if (!newRole) {
        throw AppError.notFound('Rol no encontrado');
      }
      if (!isClientRole(newRole.name)) {
        throw AppError.badRequest('El rol indicado no es un rol de cliente');
      }

      if (user.role_id === newRoleId) {
        throw AppError.badRequest('El usuario ya tiene este rol');
      }

      const oldRole = user.role ?? null;

      await this.userRepository.update(userId, { role_id: newRoleId }, { transaction });

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: auditContext.adminUserId,
          changedByRole: 'admin',
          changeType: 'role',
          previousValue: oldRole?.name ?? null,
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
          before: { role: oldRole?.name ?? null },
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
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PersonAccessService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    roleRepository?: typeof roleRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export = PersonAccessService;
