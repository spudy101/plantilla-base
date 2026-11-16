// modules/admin/kyc/person/services/admin-person/person-creation.service.js
//
// Alta de cuentas de cliente desde el panel admin (persona + contacto + usuario
// en una transacción) y notificaciones de bienvenida. Extraído de PersonService (SOLID: S).

const { v4: uuidv4 } = require('uuid');
const unitOfWork = require('../../../../../../shared/database/unit-of-work');
const userRepository = require('../../../../../schemas/kyc/iam/repositories/user.repository');
const personRepository = require('../../../../../schemas/kyc/person/repositories/person.repository');
const personContactRepository = require('../../../../../schemas/kyc/person/repositories/person-contact.repository');
const roleRepository = require('../../../../../schemas/kyc/iam/repositories/role.repository');
const KycSharedUtil = require('../../../../../schemas/kyc/person/utils/kyc-shared.util');
const NotificationUtil = require('../../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../../shared/utils/logger.util');
const requestContext = require('../../../../../../shared/utils/request-context.util');
const ProfileHelper = require('../../../../../schemas/kyc/person/helpers/profile.helper');
const { notifications, RBAC_ROLES } = require('../../../../../../shared/constants');

const { CreateUserDTO } = require('../../dtos/admin-person.dto');

class PersonCreationService {
  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.profileHelper = deps.profileHelper ?? ProfileHelper;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  // ============================================================
  // CREACIÓN
  // ============================================================

  async create(userData, auditContext) {
    const transaction = await this.unitOfWork.begin();
    let transactionFinished = false;

    try {
      const role = await this.roleRepository.findByName(RBAC_ROLES.CLIENTE);
      if (!role) {
        throw AppError.internal(`Rol ${RBAC_ROLES.CLIENTE} no configurado. Ejecuta el seeder RBAC.`);
      }

      KycSharedUtil.validateNationalIdByRole(userData.nationalId, role);
      await this.profileHelper.validateNationalIdUnique(userData.nationalId);
      await this.profileHelper.validateEmailUnique(userData.email);

      const temporaryPassword = KycSharedUtil.generateSecurePassword();
      const authUsername = `user_${uuidv4()}`;

      const user = await this._createDbRecords(userData, authUsername, temporaryPassword, role.role_id, transaction);

      await transaction.commit();
      transactionFinished = true;

      logAudit(
        'PERSON_CREATED',
        auditContext.adminUserId,
        {
          roleId: role.role_id,
          roleName: role.name
        },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
      );

      setImmediate(() => this._sendCreateNotifications(userData, user, auditContext, temporaryPassword));

      const fullUser = await this.userRepository.findByUserId(user.user_id, 'full');
      return CreateUserDTO(fullUser, temporaryPassword);
    } catch (error) {
      if (!transactionFinished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /** @private */
  async _createDbRecords(userData, authUsername, temporaryPassword, roleId, transaction) {
    const person = await this.personRepository.create(
      {
        first_name: userData.firstName,
        middle_name: userData.middleName || null,
        last_name: userData.lastName,
        second_last_name: userData.secondLastName || null,
        national_id: userData.nationalId,
        birth_date: userData.birthDate || null,
        gender_id: userData.genderId || null,
        country_id: userData.countryId || null,
        document_type_id: userData.documentTypeId || null,
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    await this.personContactRepository.create(
      {
        person_id: person.person_id,
        email: userData.email,
        email_verified_at: new Date(),
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    return this.userRepository.createWithPassword(
      {
        username: authUsername,
        auth_username: authUsername,
        person_id: person.person_id,
        role_id: roleId,
        password: temporaryPassword
      },
      { transaction }
    );
  }

  /** @private */
  _sendCreateNotifications(userData, user, auditContext, temporaryPassword) {
    this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'USUARIO_CREADO_ADMIN',
      userId: user.user_id,
      relatedEntity: null,
      metadata: {
        nombre: userData.firstName,
        email: userData.email,
        passwordTemporal: temporaryPassword,
        logoUrl: notifications.ses.logoUrl
      }
    }).catch(err => logger.warn('Error sending welcome notification', { error: err.message }));

    this.NotificationUtil.crearNotificacion({
      tipoNotificacion: 'PERSON_ADMIN_ACTION',
      userId: auditContext.adminUserId,
      relatedEntity: null,
      metadata: {
        nombre: auditContext.adminFirstName,
        accion: 'crear',
        userId: user.user_id,
        logoUrl: notifications.ses.logoUrl
      }
    }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
  }
}

module.exports = PersonCreationService;
