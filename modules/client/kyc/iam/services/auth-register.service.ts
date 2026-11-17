import type { RequestAuditContext } from '../../../../../shared/types/audit-context';
import type { Transaction } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import userRepository from '../../../../schemas/kyc/iam/repositories/user.repository';
import personRepository from '../../../../schemas/kyc/person/repositories/person.repository';
import personContactRepository from '../../../../schemas/kyc/person/repositories/person-contact.repository';
import documentTypeRepository from '../../../../schemas/kyc/maintainers/repositories/document-type.repository';
// eslint-disable-next-line max-len
import userNotificationPreferenceRepository from '../../../../schemas/kyc/person/repositories/user-notification-preference.repository';
import countryRepository from '../../../../schemas/kyc/maintainers/repositories/country.repository';
import privacyPolicyRepository from '../../../../schemas/records/legal/repositories/privacy-policy.repository';
import consentRecorder from '../../../../schemas/records/legal/services/consent-recorder.service';
import genderRepository from '../../../../schemas/kyc/maintainers/repositories/gender.repository';
import verificationCodeRepository from '../../../../schemas/notification/repositories/verification-code.repository';
import roleRepository from '../../../../schemas/kyc/iam/repositories/role.repository';
import userSessionRepository from '../../../../schemas/kyc/iam/repositories/user-session.repository';
import NotificationUtil from '../../../../schemas/notification/services/notification-creation.service';
import AppError from '../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import requestContext from '../../../../../shared/utils/request-context.util';
import unitOfWork from '../../../../../shared/database/unit-of-work';
import CredentialResetService from './auth-register/credential-reset.service';
import SessionIssuerService from '../../../../shared-endpoints/kyc/iam/services/auth-login/session-issuer.service';
import authRegisterDtoModule from '../dtos/auth-register.dto';
const { RegisterResponseDTO } = authRegisterDtoModule;
import constantsModule from '../../../../../shared/constants';
const { RBAC_ROLES, notifications } = constantsModule;
import errorMessageModule from '../../../../../shared/utils/error-message.util';

const { errorMessage, isOperationalError } = errorMessageModule;


// === RF-AUTH-01: Registro de Usuario (confirmación de correo y celular) ===

class AuthRegisterService {
  unitOfWork: typeof unitOfWork;
  userRepository: typeof userRepository;
  personRepository: typeof personRepository;
  personContactRepository: typeof personContactRepository;
  documentTypeRepository: typeof documentTypeRepository;
  userNotificationPreferenceRepository: typeof userNotificationPreferenceRepository;
  countryRepository: typeof countryRepository;
  privacyPolicyRepository: typeof privacyPolicyRepository;
  consentRecorder: typeof consentRecorder;
  genderRepository: typeof genderRepository;
  verificationCodeRepository: typeof verificationCodeRepository;
  roleRepository: typeof roleRepository;
  userSessionRepository: typeof userSessionRepository;
  NotificationUtil: typeof NotificationUtil;
  sessionIssuer: InstanceType<typeof SessionIssuerService>;
  credentialReset: InstanceType<typeof CredentialResetService>;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AuthRegisterService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: AuthRegisterService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.documentTypeRepository = deps.documentTypeRepository ?? documentTypeRepository;
    this.userNotificationPreferenceRepository = deps.userNotificationPreferenceRepository ?? userNotificationPreferenceRepository;
    this.countryRepository = deps.countryRepository ?? countryRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
    this.consentRecorder = deps.consentRecorder ?? consentRecorder;
    this.genderRepository = deps.genderRepository ?? genderRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;

    // Sub-servicios por responsabilidad (SOLID: S). Reciben las mismas dependencias compartidas.
    this.sessionIssuer =
      deps.sessionIssuer ?? new SessionIssuerService({ userSessionRepository: this.userSessionRepository });
    this.credentialReset =
      deps.credentialReset ??
      new CredentialResetService({
        unitOfWork: this.unitOfWork,
        userRepository: this.userRepository,
        personContactRepository: this.personContactRepository,
        userSessionRepository: this.userSessionRepository,
        NotificationUtil: this.NotificationUtil
      });
  }

  // ============================================================
  // REGISTER
  // ============================================================

  async register(userData: AuthRegisterService.RegisterInput, auditContext: Pick<RequestAuditContext, 'ip' | 'userAgent'> = {}) {
    const {
      email,
      password,
      firstName,
      middleName,
      lastName,
      secondLastName,
      nationalId,
      documentTypeId,
      genderId,
      birthDate,
      comunicacionesComerciales
    } = userData;

    const { colombia, privacyPolicyVersion, documentType } = await this._fetchRegistrationPrerequisites(email, documentTypeId);

    await this._validateRegistration(email, nationalId, genderId);

    // Handle interno estable del usuario (antes era el username de Cognito).
    const authUsername = `user_${uuidv4()}`;

    const dbResult = await this._createUserInDBWithRollback({
      email,
      password,
      firstName,
      middleName,
      lastName,
      secondLastName,
      nationalId,
      documentTypeId: documentType.document_type_id,
      genderId: genderId || null,
      countryId: colombia.country_id,
      authUsername,
      birthDate,
      // Política de privacidad — capturar en el momento exacto del registro
      privacyPolicyVersion,
      privacyPolicyAcceptedAt: new Date(),
      privacyPolicyAcceptedIp: auditContext?.ip || null,
      comunicacionesComerciales: comunicacionesComerciales === true
    });

    // [RF-AUTH-01] | CA-04 | Login automático post-registro. La 2FA es opt-in en el template base:
    // el usuario la activa cuando quiere desde /kyc/iam/mfa (TOTP o SMS); no se fuerza enrolamiento.
    // Un proyecto derivado que la quiera obligatoria puede gatear el acceso al dashboard aquí.
    // Los tokens de autorización los emite nuestro propio sistema (RS256).
    const tokens = await this._issueAuthTokens(dbResult.user.user_id, auditContext);

    logAudit(
      'USER_REGISTERED',
      dbResult.user.user_id,
      { nationalId },
      { entityId: dbResult.user.user_id, entityType: 'User', entityTable: 'users' }
    );

    setImmediate(() => {
      this.verificationCodeRepository
        .deleteVerifiedByContact('email', email)
        .catch(err => logger.warn('Error limpiando verification_code post-register', { error: err.message }));
    });

    this._sendWelcomeNotification(dbResult.user.user_id, firstName, email);

    return RegisterResponseDTO({ ...dbResult, tokens });
  }

  /** @private — valida prerequisitos de registro: país, política activa, email verificado y tipo de documento */
  async _fetchRegistrationPrerequisites(email: string, documentTypeId: string) {
    const [colombia, activePolicy] = await Promise.all([
      this.countryRepository.findByCode('COL'),
      this.privacyPolicyRepository.findActive()
    ]);

    if (!activePolicy) {
      throw AppError.internal('No hay una política de privacidad activa configurada. Contacta al administrador.');
    }
    if (!colombia) {
      throw AppError.internal('País de operación no configurado en BD. Contacta al administrador.');
    }

    // [RF-AUTH-01] | CA-02 | 🔄 MODIFICADO: el criterio
    // describe enlace de activación post-registro con TTL 24h.
    // Implementado como OTP previo al registro (TTL 15 min).
    // Efecto equivalente: no se crea la cuenta sin email
    // verificado. TTL reducido por criterio de seguridad.
    // Pendiente: actualizar SRS v12.1.
    const emailVerified = await this.verificationCodeRepository.findVerifiedByContact('email', email);
    if (!emailVerified) {
      throw AppError.forbidden('El email debe estar verificado antes de registrarse');
    }

    const documentType = await this.documentTypeRepository.findById(documentTypeId);
    if (!documentType || !documentType.is_active) {
      throw AppError.notFound('Tipo de documento no encontrado');
    }
    if (!documentType.is_visible_to_client) {
      throw AppError.forbidden('Tipo de documento no permitido para registro');
    }

    return { colombia, privacyPolicyVersion: activePolicy.version, documentType };
  }

  /** @private */
  async _createUserInDBWithRollback(data: AuthRegisterService.NewUserData) {
    try {
      return await this._createUserInDB(data);
    } catch (error) {
      // La transacción interna de _createUserInDB ya revirtió cualquier escritura parcial;
      // aquí solo mapeamos el error a una respuesta operativa.
      if (isOperationalError(error)) {
        throw error;
      }
      // Errores de Sequelize: se loguean sus campos de diagnóstico si vienen
      const dbError = (error ?? {}) as { stack?: string; name?: string; sql?: string; fields?: unknown; parent?: { message?: string } };
      logger.error('_createUserInDB failed - error original', {
        message: errorMessage(error),
        stack: dbError.stack,
        name: dbError.name,
        sql: dbError.sql ?? null,
        fields: dbError.fields ?? null,
        parent: dbError.parent?.message ?? null
      });
      throw AppError.internal('Error al crear usuario. Intenta nuevamente');
    }
  }

  /**
   * Login automático post-registro: emite el par de tokens RS256 propios y crea la
   * sesión activa en BD (igual que _completeSuccessfulLogin del login por contraseña).
   * Recarga el usuario con rol/persona para que el access token lleve todos los claims.
   *
   * @private
   */
  async _issueAuthTokens(userId: string, auditContext: Pick<RequestAuditContext, 'ip' | 'userAgent'> = {}) {
    const user = await this.userRepository.findByUserId(userId, 'login');
    if (!user) {
      throw AppError.internal('Usuario recién creado no encontrado');
    }
    const { tokens } = await this.sessionIssuer.issue(user, {
      ip: auditContext?.ip,
      userAgent: auditContext?.userAgent,
      source: 'registro'
    });
    return tokens;
  }

  /** @private */
  _sendWelcomeNotification(userId: string, nombre: string, email: string) {
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'BIENVENIDA',
        userId,
        relatedEntity: null,
        metadata: { nombre, email, logoUrl: notifications.ses.logoUrl }
      }).catch(err => logger.warn('Error sending welcome notification', { error: err.message, userId }));
    });
  }

  // ============================================================
  // RESET CREDENTIALS → CredentialResetService
  // ============================================================

  requestResetCredentials(data: Parameters<AuthRegisterService['credentialReset']['requestResetCredentials']>[0]) {
    return this.credentialReset.requestResetCredentials(data);
  }

  confirmResetCredentials(data: Parameters<AuthRegisterService['credentialReset']['confirmResetCredentials']>[0]) {
    return this.credentialReset.confirmResetCredentials(data);
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  // [RF-AUTH-01] | CA-01 | Valida unicidad de documento
  // y correo antes de crear el registro → 409 si existen.
  async _validateRegistration(email: string, nationalId: string, genderId: string | null | undefined) {
    const [existingContact, existingPerson] = await Promise.all([
      this.personContactRepository.findByEmail(email),
      this.personRepository.findByNationalId(nationalId)
    ]);

    if (existingContact) {
      throw AppError.conflict('El email ya está registrado');
    }
    if (existingPerson) {
      throw AppError.conflict('El número de documento ya está registrado');
    }
    if (genderId) {
      const genderExists = await this.genderRepository.exists({ genderId });
      if (!genderExists) {
        throw AppError.notFound('El género seleccionado no existe');
      }
    }
  }

  /** @private */
  async _createUserInDB(data: AuthRegisterService.NewUserData) {
    const transaction = await this.unitOfWork.begin();
    try {
      const result = await this._createAllEntities(data, transaction);
      await transaction.commit();
      logger.info('User created in DB', {
        userId: result.user.user_id,
        roleId: result.role.role_id
      });
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** @private */
  // Creación transaccional: Person → PersonContact → User (rol CLIENTE).
  // El usuario inicia onboarding con rol base; la promoción a un rol verificado
  // es responsabilidad del flujo de verificación que definas en tu dominio.
  async _createAllEntities(
    {
      email,
      firstName,
      middleName,
      lastName,
      secondLastName,
      nationalId,
      documentTypeId,
      genderId,
      countryId,
      birthDate,
      password,
      authUsername,
      privacyPolicyVersion,
      privacyPolicyAcceptedAt,
      privacyPolicyAcceptedIp,
      comunicacionesComerciales
    }: AuthRegisterService.NewUserData,
    transaction: Transaction
  ) {
    const defaultRole = await this.roleRepository.findByName(RBAC_ROLES.CLIENTE, { transaction });
    if (!defaultRole) {
      throw AppError.internal(`Rol ${RBAC_ROLES.CLIENTE} no encontrado en BD. Ejecuta el seeder RBAC.`);
    }

    const person = await this.personRepository.create(
      {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        second_last_name: secondLastName,
        national_id: nationalId,
        document_type_id: documentTypeId,
        gender_id: genderId || null,
        country_id: countryId || null,
        birth_date: birthDate,
        // Registro público: no hay sesión todavía, queda null. El correlationId ata las tres filas
        // (person + contact + preferencias) al mismo request de alta.
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    const personContact = await this.personContactRepository.create(
      {
        person_id: person.person_id,
        email,
        // [RF-AUTH-01] | CA-02 | Sella verificación de correo
        // al crear la cuenta.
        email_verified_at: new Date(),
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    const user = await this.userRepository.createWithPassword(
      {
        username: authUsername,
        auth_username: authUsername,
        password,
        person_id: person.person_id,
        role_id: defaultRole.role_id,
        // Política de privacidad
        privacy_policy_version: privacyPolicyVersion,
        privacy_policy_accepted_at: privacyPolicyAcceptedAt,
        privacy_policy_accepted_ip: privacyPolicyAcceptedIp
      },
      { transaction }
    );

    await this.userNotificationPreferenceRepository.create(
      {
        user_id: user.user_id,
        notification_category_code: null,
        allow_push: true,
        allow_email: true,
        allow_sms: true,
        quiet_hours_start: null,
        quiet_hours_end: null,
        ...requestContext.originFromContext()
      },
      { transaction }
    );

    await this._recordRegistrationConsents(
      user.user_id,
      { privacyPolicyVersion, privacyPolicyAcceptedIp, comunicacionesComerciales },
      transaction
    );

    return { user, person, personContact, role: defaultRole };
  }

  /**
   * [RF-AUTH-01] | CA-01 | Registra consentimientos en user_consents: PRIVACY_POLICY (obligatorio)
   * y COMUNICACIONES_COMERCIALES (opcional). RF-ADM-04: trazabilidad de la aceptación inicial.
   * @private
   */
  async _recordRegistrationConsents(
    userId: string,
    consentData: Pick<AuthRegisterService.NewUserData, 'privacyPolicyVersion' | 'privacyPolicyAcceptedIp' | 'comunicacionesComerciales'>,
    transaction: Transaction
  ) {
    const { privacyPolicyVersion, privacyPolicyAcceptedIp, comunicacionesComerciales } = consentData;
    await this._recordPrivacyPolicyConsent(
      userId,
      privacyPolicyVersion,
      privacyPolicyAcceptedIp,
      transaction
    ).catch(err => {
      logger.warn('auth-register: no se pudo registrar user_consent de privacy policy', {
        userId,
        error: err.message
      });
      // La escritura es best-effort para no tumbar el registro por un fallo secundario, pero NO puede ser
      // silenciosa: la constancia ES el entregable del habeas data. `CONSENT_RECORD_FAILED` está en
      // AUDIT_ALERT_TRIGGER_ACTIONS → alerta inmediata. Queda el respaldo mínimo en
      // `users.privacy_policy_accepted_at/_ip`, pero la fila probatoria falta y hay que reponerla.
      logAudit(
        'CONSENT_RECORD_FAILED',
        userId,
        { consentType: 'PRIVACY_POLICY', version: privacyPolicyVersion, error: err.message },
        {
          entityId: userId,
          entityType: 'User',
          entityTable: 'users',
          outcome: 'failure',
          errorMessage: err.message
        }
      );
    });

    if (comunicacionesComerciales) {
      await this._recordComercialConsent(userId, privacyPolicyAcceptedIp, transaction).catch(err =>
        logger.warn('auth-register: no se pudo registrar user_consent de comunicaciones comerciales', {
          userId,
          error: err.message
        })
      );
    }
  }

  /** @private — RF-ADM-04: delega en ConsentRecorder y deja traza granular vía logger (NO logAudit). */
  async _recordPrivacyPolicyConsent(userId: string, policyVersion: string, ip: string | null, transaction: Transaction) {
    const record = await this.consentRecorder.grantPrivacyPolicy({ userId, ip, transaction });
    if (!record) {
      return;
    }
    // El único logAudit de este punto de entrada es USER_REGISTERED — un segundo logAudit duplicaría el request.
    logger.info('Consentimiento de política de privacidad otorgado en registro', {
      userId,
      policyVersion,
      userConsentId: record?.user_consent_id
    });
  }

  /** @private — comunicaciones comerciales (opcional en el registro). */
  async _recordComercialConsent(userId: string, ip: string | null, transaction: Transaction) {
    const record = await this.consentRecorder.grantCommercialCommunications({ userId, ip, transaction });
    if (!record) {
      return;
    }
    logger.info('Consentimiento de comunicaciones comerciales otorgado en registro', {
      userId,
      userConsentId: record?.user_consent_id
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AuthRegisterService {
  /** Body de POST /auth/register (validado por AuthRegisterValidator). */
  export interface RegisterInput {
    email: string;
    password: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    secondLastName?: string | null;
    nationalId: string;
    documentTypeId: string;
    genderId?: string | null;
    birthDate?: string | null;
    comunicacionesComerciales?: boolean;
  }

  /** Lo que se persiste: el body + lo que resuelve el registro (país, handle, política). */
  export interface NewUserData extends Omit<RegisterInput, 'comunicacionesComerciales'> {
    countryId: string;
    authUsername: string;
    privacyPolicyVersion: string;
    privacyPolicyAcceptedAt: Date;
    privacyPolicyAcceptedIp: string | null;
    comunicacionesComerciales: boolean;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    sessionIssuer?: InstanceType<typeof SessionIssuerService>;
    credentialReset?: InstanceType<typeof CredentialResetService>;
    unitOfWork?: typeof unitOfWork;
    userRepository?: typeof userRepository;
    personRepository?: typeof personRepository;
    personContactRepository?: typeof personContactRepository;
    documentTypeRepository?: typeof documentTypeRepository;
    userNotificationPreferenceRepository?: typeof userNotificationPreferenceRepository;
    countryRepository?: typeof countryRepository;
    privacyPolicyRepository?: typeof privacyPolicyRepository;
    consentRecorder?: typeof consentRecorder;
    genderRepository?: typeof genderRepository;
    verificationCodeRepository?: typeof verificationCodeRepository;
    roleRepository?: typeof roleRepository;
    userSessionRepository?: typeof userSessionRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export default Object.assign(new AuthRegisterService(), { AuthRegisterService });
