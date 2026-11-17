import type defineUser from '../../../../../schemas/kyc/iam/models/user.model';
import type defineUserChangeLog from '../../../../../schemas/records/audit/models/user-change-log.model';
import type { RequestAuditContext } from '../../../../../../shared/types/audit-context';
// modules/shared-endpoints/kyc/iam/services/mfa/mfa-account.ts
//
// Lecturas y bitácora compartidas por los servicios de MFA (TOTP, SMS y la fachada).
// Extraído de MFAService (SOLID: S).

import type { Transaction } from 'sequelize';
import userRepository from '../../../../../schemas/kyc/iam/repositories/user.repository';
import KycSharedUtil from '../../../../../schemas/kyc/person/utils/kyc-shared.util';
import AppError from '../../../../../../shared/utils/app-error.util';

class MfaAccount {
  userRepository: typeof userRepository;
  kycSharedUtil: typeof KycSharedUtil;

  /** @param {object} [deps] Dependencias inyectables (SOLID: D). */
  constructor(deps: MfaAccount.Deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.kycSharedUtil = deps.kycSharedUtil ?? KycSharedUtil;
  }

  /** Usuario con columnas de seguridad (hash, flags y secreto MFA), sin asociaciones. */
  async getUserSecure(userId: string) {
    const user = await this.userRepository.findById(userId, { include: [] });
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }

  /** Usuario con su teléfono principal (para el SMS MFA). */
  async getUserWithPhone(userId: string) {
    const user = await this.userRepository.findWithPrimaryPhone(userId);
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return user;
  }

  /** Verifica la contraseña actual o lanza 401. */
  async assertPassword(user: Pick<defineUser.Instance, 'password_hash'>, password: string) {
    const isPasswordValid = await this.userRepository.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw AppError.unauthorized('Contraseña incorrecta');
    }
  }

  /** Registra en user_change_logs un cambio de MFA hecho por el propio usuario. */
  recordChange(
    {
      userId,
      changeType,
      previousValue,
      newValue,
      changeReason,
      auditContext
    }: {
      userId: string;
      changeType: defineUserChangeLog.Attributes['change_type'];
      previousValue: string | null;
      newValue: string | null;
      changeReason: string;
      auditContext: RequestAuditContext;
    },
    transaction: Transaction
  ) {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MfaAccount {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    userRepository?: typeof userRepository;
    kycSharedUtil?: typeof KycSharedUtil;
  }
}

export default MfaAccount;
