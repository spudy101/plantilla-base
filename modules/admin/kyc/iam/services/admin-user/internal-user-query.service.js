// modules/admin/kyc/iam/services/admin-user/internal-user-query.service.js
//
// Lecturas de usuarios internos: listados, detalle, catálogo de roles, sesiones y bitácora.
// Extraído de AdminUserService (SOLID: S).

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const roleRepository = require('../../../../../schemas/kyc/iam/repositories/role.repository');
const userSessionRepository = require('../../../../../schemas/kyc/iam/repositories/user-session.repository');
const userChangeLogRepository = require('../../../../../schemas/records/audit/repositories/user-change-log.repository');
const DualApprovalService = require('../../../../../schemas/core/services/dual-approval.service');
const PaginationHelper = require('../../../../../../shared/utils/pagination.util');
const { logAudit } = require('../../../../../../shared/utils/logger.util');
const { MetadataDTO } = require('../../../../../../shared/dtos/kyc/components-catalog.dto');
const { INTERNAL_ROLE_NAMES, SUPERADMIN_ROLE_NAMES } = require('../../../../../../shared/constants');
const {
  InternalUserDTO,
  InternalUserListDTO,
  UserSessionDTO,
  UserChangeLogDTO,
  RoleOptionDTO
} = require('../../dtos/admin-user.dto');
const { InternalUserGuards } = require('./internal-user-guards');

const ENTITY = { entityType: 'InternalUser', entityTable: 'users' };

class InternalUserQueryService {
  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada AdminUserService. */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.userChangeLogRepository = deps.userChangeLogRepository ?? userChangeLogRepository;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
    this.guards = deps.guards ?? new InternalUserGuards(deps);
  }

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    // El listado nunca expone superadmins (se excluyen de los roles visibles).
    const internalRoleIds = await this.guards.listableInternalRoleIds();

    // Filtro por rol: si viene roleId validamos que sea interno (y no superadmin)
    // antes de usarlo; si no, listamos todos los roles internos visibles.
    const roleIds = query.roleId && internalRoleIds.includes(query.roleId) ? [query.roleId] : internalRoleIds;

    // Excluimos al propio solicitante: un admin no se ve a sí mismo en el listado.
    const filters = { roleIds, excludeUserId: adminUserId };
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive;
    }

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, query.search || null);

    await this.DualApprovalService.annotatePending('User', rows);

    logAudit('INTERNAL_USER_LIST_VIEWED', adminUserId, { totalItems: count }, { ...ENTITY });

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
    const internalRoleIds = await this.guards.listableInternalRoleIds();
    const roleIds = query.roleId && internalRoleIds.includes(query.roleId) ? [query.roleId] : internalRoleIds;

    const filters = { roleIds, onlyDeleted: true };
    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, query.search || null);

    logAudit('INTERNAL_USER_DELETED_LIST_VIEWED', adminUserId, { totalItems: count }, { ...ENTITY });

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
   */
  async listRoleOptions(adminUserId) {
    const roles = await this.roleRepository.findByNames(INTERNAL_ROLE_NAMES, { exclude: SUPERADMIN_ROLE_NAMES });
    logAudit(
      'INTERNAL_USER_ROLE_OPTIONS_VIEWED',
      adminUserId,
      { totalItems: roles.length },
      { entityType: 'RbacRole', entityTable: 'roles' }
    );
    return roles.map(RoleOptionDTO);
  }

  async getById(userId, adminUserId) {
    const user = await this.guards.getInternalUserOrFail(userId);
    logAudit('INTERNAL_USER_VIEWED', adminUserId, { targetUserId: userId }, { entityId: userId, ...ENTITY });
    return InternalUserDTO(user);
  }

  async listSessions(userId, adminUserId) {
    await this.guards.getInternalUserOrFail(userId);
    const sessions = await this.userSessionRepository.findActiveByUser(userId);
    logAudit('INTERNAL_USER_SESSIONS_VIEWED', adminUserId, { targetUserId: userId }, { entityId: userId, ...ENTITY });
    return sessions.map(UserSessionDTO);
  }

  async listChangeLogs(userId, query, adminUserId) {
    await this.guards.getInternalUserOrFail(userId);
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const { rows, count } = await this.userChangeLogRepository.findByUserId(userId, paginationParams);

    logAudit('INTERNAL_USER_CHANGE_LOGS_VIEWED', adminUserId, { targetUserId: userId }, { entityId: userId, ...ENTITY });

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
}

module.exports = InternalUserQueryService;
