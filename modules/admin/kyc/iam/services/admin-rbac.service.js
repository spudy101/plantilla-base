// modules/admin/rbac/services/admin-rbac.service.js
//
// Catálogo RBAC de solo lectura + gestión de overrides en runtime (RF-ADM-01).
//
// El catálogo (módulos, matriz, permisos propios) es para que el front oculte
// vistas; la autorización REAL la hace RbacMiddleware en el servidor.
//
// Los overrides se escriben en BD vía role-permission-override.repository y se
// invalida la caché Redis del rol afectado para que el cambio sea inmediato.

const RbacService = require('../../../../../shared/services/rbac.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const { RBAC_ROLES, notifications } = require('../../../../../shared/constants');
const NotificationCreationService = require('../../../../schemas/notification/services/notification-creation.service');
const rolePermissionOverrideRepository = require('../../../../schemas/kyc/iam/repositories/role-permission-override.repository');
const {
  RbacCatalogDTO,
  RoleMatrixDTO,
  EffectivePermissionsDTO,
  RolePermissionsListDTO,
  RolePermissionOverrideDTO
} = require('../dtos/admin-rbac.dto');

class AdminRbacService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminRbacService({ RbacService: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.RbacService = deps.RbacService ?? RbacService;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
    this.rolePermissionOverrideRepository = deps.rolePermissionOverrideRepository ?? rolePermissionOverrideRepository;
  }

  // ============================================================
  // CATÁLOGO (solo lectura)
  // ============================================================

  getCatalog(userId) {
    logAudit('RBAC_CATALOG_VIEWED', userId, {}, { entityType: 'RbacCatalog', entityTable: 'roles' });
    return RbacCatalogDTO(this.RbacService.listCatalog());
  }

  async getRoles(userId) {
    const roleNames = Object.values(RBAC_ROLES);
    logAudit('RBAC_ROLES_VIEWED', userId, {}, { entityType: 'RbacRole', entityTable: 'roles' });
    return RoleMatrixDTO(await this.RbacService.getRoleMatrix(roleNames));
  }

  async getEffectivePermissions(roleName, userId) {
    logAudit('RBAC_EFFECTIVE_PERMISSIONS_VIEWED', userId, { roleName }, { entityType: 'RbacRole', entityTable: 'roles' });
    return EffectivePermissionsDTO(roleName, await this.RbacService.getEffectivePermissions(roleName));
  }

  // ============================================================
  // OVERRIDES — permisos adicionales por módulo (RF-ADM-01 criterio #1)
  // ============================================================

  /** Lista los overrides (permisos extra) definidos para un rol. */
  async listOverrides(roleName, userId) {
    this._assertValidRole(roleName);
    const overrides = await this.rolePermissionOverrideRepository.findByRole(roleName);
    logAudit(
      'RBAC_ROLE_PERMISSIONS_VIEWED',
      userId,
      { roleName },
      { entityType: 'RbacRole', entityTable: 'role_permission_overrides' }
    );
    return RolePermissionsListDTO(roleName, overrides);
  }

  /**
   * Otorga un permiso adicional a un rol.
   * Solo el SUPERADMIN llega aquí (protegido por RbacMiddleware en la ruta).
   */
  async grantPermission(roleName, moduleName, action, grantedByUserId) {
    this._assertValidRole(roleName);

    const alreadyExists = await this.rolePermissionOverrideRepository.existsOverride(roleName, moduleName, action);
    if (alreadyExists) {
      throw AppError.conflict(`El rol '${roleName}' ya tiene el permiso '${action}' en '${moduleName}'`);
    }

    const override = await this.rolePermissionOverrideRepository.create({
      role_name: roleName,
      module_name: moduleName,
      action,
      granted_by_user_id: grantedByUserId
    });

    await this.RbacService.invalidateCache(roleName);

    logAudit(
      'RBAC_PERMISSION_GRANTED',
      grantedByUserId,
      {
        roleName,
        moduleName,
        action
      },
      { entityId: override.role_permission_id, entityType: 'RbacPermission', entityTable: 'role_permission_overrides' }
    );

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_RBAC_PERMISSION_GRANTED',
        userId: grantedByUserId,
        relatedEntity: override.role_permission_id,
        metadata: { roleName, moduleName, action, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error enviando IAM_RBAC_PERMISSION_GRANTED', { error: err.message }));
    });

    return RolePermissionOverrideDTO(override);
  }

  /**
   * Revoca un permiso adicional.
   * Solo el SUPERADMIN llega aquí (protegido por RbacMiddleware en la ruta).
   */
  async revokePermission(permissionId, adminUserId) {
    const override = await this.rolePermissionOverrideRepository.findById(permissionId);
    if (!override) {
      throw AppError.notFound('Permiso no encontrado');
    }

    await this.rolePermissionOverrideRepository.deleteById(permissionId);
    await this.RbacService.invalidateCache(override.role_name);

    logAudit(
      'RBAC_PERMISSION_REVOKED',
      adminUserId,
      {
        roleName: override.role_name,
        moduleName: override.module_name,
        action: override.action
      },
      { entityId: permissionId, entityType: 'RbacPermission', entityTable: 'role_permission_overrides' }
    );

    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'IAM_RBAC_PERMISSION_REVOKED',
        userId: adminUserId,
        relatedEntity: permissionId,
        metadata: {
          roleName: override.role_name,
          moduleName: override.module_name,
          action: override.action,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error enviando IAM_RBAC_PERMISSION_REVOKED', { error: err.message }));
    });

    return { deleted: true, permissionId };
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  _assertValidRole(roleName) {
    if (!Object.values(RBAC_ROLES).includes(roleName)) {
      throw AppError.badRequest(`El rol '${roleName}' no es un rol RBAC válido`);
    }
  }
}

module.exports = new AdminRbacService();
module.exports.AdminRbacService = AdminRbacService;
