// modules/schemas/kyc/helpers/internal-user.helper.js
//
// Orquesta la creación de un usuario interno (empleado): persona → contacto →
// user, dentro de una transacción. Centraliza la lógica para no duplicarla entre
// el CRUD admin y futuros flujos (p.ej. carga masiva de empleados).
//
// Reutiliza el mismo patrón que auth-register.service, pero sin política de
// privacidad ni notificaciones de bienvenida (no aplican a usuarios internos).

const { v4: uuidv4 } = require('uuid');

const userRepository = require('../repositories/user.repository');
const personRepository = require('../../person/repositories/person.repository');
const personContactRepository = require('../../person/repositories/person-contact.repository');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger } = require('../../../../../shared/utils/logger.util');
const requestContext = require('../../../../../shared/utils/request-context.util');
const unitOfWork = require('../../../../../shared/database/unit-of-work');

class InternalUserHelper {
  /**
   * Crea un usuario interno completo en BD.
   *
   * El caller (service) es responsable de validar unicidad de email/national_id
   * y de generar la contraseña temporal antes de invocar este helper.
   *
   * @param {Object} data
   * @param {string} data.email
   * @param {string} data.password    - contraseña temporal ya generada
   * @param {string} data.firstName
   * @param {string} [data.middleName]
   * @param {string} data.lastName
   * @param {string} [data.secondLastName]
   * @param {string} data.nationalId
   * @param {string} [data.documentTypeId]
   * @param {Object} data.role        - instancia/registro del rol { role_id, name }
   * @returns {Promise<{ user: Object, person: Object }>}
   */
  static async createInternalUser(data) {
    const authUsername = `staff_${uuidv4()}`;

    try {
      return await InternalUserHelper._createInDB({ ...data, authUsername });
    } catch (error) {
      if (error.isOperational) {
        throw error;
      }
      logger.error('createInternalUser — fallo al crear en BD', { error: error.message });
      throw AppError.internal('Error al crear el usuario interno. Intenta nuevamente');
    }
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  static async _createInDB(data) {
    const transaction = await unitOfWork.begin();
    try {
      const person = await personRepository.create(
        {
          first_name: data.firstName,
          middle_name: data.middleName || null,
          last_name: data.lastName,
          second_last_name: data.secondLastName || null,
          national_id: data.nationalId,
          document_type_id: data.documentTypeId || null,
          ...requestContext.originFromContext()
        },
        { transaction }
      );

      await personContactRepository.create(
        {
          person_id: person.person_id,
          email: data.email,
          email_verified_at: new Date(),
          ...requestContext.originFromContext()
        },
        { transaction }
      );

      const user = await userRepository.createWithPassword(
        {
          username: data.authUsername,
          auth_username: data.authUsername,
          password: data.password,
          person_id: person.person_id,
          role_id: data.role.role_id
        },
        { transaction }
      );

      await transaction.commit();
      logger.info('Usuario interno creado en BD', {
        userId: user.user_id,
        roleId: data.role.role_id
      });
      return { user, person };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = InternalUserHelper;
