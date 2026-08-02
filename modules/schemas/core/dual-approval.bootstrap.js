// Bootstrap de handlers del framework de doble aprobación (IoC).
//
// Cada operación gateada registra aquí su "reanudación": la función que ejecuta la acción REAL
// cuando un segundo funcionario aprueba la solicitud. El handler y el controller "normal" delegan
// en el MISMO método de service → la lógica de negocio no se duplica; solo hay dos puntos de
// entrada (ejecución directa cuando no se gatea, vs. ejecución tras aprobación).
//
// Se llama UNA vez al arranque desde shared/base/base.server.js.

const { logger } = require('../../../shared/utils/logger.util');
const DualApproval = require('./services/dual-approval.service');

const AdminUserService = require('../../admin/kyc/iam/services/admin-user.service');
const PersonService = require('../../admin/kyc/person/services/admin-person.service');

function registerDualApprovalHandlers() {
  // RBAC — cambio de rol de usuario interno. Reanuda con executeChangeRole (no re-gatea).
  DualApproval.register('RBAC_ROLE_CHANGE', (payload, ctx) =>
    AdminUserService.executeChangeRole(payload.userId, payload.roleId, ctx)
  );

  // KYC — eliminación de cuenta de cliente (ofuscación irreversible). La contraseña del maker
  // ya se validó al originar la solicitud; el handler solo ejecuta la eliminación real.
  DualApproval.register('CLIENT_ACCOUNT_DELETE', (payload, ctx) => PersonService.executeDeleteAccount(payload.userId, ctx));

  // IAM — eliminación de usuario interno (ofuscación irreversible).
  DualApproval.register('INTERNAL_USER_DELETE', (payload, ctx) => AdminUserService.executeDeleteUser(payload.userId, ctx));

  logger.info('✅ DualApproval handlers registrados');
}

module.exports = { registerDualApprovalHandlers };
