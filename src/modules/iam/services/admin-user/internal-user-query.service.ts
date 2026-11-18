import type { UserRepositoryPort } from '../../../repository-ports';
type UserRepositoryFilters = NonNullable<Parameters<UserRepositoryPort['findAllPaginated']>[0]>;
// modules/admin/kyc/iam/services/admin-user/internal-user-query.service.ts
//
// Lecturas de usuarios internos: listados, detalle, catálogo de roles, sesiones y bitácora.
// Extraído de AdminUserService (SOLID: S).

import userRepository from '../../repositories/user.repository';
import roleRepository from '../../repositories/role.repository';
import userSessionRepository from '../../repositories/user-session.repository';
import userChangeLogRepository from '../../../audit/repositories/user-change-log.repository';
import DualApprovalService from '../../../approvals/services/dual-approval.service';
import PaginationHelper from '../../../../shared/http/pagination.util';
import loggerUtilModule from '../../../../shared/observability/logger.util';
const { logAudit } = loggerUtilModule;
import componentsCatalogDtoModule from '../../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import constantsModule from '../../../../shared/constants';
const { INTERNAL_ROLE_NAMES, SUPERADMIN_ROLE_NAMES } = constantsModule;
import adminUserDtoModule from '../../dtos/admin-user.dto';
const {
  InternalUserDTO,
  InternalUserListDTO,
  UserSessionDTO,
  UserChangeLogDTO,
  RoleOptionDTO
} = adminUserDtoModule;
import internalUserGuardsModule from './internal-user-guards';
const { InternalUserGuards } = internalUserGuardsModule;

const ENTITY = { entityType: 'InternalUser', entityTable: 'users' };

class InternalUserQueryService {
  userRepository: typeof userRepository;
  roleRepository: typeof roleRepository;
  userSessionRepository: typeof userSessionRepository;
  userChangeLogRepository: typeof userChangeLogRepository;
  DualApprovalService: typeof DualApprovalService;
  guards: InstanceType<typeof InternalUserGuards>;

  /** @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada AdminUserService. */
  constructor(deps: InternalUserQueryService.Deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.userChangeLogRepository = deps.userChangeLogRepository ?? userChangeLogRepository;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;
    this.guards = deps.guards ?? new InternalUserGuards(deps);
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    // El listado nunca expone superadmins (se excluyen de los roles visibles).
    const internalRoleIds = await this.guards.listableInternalRoleIds();

    // Filtro por rol: si viene roleId validamos que sea interno (y no superadmin)
    // antes de usarlo; si no, listamos todos los roles internos visibles.
    const roleIdParam = PaginationHelper.stringParam(query, 'roleId');
    const roleIds = roleIdParam && internalRoleIds.includes(roleIdParam) ? [roleIdParam] : internalRoleIds;

    // Excluimos al propio solicitante: un admin no se ve a sí mismo en el listado.
    const filters: UserRepositoryFilters = { roleIds, excludeUserId: adminUserId };
    if (query.isActive !== undefined) {
      filters.isActive = PaginationHelper.booleanParam(query, 'isActive');
    }

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, PaginationHelper.stringParam(query, 'search'));

    await this.DualApprovalService.annotatePending('User', rows, 'userId');

    logAudit('INTERNAL_USER_LIST_VIEWED', adminUserId, { totalItems: count }, { ...ENTITY });

    const activeFilters: Record<string, unknown> = {};
    if (roleIdParam) {
      activeFilters.roleId = roleIdParam;
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
  async listDeleted(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const internalRoleIds = await this.guards.listableInternalRoleIds();
    const roleIdParam = PaginationHelper.stringParam(query, 'roleId');
    const roleIds = roleIdParam && internalRoleIds.includes(roleIdParam) ? [roleIdParam] : internalRoleIds;

    const filters: UserRepositoryFilters = { roleIds, onlyDeleted: true };
    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, PaginationHelper.stringParam(query, 'search'));

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
  async listRoleOptions(adminUserId: string) {
    const roles = await this.roleRepository.findByNames(INTERNAL_ROLE_NAMES, { exclude: SUPERADMIN_ROLE_NAMES });
    logAudit(
      'INTERNAL_USER_ROLE_OPTIONS_VIEWED',
      adminUserId,
      { totalItems: roles.length },
      { entityType: 'RbacRole', entityTable: 'roles' }
    );
    return roles.map(RoleOptionDTO);
  }

  async getById(userId: string, adminUserId: string) {
    const user = await this.guards.getInternalUserOrFail(userId);
    logAudit('INTERNAL_USER_VIEWED', adminUserId, { targetUserId: userId }, { entityId: userId, ...ENTITY });
    return InternalUserDTO(user);
  }

  async listSessions(userId: string, adminUserId: string) {
    await this.guards.getInternalUserOrFail(userId);
    const sessions = await this.userSessionRepository.findActiveByUser(userId);
    logAudit('INTERNAL_USER_SESSIONS_VIEWED', adminUserId, { targetUserId: userId }, { entityId: userId, ...ENTITY });
    return sessions.map(UserSessionDTO);
  }

  async listChangeLogs(userId: string, query: Record<string, unknown>, adminUserId: string) {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace InternalUserQueryService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userRepository?: typeof userRepository;
    roleRepository?: typeof roleRepository;
    userSessionRepository?: typeof userSessionRepository;
    userChangeLogRepository?: typeof userChangeLogRepository;
    DualApprovalService?: typeof DualApprovalService;
    guards?: InstanceType<typeof InternalUserGuards>;
  }
}

export default InternalUserQueryService;
