// modules/shared-endpoints/kyc/iam/services/mfa/mfa-account.js
//
// Lecturas y bitácora compartidas por los servicios de MFA (TOTP, SMS y la fachada).
// Extraído de MFAService (SOLID: S).

const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const KycSharedUtil = require('../../../../../schemas/kyc/person/utils/kyc-shared.util');
const AppError = require('../../../../../../shared/utils/app-error.util');

class MfaAccount {
  /** @param {object} [deps] Dependencias inyectables (SOLID: D). */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.kycSharedUtil = deps.kycSharedUtil ?? KycSharedUtil;
  }

  /** Usuario con columnas de seguridad (hash, flags y secreto MFA), sin asociaciones. */
  async getUserSecure(userId) {
    const user = await this.userRepository.findById(userId, { include: [] });
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }

  /** Usuario con su teléfono principal (para el SMS MFA). */
  async getUserWithPhone(userId) {
    const user = await this.userRepository.findWithPrimaryPhone(userId);
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }

  /** Verifica la contraseña actual o lanza 401. */
  async assertPassword(user, password) {
    const isPasswordValid = await this.userRepository.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Contraseña incorrecta');
    }
  }

  /** Registra en user_change_logs un cambio de MFA hecho por el propio usuario. */
  recordChange({ userId, changeType, previousValue, newValue, changeReason, auditContext }, transaction) {
    return this.kycSharedUtil.logChange(
      {
        userId,
        changedByUserId: userId,
        changedByRole: 'user',
        changeType,
        previousValue,
        newValue,
        changeReason,
        ipAddress: auditContext.ip,
        userAgent: auditContext.userAgent
      },
      { transaction }
    );
  }
}

module.exports = MfaAccount;
