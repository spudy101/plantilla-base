const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');
const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const personRepository = require('../../../../schemas/kyc/person/repositories/person.repository');
const personContactRepository = require('../../../../schemas/kyc/person/repositories/person-contact.repository');
const documentTypeRepository = require('../../../../schemas/kyc/maintainers/repositories/document-type.repository');
const resetCredentialsRepository = require('../../../../schemas/kyc/iam/repositories/reset-credentials.repository');
// eslint-disable-next-line max-len
const userNotificationPreferenceRepository = require('../../../../schemas/kyc/person/repositories/user-notification-preference.repository');
const countryRepository = require('../../../../schemas/kyc/maintainers/repositories/country.repository');
const privacyPolicyRepository = require('../../../../schemas/records/legal/repositories/privacy-policy.repository');
const consentRecorder = require('../../../../schemas/records/legal/services/consent-recorder.service');
const genderRepository = require('../../../../schemas/kyc/maintainers/repositories/gender.repository');
const verificationCodeRepository = require('../../../../schemas/notification/repositories/verification-code.repository');
const roleRepository = require('../../../../schemas/kyc/iam/repositories/role.repository');
const JwtUtil = require('../../../../../shared/utils/jwt.util');
const RefreshTokenStore = require('../../../../../shared/utils/refresh-token-store.util');
const KycSharedUtil = require('../../../../schemas/kyc/person/utils/kyc-shared.util');
const TokenBlacklistUtil = require('../../../../../shared/utils/token-blacklist.util');
const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util'); // ← logAudit agregado
const requestContext = require('../../../../../shared/utils/request-context.util');
const unitOfWork = require('../../../../../shared/database/unit-of-work');
const { RegisterResponseDTO } = require('../dtos/auth-register.dto');
const { frontend, SECURITY, RBAC_ROLES, server, notifications, jwt: jwtConfig } = require('../../../../../shared/constants');

// === RF-AUTH-01: Registro de Usuario (confirmación de correo y celular) ===

// ============================================================
// BYPASS DE AUTENTICACIÓN (solo desarrollo)
// ============================================================
const IS_BYPASS_ENABLED = server.nodeEnv === 'development' && server.bypass === 'true';
const API_KEY_RANDOM_BYTES = 32;

class AuthRegisterService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AuthRegisterService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.documentTypeRepository = deps.documentTypeRepository ?? documentTypeRepository;
    this.resetCredentialsRepository = deps.resetCredentialsRepository ?? resetCredentialsRepository;
    this.userNotificationPreferenceRepository = deps.userNotificationPreferenceRepository ?? userNotificationPreferenceRepository;
    this.countryRepository = deps.countryRepository ?? countryRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
    this.consentRecorder = deps.consentRecorder ?? consentRecorder;
    this.genderRepository = deps.genderRepository ?? genderRepository;
    this.verificationCodeRepository = deps.verificationCodeRepository ?? verificationCodeRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  // ============================================================
  // REGISTER
  // ============================================================

  async register(userData, auditContext = {}) {
    if (IS_BYPASS_ENABLED) {
      throw AppError.badRequest('[DEV] El registro no esta disponible en modo bypass...');
    }

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
  async _fetchRegistrationPrerequisites(email, documentTypeId) {
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
  async _createUserInDBWithRollback(data) {
    try {
      return await this._createUserInDB(data);
    } catch (error) {
      // La transacción interna de _createUserInDB ya revirtió cualquier escritura parcial;
      // aquí solo mapeamos el error a una respuesta operativa.
      if (error.isOperational) {
        throw error;
      }
      logger.error('_createUserInDB failed - error original', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        sql: error.sql ?? null,
        fields: error.fields ?? null,
        parent: error.parent?.message ?? null
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
  async _issueAuthTokens(userId, auditContext = {}) {
    const user = await this.userRepository.findByUserId(userId, 'login');

    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const accessToken = await JwtUtil.generateAccessToken(user, sessionId);
    const refreshToken = await JwtUtil.generateRefreshToken(userId, jti, sessionId);

    // JTI en Redis — awaited: si falla, el refresh no servirá pero el registro no se bloquea.
    const jtiSaved = await RefreshTokenStore.save(jti, userId);
    if (!jtiSaved) {
      logger.warn('No se pudo guardar JTI de refresh token en registro', { userId });
    }

    this.userSessionRepository
      .create({
        user_session_id: sessionId,
        user_id: userId,
        device_id: null,
        jti,
        ip_address: auditContext?.ip || null,
        user_agent: auditContext?.userAgent || null,
        started_at: new Date(),
        last_access_at: new Date()
      })
      .catch(err => logger.warn('Error creando registro de sesión en registro', { error: err.message, userId }));

    return { accessToken, refreshToken, expiresIn: jwtConfig.accessTokenExpiry };
  }

  /** @private */
  _sendWelcomeNotification(userId, nombre, email) {
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
  // RESET CREDENTIALS
  // ============================================================

  // [RF-AUTH-02] | CA-03 | Genera token de un solo uso (15 min), persiste y envía por email. Anti-enumeración
  async requestResetCredentials(data) {
    const { email, type } = data;

    const personContact = await this.personContactRepository.findByEmail(email, {
      include: [
        {
          association: 'person',
          include: [
            {
              association: 'user',
              attributes: ['user_id', 'is_active']
            }
          ],
          attributes: ['person_id', 'first_name']
        }
      ]
    });

    if (!personContact?.person?.user) {
      logger.info('Reset requested for non-existent email', { type });
      return false;
    }

    const { user } = personContact.person;

    if (!user.is_active) {
      logger.info('Reset requested for inactive user', { type });
      return false;
    }

    const invalidated = await this.resetCredentialsRepository.invalidateUserTokens(user.user_id);
    if (invalidated > 0) {
      logger.info('Previous reset tokens invalidated', {
        userId: user.user_id,
        count: invalidated,
        type
      });
    }

    const token = crypto.randomBytes(API_KEY_RANDOM_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + SECURITY.RESET_TOKEN_EXPIRATION_MINUTES * 60 * 1000);

    await this.resetCredentialsRepository.createResetToken({
      user_id: user.user_id,
      email,
      token,
      type,
      expires_at: expiresAt
    });

    logAudit(
      'CREDENTIALS_RESET_REQUESTED',
      user.user_id,
      { type },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    const firstName = personContact.person.first_name || 'Usuario';
    const resetUrl = `${frontend.resetCredentialUrl}-${type === 'password' ? 'password' : 'totp'}?token=${token}&type=${type}`;

    setImmediate(() => {
      this.NotificationUtil.crearNotificacionDirecta({
        tipoNotificacion: type === 'password' ? 'SOLICITUD_RESET_PASSWORD' : 'SOLICITUD_RESET_MFA',
        email,
        metadata: {
          nombre: firstName,
          email,
          enlace: resetUrl,
          minutosExpiracion: SECURITY.RESET_TOKEN_EXPIRATION_MINUTES,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err => logger.warn('Error sending reset notification', { error: err.message }));
    });

    logger.info('Reset credentials requested', { userId: user.user_id, type });
    return true;
  }

  // [RF-AUTH-02] | CA-03 | Valida token, aplica reset, marca used=true, invalida todas las sesiones
  async confirmResetCredentials(data) {
    const { token, newPassword, type } = data;

    const resetRecord = await this._findValidResetRecord(token);

    if (resetRecord.type !== type) {
      throw AppError.badRequest('Tipo de reset incorrecto');
    }

    const { user } = resetRecord;
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }

    const transaction = await this.unitOfWork.begin();
    try {
      const tipoNotif = await this._applyCredentialReset(type, user, newPassword, transaction);
      await this.resetCredentialsRepository.markAsUsed(resetRecord.reset_credentials_id, {
        transaction
      });
      await transaction.commit();
      logAudit(
        type === 'password' ? 'PASSWORD_RESET_CONFIRMED' : 'MFA_RESET_CONFIRMED',
        user.user_id,
        { type },
        { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
      );
      this._sendResetConfirmationNotification(user, tipoNotif);
      if (type === 'password') {
        this._invalidateSessionsAfterPasswordReset(user.user_id);
      }
      return null;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /** @private */
  async _findValidResetRecord(token) {
    const resetRecord = await this.resetCredentialsRepository.findValidToken(token, {
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
    if (!resetRecord) {
      throw AppError.badRequest('Token inválido o expirado');
    }
    return resetRecord;
  }

  /** @private */
  async _applyCredentialReset(type, user, newPassword, transaction) {
    if (type === 'password') {
      if (!newPassword) {
        throw AppError.badRequest('La nueva contraseña es requerida');
      }
      await this.userRepository.updatePassword(user.user_id, newPassword, { transaction });
      return 'RESET_PASSWORD';
    }

    if (type === 'mfa') {
      // Reset total del MFA: baja TOTP (y borra su secreto) y SMS, todo en BD propia.
      await this.userRepository.update(
        user.user_id,
        {
          totp_enabled: false,
          totp_secret: null,
          sms_mfa_enabled: false,
          preferred_mfa_method: 'none'
        },
        { transaction }
      );

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: null,
          changedByRole: 'system',
          changeType: 'mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'Reset de MFA por pérdida de dispositivo',
          ipAddress: null,
          userAgent: null
        },
        { transaction }
      );

      await KycSharedUtil.logChange(
        {
          userId: user.user_id,
          changedByUserId: null,
          changedByRole: 'system',
          changeType: 'sms_mfa_status',
          previousValue: 'enabled',
          newValue: 'disabled',
          changeReason: 'Reset de MFA por pérdida de dispositivo',
          ipAddress: null,
          userAgent: null
        },
        { transaction }
      );

      return 'RESET_MFA';
    }

    throw AppError.badRequest('Tipo de reset no soportado');
  }

  /** @private */
  _invalidateSessionsAfterPasswordReset(userId) {
    TokenBlacklistUtil.invalidateUserSessions(userId).catch(err =>
      logger.warn('Error invalidando sesiones en Redis tras reset de contraseña', {
        error: err.message,
        userId
      })
    );
    this.userSessionRepository.closeAllByUser(userId, 'password_reset').catch(err =>
      logger.warn('Error cerrando sesiones en BD tras reset de contraseña', {
        error: err.message,
        userId
      })
    );
  }

  /** @private */
  _sendResetConfirmationNotification(user, tipoNotificacion) {
    const firstName = user.person?.first_name || 'Usuario';
    const email = user.person?.contact?.email;
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion,
        userId: user.user_id,
        relatedEntity: null,
        metadata: { nombre: firstName, email, logoUrl: notifications.ses.logoUrl }
      }).catch(err =>
        logger.warn('Error sending reset confirmation notification', {
          error: err.message,
          userId: user.user_id
        })
      );
    });
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /** @private */
  // [RF-AUTH-01] | CA-01 | Valida unicidad de documento
  // y correo antes de crear el registro → 409 si existen.
  async _validateRegistration(email, nationalId, genderId) {
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
      const genderExists = await this.genderRepository.exists({ gender_id: genderId });
      if (!genderExists) {
        throw AppError.notFound('El género seleccionado no existe');
      }
    }
  }

  /** @private */
  async _createUserInDB(data) {
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
    },
    transaction
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

    const user = await this.userRepository.create(
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

    // [RF-AUTH-01] | CA-01 | Registra consentimientos en
    // user_consents: PRIVACY_POLICY (obligatorio) y
    // COMUNICACIONES_COMERCIALES (opcional).
    // RF-ADM-04: trazabilidad de aceptación inicial de política en user_consents
    await this._recordPrivacyPolicyConsent(
      user.user_id,
      privacyPolicyVersion,
      privacyPolicyAcceptedIp,
      transaction
    ).catch(err => {
      logger.warn('auth-register: no se pudo registrar user_consent de privacy policy', {
        userId: user.user_id,
        error: err.message
      });
      // La escritura es best-effort para no tumbar el registro por un fallo secundario, pero NO puede ser
      // silenciosa: la constancia ES el entregable del habeas data. `CONSENT_RECORD_FAILED` está en
      // AUDIT_ALERT_TRIGGER_ACTIONS → alerta inmediata. Queda el respaldo mínimo en
      // `users.privacy_policy_accepted_at/_ip`, pero la fila probatoria falta y hay que reponerla.
      logAudit(
        'CONSENT_RECORD_FAILED',
        user.user_id,
        { consentType: 'PRIVACY_POLICY', version: privacyPolicyVersion, error: err.message },
        {
          entityId: user.user_id,
          entityType: 'User',
          entityTable: 'users',
          outcome: 'failure',
          errorMessage: err.message
        }
      );
    });

    if (comunicacionesComerciales) {
      await this._recordComercialConsent(user.user_id, privacyPolicyAcceptedIp, transaction).catch(err =>
        logger.warn('auth-register: no se pudo registrar user_consent de comunicaciones comerciales', {
          userId: user.user_id,
          error: err.message
        })
      );
    }

    return { user, person, personContact, role: defaultRole };
  }

  /** @private — RF-ADM-04: delega en ConsentRecorder y deja traza granular vía logger (NO logAudit). */
  async _recordPrivacyPolicyConsent(userId, policyVersion, ip, transaction) {
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
  async _recordComercialConsent(userId, ip, transaction) {
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

module.exports = new AuthRegisterService();
module.exports.AuthRegisterService = AuthRegisterService;
