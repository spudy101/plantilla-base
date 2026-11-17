import type defineUser from '../../../../../schemas/kyc/iam/models/user.model';
// modules/admin/kyc/person/services/admin-person/person-creation.service.ts
//
// Alta de cuentas de cliente desde el panel admin (persona + contacto + usuario
// en una transacción) y notificaciones de bienvenida. Extraído de PersonService (SOLID: S).

import type { Transaction } from 'sequelize';
import type { AdminAuditContext } from '../../../../../../shared/types/audit-context';
import { v4 as uuidv4 } from 'uuid';
import unitOfWork from '../../../../../../shared/database/unit-of-work';
import userRepository from '../../../../../schemas/kyc/iam/repositories/user.repository';
import personRepository from '../../../../../schemas/kyc/person/repositories/person.repository';
import personContactRepository from '../../../../../schemas/kyc/person/repositories/person-contact.repository';
import roleRepository from '../../../../../schemas/kyc/iam/repositories/role.repository';
import KycSharedUtil from '../../../../../schemas/kyc/person/utils/kyc-shared.util';
import NotificationUtil from '../../../../../schemas/notification/services/notification-creation.service';
import AppError from '../../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import requestContext from '../../../../../../shared/utils/request-context.util';
import ProfileHelper from '../../../../../schemas/kyc/person/helpers/profile.helper';
import constantsModule from '../../../../../../shared/constants';
const { notifications, RBAC_ROLES } = constantsModule;

import adminPersonDtoModule from '../../dtos/admin-person.dto';
const { CreateUserDTO } = adminPersonDtoModule;

class PersonCreationService {
  unitOfWork: typeof unitOfWork;
  profileHelper: typeof ProfileHelper;
  userRepository: typeof userRepository;
  personRepository: typeof personRepository;
  personContactRepository: typeof personContactRepository;
  roleRepository: typeof roleRepository;
  NotificationUtil: typeof NotificationUtil;

  /**
   * @param {object} [deps] Dependencias inyectables (SOLID: D). Las provee la fachada
   *   PersonService; por defecto se usan las implementaciones reales.
   */
  constructor(deps: PersonCreationService.Deps = {}) {
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

  async create(userData: PersonCreationService.CreateInput, auditContext: AdminAuditContext) {
    const { role, user, temporaryPassword } = await this.unitOfWork.run(async transaction => {
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
      return { role, user, temporaryPassword };
    });

    // Después del commit: un error acá ya no intenta revertir la transacción confirmada
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
    if (!fullUser) {
      throw AppError.internal('Usuario recién creado no encontrado');
    }
    return CreateUserDTO(fullUser, temporaryPassword);
  }

  /** @private */
  async _createDbRecords(
    userData: PersonCreationService.CreateInput,
    authUsername: string,
    temporaryPassword: string,
    roleId: string,
    transaction: Transaction
  ) {
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
  _sendCreateNotifications(userData: PersonCreationService.CreateInput, user: Pick<defineUser.Instance, 'user_id'>, auditContext: AdminAuditContext, temporaryPassword: string) {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PersonCreationService {
  /** Alta de cliente desde el panel admin (body validado por PersonValidator.create). */
  export interface CreateInput {
    email: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    secondLastName?: string | null;
    nationalId: string;
    documentTypeId?: string | null;
    genderId?: string | null;
    countryId?: string | null;
    birthDate?: string | null;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    profileHelper?: typeof ProfileHelper;
    userRepository?: typeof userRepository;
    personRepository?: typeof personRepository;
    personContactRepository?: typeof personContactRepository;
    roleRepository?: typeof roleRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export default PersonCreationService;
