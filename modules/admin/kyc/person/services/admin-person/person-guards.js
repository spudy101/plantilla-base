// modules/admin/kyc/person/services/admin-person/person-guards.js
//
// Reglas de negocio compartidas por los servicios de administración de personas.
const AppError = require('../../../../../../shared/utils/app-error.util');

/**
 * Bloquea toda operación de escritura sobre una cuenta eliminada (deleted_at != null).
 * Las cuentas eliminadas son intocables: no se reactivan, no cambian de rol, no se editan, etc.
 * @param {object|null} user
 */
function assertNotDeleted(user) {
  if (user?.deleted_at) {
    throw AppError.conflict('La cuenta está eliminada y no admite modificaciones', { code: 'USER_DELETED' });
  }
}

module.exports = { assertNotDeleted };
