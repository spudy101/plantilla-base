// modules/admin/kyc/person/services/admin-person/person-access.service.js
//
// Control de acceso de una cuenta: activar/desactivar y cambio de rol.
// Extraído de PersonService (SOLID: S).

const unitOfWork = require('../../../../../../shared/database/unit-of-work');
const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const roleRepository = require('../../../../../schemas/kyc/iam/repositories/role.repository');
const KycSharedUtil = require('../../../../../schemas/kyc/person/utils/kyc-shared.util');
const NotificationUtil = require('../../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const { notifications } = require('../../../../../../shared/constants');

const { ToggleUserStatusDTO, ChangeRoleDTO } = require('../../dtos/admin-person.dto');
const { assertNotDeleted } = require('./person-guards');

class PersonAccessService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
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
      assertNotDeleted(user);

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
}

module.exports = PersonAccessService;
