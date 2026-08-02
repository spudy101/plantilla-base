// shared/utils/mfa-status.util.js
//
// Determina si un usuario tiene 2FA (MFA) activo. Se lee de BD (no del JWT) para
// que el gate surta efecto APENAS el usuario activa su MFA, sin necesidad de
// re-login.
//
// Fuente de verdad: totp_enabled || sms_mfa_enabled en la tabla `users`.

const { User } = require('../models');

/**
 * @param {string} userId
 * @returns {Promise<boolean>} true si el usuario tiene TOTP o SMS MFA activo
 */
async function isMfaActive(userId) {
  if (!userId) {
    return false;
  }
  const user = await User.findOne({
    where: { user_id: userId },
    attributes: ['totp_enabled', 'sms_mfa_enabled']
  });
  if (!user) {
    return false;
  }
  return user.totp_enabled === true || user.sms_mfa_enabled === true;
}

module.exports = { isMfaActive };
