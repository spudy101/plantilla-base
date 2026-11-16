// modules/admin/kyc/iam/services/admin-user/internal-user-guards.js
//
// Reglas y lecturas compartidas por los servicios de gestión de usuarios internos
// (equivalente a person-guards.js en admin-person). Extraído de AdminUserService (SOLID: S).

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const roleRepository = require('../../../../../schemas/kyc/iam/repositories/role.repository');
const userSessionRepository = require('../../../../../schemas/kyc/iam/repositories/user-session.repository');
const TokenBlacklistUtil = require('../../../../../../shared/utils/token-blacklist.util');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger } = require('../../../../../../shared/utils/logger.util');
const { INTERNAL_ROLE_NAMES, SUPERADMIN_ROLE_NAMES } = require('../../../../../../shared/constants');

class InternalUserGuards {
  /** @param {object} [deps] Dependencias inyectables (SOLID: D). */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
  }

  isInternalRole(roleName) {
    return !!roleName && INTERNAL_ROLE_NAMES.includes(roleName);
  }

  isSuperAdminRole(roleName) {
    return !!roleName && SUPERADMIN_ROLE_NAMES.includes(roleName);
  }

  /**
   * Bloquea toda operación de escritura sobre un usuario eliminado (deleted_at != null).
   * Las cuentas eliminadas son intocables: no se editan, no cambian de rol/estado, no se re-eliminan.
   */
  assertNotDeleted(user) {
    if (user?.deleted_at) {
      throw AppError.conflict('El usuario está eliminado y no admite modificaciones', { code: 'USER_DELETED' });
    }
  }

  async getInternalUserOrFail(userId) {
    const user = await this.userRepository.findByUserId(userId, 'basic');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    if (!this.isInternalRole(user.role?.name)) {
      throw AppError.notFound('Usuario interno no encontrado');
    }
    return user;
  }

  async getInternalRoleOrFail(roleId) {
    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw AppError.notFound('Rol no encontrado');
    }
    if (!this.isInternalRole(role.name)) {
      throw AppError.badRequest('El rol indicado no es un rol interno');
    }
    return role;
  }

  /**
   * IDs de los roles internos visibles en el listado. Excluye superadministradores:
   * nunca se listan usuarios internos con rol superadmin en la gestión de usuarios.
   */
  async listableInternalRoleIds() {
    const roles = await this.roleRepository.findByNames(INTERNAL_ROLE_NAMES, { exclude: SUPERADMIN_ROLE_NAMES });
    return roles.map(r => r.role_id);
  }

  /** Cierra sesiones en BD y las invalida en Redis. */
  async invalidateSessions(userId, reason) {
    await this.userSessionRepository.closeAllByUser(userId, reason);
    await TokenBlacklistUtil.invalidateUserSessions(userId).catch(err =>
      logger.warn('Error invalidando sesiones en Redis', { error: err.message, userId })
    );
  }
}

/** Nombre completo para notificaciones ("Usuario" si no hay datos). */
function displayName(user) {
  return [user.person?.first_name, user.person?.last_name].filter(Boolean).join(' ') || 'Usuario';
}

module.exports = { InternalUserGuards, displayName };
