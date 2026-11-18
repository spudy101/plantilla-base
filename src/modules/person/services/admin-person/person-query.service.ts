import type { UserRepositoryPort } from '../../../repository-ports';
// modules/admin/kyc/person/services/admin-person/person-query.service.ts
//
// Consultas de cuentas de cliente para el panel admin: listado, eliminados,
// opciones de rol y detalle. Extraído de PersonService (SOLID: S).

import userRepository from '../../../iam/repositories/user.repository';
import roleRepository from '../../../iam/repositories/role.repository';
import AppError from '../../../../shared/http/app-error.util';
import PaginationHelper from '../../../../shared/http/pagination.util';
import componentsCatalogDtoModule from '../../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import constantsModule from '../../../../shared/constants';
const { CLIENT_ROLE_NAMES } = constantsModule;

import adminPersonDtoModule from '../../dtos/admin-person.dto';
const { UserDTO, UserListItemDTO, RoleOptionDTO } = adminPersonDtoModule;
import audit from '../../../audit/audit.service';

class PersonQueryService {
  userRepository: typeof userRepository;
  roleRepository: typeof roleRepository;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps: PersonQueryService.Deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = PaginationHelper.stringParam(query, 'search');

    // Construimos los filtros explícitamente para no depender de buildFilters
    // y garantizar que las keys lleguen al repository con el nombre exacto que espera.
    const filters: NonNullable<Parameters<UserRepositoryPort['findAllPaginated']>[0]> = {};

    // isActive viene como booleano (el validator hace .toBoolean())
    if (query.isActive !== undefined) {
      filters.isActive = PaginationHelper.booleanParam(query, 'isActive');
    }

    // El listado de clientes SOLO muestra usuarios con rol CLIENTE o CLIENTE_VERIFICADO
    // (espejo de admin-user.service, que se limita a INTERNAL_ROLE_NAMES). Si llega roleId,
    // se intersecta con los roles cliente; si no queda ninguno válido, se listan todos los
    // roles cliente. Así el endpoint nunca expone usuarios internos ni entidades externas.
    const clientRoleIds = await this._clientRoleIds();
    let roleIds = clientRoleIds;
    if (query.roleId) {
      const requested = String(query.roleId)
        .split(',')
        .map(id => id.trim());
      const valid = requested.filter(id => clientRoleIds.includes(id));
      if (valid.length) {
        roleIds = valid;
      }
    }
    filters.roleIds = roleIds;

    // nationalId se busca por hash exacto (el campo está cifrado con IV aleatorio)
    const nationalIdParam = PaginationHelper.stringParam(query, 'nationalId');
    if (nationalIdParam) {
      filters.nationalId = nationalIdParam.trim();
    }

    // userId filtra por el PK exacto del usuario
    const userIdParam = PaginationHelper.stringParam(query, 'userId');
    if (userIdParam) {
      filters.userId = userIdParam.trim();
    }

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const activeFilters = searchTerm ? { search: searchTerm, ...filters } : filters;

    await audit.record('PERSON_LIST_VIEWED', {
      actorId: adminUserId,
      details: {
        totalItems: count,
        page: paginationParams.page
      },
      entityType: 'User',
      entityTable: 'users'
    });

    return {
      data: rows.map(u => UserListItemDTO(u)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : null
      })
    };
  }

  /** @private — IDs de los roles de cliente (CLIENTE, CLIENTE_VERIFICADO) */
  async _clientRoleIds() {
    const roles = await this.roleRepository.findByNames(CLIENT_ROLE_NAMES);
    return roles.map(r => r.roleId);
  }

  /**
   * Listado HISTÓRICO de clientes eliminados (read-only). Solo cuentas con deleted_at != null.
   * El listado normal (list) las excluye; estas cuentas son intocables (no se modifican).
   */
  async listDeleted(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = PaginationHelper.stringParam(query, 'search');

    const clientRoleIds = await this._clientRoleIds();
    const filters = { roleIds: clientRoleIds, onlyDeleted: true };

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, searchTerm);

    await audit.record('PERSON_DELETED_LIST_VIEWED', {
      actorId: adminUserId,
      details: { totalItems: count, page: paginationParams.page },
      entityType: 'User',
      entityTable: 'users'
    });

    return {
      data: rows.map(u => UserListItemDTO(u)),
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
   * Catálogo de roles de CLIENTE para poblar el filtro por rol del listado de clientes.
   * Devuelve solo los roles cliente (CLIENTE / CLIENTE_VERIFICADO) — los mismos que filtra `list`.
   * Evita que el front ofrezca todos los roles del sistema en este listado.
   */
  async listRoleOptions(adminUserId: string) {
    const roles = await this.roleRepository.findByNames(CLIENT_ROLE_NAMES);
    await audit.record('PERSON_ROLE_OPTIONS_VIEWED', {
      actorId: adminUserId,
      details: { totalItems: roles.length },
      entityType: 'RbacRole',
      entityTable: 'roles'
    });
    return roles.map(RoleOptionDTO);
  }

  async getById(userId: string, adminUserId: string) {
    const user = await this.userRepository.findByUserId(userId, 'full');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }

    await audit.record('PERSON_VIEWED', {
      actorId: adminUserId,
      details: { targetUserId: userId },
      entityId: userId,
      entityType: 'User',
      entityTable: 'users'
    });

    return UserDTO(user);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PersonQueryService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userRepository?: typeof userRepository;
    roleRepository?: typeof roleRepository;
  }
}

export default PersonQueryService;
