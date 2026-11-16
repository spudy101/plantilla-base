// modules/admin/kyc/iam/services/admin-user.service.js
//
// Gestión de USUARIOS INTERNOS (empleados de Base Project) — RF-ADM-01.
// Separado de la gestión de clientes (admin-person, dominio KYC).
//
// ============================================================
// ADMIN USER SERVICE — fachada
// ============================================================
// SOLID (S): este service tenía ~670 líneas (listados, alta/edición, rol, estado, eliminación,
// sesiones y bitácora). Ahora cada responsabilidad vive en su propio service (carpeta admin-user/):
//   - InternalUserQueryService     → listados, detalle, catálogo de roles, sesiones, bitácora
//   - InternalUserProfileService   → alta y edición de datos básicos
//   - InternalUserAccessService    → cambio de rol (doble aprobación), estado, cierre de sesiones
//   - InternalUserDeletionService  → eliminación (re-autenticación + doble aprobación + ofuscación)
//   - InternalUserGuards           → reglas compartidas (interno, superadmin, eliminado, sesiones)
// La API pública no cambia: controllers y el bootstrap de doble aprobación siguen igual.
// ============================================================

const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const roleRepository = require('../../../../schemas/kyc/iam/repositories/role.repository');
const personRepository = require('../../../../schemas/kyc/person/repositories/person.repository');
const documentTypeRepository = require('../../../../schemas/kyc/maintainers/repositories/document-type.repository');
const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const userChangeLogRepository = require('../../../../schemas/records/audit/repositories/user-change-log.repository');
const ProfileHelper = require('../../../../schemas/kyc/person/helpers/profile.helper');
const unitOfWork = require('../../../../../shared/database/unit-of-work');
const NotificationCreationService = require('../../../../schemas/notification/services/notification-creation.service');
const DualApprovalService = require('../../../../schemas/core/services/dual-approval.service');
const { InternalUserGuards } = require('./admin-user/internal-user-guards');
const InternalUserQueryService = require('./admin-user/internal-user-query.service');
const InternalUserProfileService = require('./admin-user/internal-user-profile.service');
const InternalUserAccessService = require('./admin-user/internal-user-access.service');
const InternalUserDeletionService = require('./admin-user/internal-user-deletion.service');

class AdminUserService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminUserService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    // Sub-servicios por responsabilidad (SOLID: S). Reciben las mismas dependencias.
    const shared = {
      unitOfWork: deps.unitOfWork ?? unitOfWork,
      profileHelper: deps.profileHelper ?? ProfileHelper,
      userRepository: deps.userRepository ?? userRepository,
      roleRepository: deps.roleRepository ?? roleRepository,
      personRepository: deps.personRepository ?? personRepository,
      documentTypeRepository: deps.documentTypeRepository ?? documentTypeRepository,
      userSessionRepository: deps.userSessionRepository ?? userSessionRepository,
      userChangeLogRepository: deps.userChangeLogRepository ?? userChangeLogRepository,
      NotificationCreationService: deps.NotificationCreationService ?? NotificationCreationService,
      DualApprovalService: deps.DualApprovalService ?? DualApprovalService
    };
    shared.guards = deps.guards ?? new InternalUserGuards(shared);

    this.queries = deps.queries ?? new InternalUserQueryService(shared);
    this.profile = deps.profile ?? new InternalUserProfileService(shared);
    this.access = deps.access ?? new InternalUserAccessService(shared);
    this.deletion = deps.deletion ?? new InternalUserDeletionService(shared);
  }

  // ── LECTURAS → InternalUserQueryService ──
  list(query, adminUserId) {
    return this.queries.list(query, adminUserId);
  }

  listDeleted(query, adminUserId) {
    return this.queries.listDeleted(query, adminUserId);
  }

  listRoleOptions(adminUserId) {
    return this.queries.listRoleOptions(adminUserId);
  }

  getById(userId, adminUserId) {
    return this.queries.getById(userId, adminUserId);
  }

  listSessions(userId, adminUserId) {
    return this.queries.listSessions(userId, adminUserId);
  }

  listChangeLogs(userId, query, adminUserId) {
    return this.queries.listChangeLogs(userId, query, adminUserId);
  }

  // ── ALTA / EDICIÓN → InternalUserProfileService ──
  create(data, auditCtx) {
    return this.profile.create(data, auditCtx);
  }

  update(userId, data, auditCtx) {
    return this.profile.update(userId, data, auditCtx);
  }

  // ── ACCESO → InternalUserAccessService ──
  changeRole(userId, newRoleId, auditCtx) {
    return this.access.changeRole(userId, newRoleId, auditCtx);
  }

  /** Reanudación del handler de doble aprobación (RBAC_ROLE_CHANGE). */
  executeChangeRole(userId, newRoleId, auditCtx, prefetched = {}) {
    return this.access.executeChangeRole(userId, newRoleId, auditCtx, prefetched);
  }

  setStatus(userId, isActive, auditCtx) {
    return this.access.setStatus(userId, isActive, auditCtx);
  }

  closeSessions(userId, auditCtx) {
    return this.access.closeSessions(userId, auditCtx);
  }

  // ── ELIMINACIÓN → InternalUserDeletionService ──
  deleteUser(userId, currentPassword, auditCtx) {
    return this.deletion.deleteUser(userId, currentPassword, auditCtx);
  }

  /** Reanudación del handler de doble aprobación (INTERNAL_USER_DELETE). */
  executeDeleteUser(userId, auditCtx) {
    return this.deletion.executeDeleteUser(userId, auditCtx);
  }
}

module.exports = new AdminUserService();
module.exports.AdminUserService = AdminUserService;
