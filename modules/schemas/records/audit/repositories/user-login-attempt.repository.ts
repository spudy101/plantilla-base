import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { UserLoginAttempt } = modelsModule;
import { Op } from 'sequelize';
import EncryptionUtil from '../../../../../shared/utils/encryption.util';
import HashUtil from '../../../../../shared/utils/hash.util';
import requestContext from '../../../../../shared/utils/request-context.util';
import type { CreateOptions } from 'sequelize';
import type defineUserLoginAttempt from '../models/user-login-attempt.model';

const MS_PER_MINUTE = 60 * 1000;

class UserLoginAttemptRepository extends BaseRepository<defineUserLoginAttempt.Instance> {
  constructor() {
    super(UserLoginAttempt);
  }

  static TIMEFRAMES = {
    BLOCK_WINDOW: 15, // minutos
    CLEANUP_DAYS: 90
  };

  recordAttempt(
    attemptData: Omit<defineUserLoginAttempt.CreationAttributes, 'national_id_hash' | 'attempted_at'>,
    options: CreateOptions<defineUserLoginAttempt.Attributes> = {}
  ) {
    const nationalId = attemptData.national_id;
    // Origen de la sesión: en los intentos FALLIDOS la sesión nunca llegó a existir y queda null.
    // En los EXITOSOS el llamador lo pasa explícito dentro de attemptData (el spread de abajo pisa
    // al de arriba): `POST /auth/login` es ruta pública, no pasa por AuthMiddleware.authenticate, así
    // que el AsyncLocalStorage no tiene el sessionId aunque la sesión ya se haya creado en memoria.
    return this.create(
      {
        ...requestContext.originFromContext(),
        ...attemptData,
        // Cifrar para almacenamiento seguro
        national_id: nationalId ? EncryptionUtil.encrypt(nationalId) : nationalId,
        // Hash para búsquedas futuras
        national_id_hash: nationalId ? HashUtil.hashForSearch(nationalId) : null,
        attempted_at: new Date()
      },
      options
    );
  }

  /**
   * Verifica si cuenta está bloqueada por national_id
   * Retorna null si no está bloqueada, o { blocked, blockedUntil, remainingMinutes }
   */
  async checkIfBlocked(nationalId: string) {
    const hash = HashUtil.hashForSearch(nationalId);

    const lastAttempt = await this.findOne({ national_id_hash: hash }, { order: [['attempted_at', 'DESC']] });

    if (!lastAttempt?.blocked_until) {
      return null;
    }

    const now = new Date();
    const blockedUntil = new Date(lastAttempt.blocked_until);

    if (blockedUntil > now) {
      return {
        blocked: true,
        blockedUntil,
        remainingMinutes: Math.ceil((blockedUntil.getTime() - now.getTime()) / MS_PER_MINUTE)
      };
    }

    return null;
  }

  /**
   * Cuenta intentos fallidos por national_id desde el último login exitoso
   */
  async countFailedAttempts(nationalId: string, minutes = UserLoginAttemptRepository.TIMEFRAMES.BLOCK_WINDOW) {
    const hash = HashUtil.hashForSearch(nationalId);
    const timeThreshold = new Date(Date.now() - minutes * MS_PER_MINUTE);

    const lastSuccess = await this.findOne(
      {
        national_id_hash: hash,
        success: true,
        attempted_at: { [Op.gte]: timeThreshold }
      },
      { order: [['attempted_at', 'DESC']] }
    );

    const countFrom = lastSuccess ? lastSuccess.attempted_at : timeThreshold;

    return this.count({
      national_id_hash: hash,
      success: false,
      attempted_at: { [Op.gt]: countFrom }
    });
  }

  /**
   * Obtiene último login exitoso
   */
  getLastSuccessfulLogin(userId: string) {
    return this.findOne({ user_id: userId, success: true }, { order: [['attempted_at', 'DESC']] });
  }

  /**
   * Cleanup job: elimina intentos antiguos
   */
  deleteOldAttempts(days = UserLoginAttemptRepository.TIMEFRAMES.CLEANUP_DAYS) {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.bulkDelete({ attempted_at: { [Op.lt]: threshold } });
  }

  /**
   * Cuenta logins exitosos de un usuario (sin límite de tiempo).
   * Se usa para detectar si es el primer acceso del usuario.
   * Nota: si el login actual ya fue insertado, un resultado <= 1 indica primer login.
   */
  countSuccessfulLogins(userId: string) {
    return this.count({
      user_id: userId,
      success: true
    });
  }
}

export default new UserLoginAttemptRepository();
