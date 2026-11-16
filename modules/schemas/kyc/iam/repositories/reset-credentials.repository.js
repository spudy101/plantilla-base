const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { ResetCredentials } = require('../../../../../shared/models');
const requestContext = require('../../../../../shared/utils/request-context.util');
const { Op } = require('sequelize');

class ResetCredentialsRepository extends BaseRepository {
  constructor() {
    super(ResetCredentials);
  }

  /**
   * Busca un token válido (no usado y no expirado)
   * @param {string} token - Token a validar
   * @returns {Promise<ResetCredentials|null>}
   */
  findValidToken(token, options = {}) {
    return this.findOne(
      {
        token,
        used: false,
        expires_at: {
          [Op.gt]: new Date()
        }
      },
      options
    );
  }

  /**
   * Token válido con el usuario, su persona y el email de contacto
   * (lo necesario para aplicar el reset y notificar la confirmación).
   * @param {string} token
   * @returns {Promise<ResetCredentials|null>}
   */
  findValidTokenWithUser(token) {
    return this.findValidToken(token, {
      include: [
        {
          association: 'user',
          attributes: ['user_id', 'auth_username'],
          include: [
            {
              association: 'person',
              attributes: ['person_id', 'first_name'],
              include: [{ association: 'contact', attributes: ['email'] }]
            }
          ]
        }
      ]
    });
  }

  /**
   * Busca un token por su valor (sin validar expiración ni uso)
   * @param {string} token - Token a buscar
   * @returns {Promise<ResetCredentials|null>}
   */
  findByToken(token) {
    return this.findOne({ token });
  }

  /**
   * Marca un token como usado
   * @param {string} resetCredentialsId - ID del token
   * @param {object} options - Opciones de Sequelize (transaction, etc)
   * @returns {Promise<ResetCredentials>}
   */
  markAsUsed(resetCredentialsId, options = {}) {
    return this.update(
      resetCredentialsId,
      {
        used: true,
        used_at: new Date()
      },
      options
    );
  }

  /**
   * Invalida todos los tokens activos de un usuario
   * @param {string} userId - ID del usuario
   * @param {object} options - Opciones de Sequelize (transaction, etc)
   * @returns {Promise<number>} - Cantidad de tokens invalidados
   */
  async invalidateUserTokens(userId, options = {}) {
    const [affectedCount] = await this.bulkUpdate(
      {
        used: true,
        used_at: new Date()
      },
      {
        user_id: userId,
        used: false
      },
      options
    );

    return affectedCount;
  }

  /**
   * Crea un nuevo token de reset
   * @param {object} data - Datos del token { user_id, token, email, type, expires_at }
   * @param {object} options - Opciones de Sequelize (transaction, etc)
   * @returns {Promise<ResetCredentials>}
   */
  createResetToken(data, options = {}) {
    return this.create(
      {
        user_id: data.user_id,
        token: data.token,
        email: data.email,
        type: data.type,
        expires_at: data.expires_at,
        used: false,
        // Flujo NO autenticado: origin_session_id queda null siempre. El correlationId sí ata la fila al request.
        ...requestContext.originFromContext()
      },
      options
    );
  }

  /**
   * Limpia tokens expirados (útil para tareas de mantenimiento)
   * @param {object} options - Opciones de Sequelize (transaction, etc)
   * @returns {Promise<number>} - Cantidad de tokens eliminados
   */
  cleanExpiredTokens(options = {}) {
    return this.bulkDelete(
      {
        expires_at: {
          [Op.lt]: new Date() // Menor a fecha actual
        },
        used: true // Solo limpiar tokens ya usados
      },
      options
    );
  }

  /**
   * Cuenta tokens activos de un usuario por tipo
   * @param {string} userId - ID del usuario
   * @param {string} type - Tipo de token ('mfa' | 'password')
   * @returns {Promise<number>}
   */
  countActiveTokensByType(userId, type) {
    return this.count({
      user_id: userId,
      type,
      used: false,
      expires_at: {
        [Op.gt]: new Date()
      }
    });
  }

  // Override para usar reset_credentials_id
  findById(resetCredentialsId, options = {}) {
    return this.model.findByPk(resetCredentialsId, options);
  }

  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  delete(resetCredentialsId, options = {}) {
    return this.model.destroy({ where: { reset_credentials_id: resetCredentialsId }, ...options });
  }
}

module.exports = new ResetCredentialsRepository();
