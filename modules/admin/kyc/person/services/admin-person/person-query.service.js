// modules/admin/kyc/person/services/admin-person/person-query.service.js
//
// Consultas de cuentas de cliente para el panel admin: listado, eliminados,
// opciones de rol y detalle. Extraído de PersonService (SOLID: S).

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const roleRepository = require('../../../../../schemas/kyc/iam/repositories/role.repository');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../../shared/utils/pagination.util');
const { MetadataDTO } = require('../../../../../../shared/dtos/kyc/components-catalog.dto');
const { CLIENT_ROLE_NAMES } = require('../../../../../../shared/constants');

const { UserDTO, UserListItemDTO, RoleOptionDTO } = require('../../dtos/admin-person.dto');

class PersonQueryService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = query.search || null;

    // Construimos los filtros explícitamente para no depender de buildFilters
    // y garantizar que las keys lleguen al repository con el nombre exacto que espera.
    const filters = {};

    // isActive viene como booleano (el validator hace .toBoolean())
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive;
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
    if (query.nationalId) {
      filters.nationalId = query.nationalId.trim();
    }

    // userId filtra por el PK exacto del usuario
    if (query.userId) {
      filters.userId = query.userId.trim();
    }

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const activeFilters = searchTerm ? { search: searchTerm, ...filters } : filters;

    logAudit(
      'PERSON_LIST_VIEWED',
      adminUserId,
      {
        totalItems: count,
        page: paginationParams.page
      },
      { entityType: 'User', entityTable: 'users' }
    );

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
    return roles.map(r => r.role_id);
  }

  /**
   * Listado HISTÓRICO de clientes eliminados (read-only). Solo cuentas con deleted_at != null.
   * El listado normal (list) las excluye; estas cuentas son intocables (no se modifican).
   */
  async listDeleted(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const searchTerm = query.search || null;

    const clientRoleIds = await this._clientRoleIds();
    const filters = { roleIds: clientRoleIds, onlyDeleted: true };

    const { rows, count } = await this.userRepository.findAllPaginated(filters, paginationParams, searchTerm);

    logAudit(
      'PERSON_DELETED_LIST_VIEWED',
      adminUserId,
      { totalItems: count, page: paginationParams.page },
      { entityType: 'User', entityTable: 'users' }
    );

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
  async listRoleOptions(adminUserId) {
    const roles = await this.roleRepository.findByNames(CLIENT_ROLE_NAMES);
    logAudit(
      'PERSON_ROLE_OPTIONS_VIEWED',
      adminUserId,
      { totalItems: roles.length },
      { entityType: 'RbacRole', entityTable: 'roles' }
    );
    return roles.map(RoleOptionDTO);
  }

  async getById(userId, adminUserId) {
    const user = await this.userRepository.findByUserId(userId, 'full');
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }

    logAudit(
      'PERSON_VIEWED',
      adminUserId,
      { targetUserId: userId },
      { entityId: userId, entityType: 'User', entityTable: 'users' }
    );

    return UserDTO(user);
  }
}

module.exports = PersonQueryService;
