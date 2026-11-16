// shared/utils/mfa-status.util.ts
//
// Determina si un usuario tiene 2FA (MFA) activo. Se lee de BD (no del JWT) para
// que el gate surta efecto APENAS el usuario activa su MFA, sin necesidad de
// re-login.
//
// Fuente de verdad: totp_enabled || sms_mfa_enabled en la tabla `users`.

// Lazy require: el repositorio vive en modules/ (evita ciclos de carga al arrancar). SOLID: D.
interface MfaFlags {
  totp_enabled?: boolean | null;
  sms_mfa_enabled?: boolean | null;
}
const userRepository = (): { findMfaFlags(userId: string): Promise<MfaFlags | null> } =>
  require('../../modules/schemas/kyc/iam/repositories/user.repository');

/**
 * @param {string} userId
 * @returns {Promise<boolean>} true si el usuario tiene TOTP o SMS MFA activo
 */
async function isMfaActive(userId: string | null | undefined): Promise<boolean> {
  if (!userId) {
    return false;
  }
  const user = await userRepository().findMfaFlags(userId);
  if (!user) {
    return false;
  }
  return user.totp_enabled === true || user.sms_mfa_enabled === true;
}

export = { isMfaActive };
