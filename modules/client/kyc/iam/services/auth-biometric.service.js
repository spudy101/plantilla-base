const crypto = require('node:crypto');

const userRepository = require('../../../../schemas/kyc/iam/repositories/user.repository');
const userLoginAttemptRepository = require('../../../../schemas/records/audit/repositories/user-login-attempt.repository');
const trustedDeviceRepository = require('../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository');
const privacyPolicyRepository = require('../../../../schemas/records/legal/repositories/privacy-policy.repository');
const consentRecorder = require('../../../../schemas/records/legal/services/consent-recorder.service');
const {
  biometricCredentialRepository,
  biometricChallengeRepository
} = require('../../../../schemas/kyc/iam/repositories/biometric.repository');
const JwtUtil = require('../../../../../shared/utils/jwt.util');
const RefreshTokenStore = require('../../../../../shared/utils/refresh-token-store.util');
const userSessionRepository = require('../../../../schemas/kyc/iam/repositories/user-session.repository');
const SessionControlService = require('../../../../shared-endpoints/kyc/iam/services/auth-login/session-control.service');
const NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const { INTERNAL_ROLE_NAMES, notifications, jwt: jwtConfig } = require('../../../../../shared/constants');
const {
  BiometricRegisterStartDTO,
  BiometricRegisterFinishDTO,
  BiometricLoginStartDTO,
  BiometricCredentialListDTO
} = require('../dtos/auth-biometric.dto');
const { LoginResponseDTO, PolicyUpdateRequiredDTO } = require('../../../../shared-endpoints/kyc/iam/dtos/auth-login.dto');

// ============================================================
// CONSTANTES
// ============================================================

// ES256 = ECDSA con P-256 y SHA-256
const SUPPORTED_ALGORITHM = -7;

// Tamaños de bytes para criptografía ES256 / P-256
const CHALLENGE_BYTES = 32; // bytes para crypto.randomBytes
const ES256_RAW_SIGNATURE_LEN = 64; // firma raw r||s: 32 bytes r + 32 bytes s
const ES256_COMPONENT_LEN = 32; // longitud de r y s individualmente
const DER_POSITIVE_PAD = 0x80; // bit MSB: si está activo, el entero es negativo en DER
const DER_INTEGER_TAG = 0x02; // tag ASN.1 INTEGER
const DER_SEQUENCE_TAG = 0x30; // tag ASN.1 SEQUENCE
const PEM_LINE_LENGTH = 64; // caracteres por línea en PEM

class AuthBiometricService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AuthBiometricService({ userRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.userRepository = deps.userRepository ?? userRepository;
    this.userLoginAttemptRepository = deps.userLoginAttemptRepository ?? userLoginAttemptRepository;
    this.trustedDeviceRepository = deps.trustedDeviceRepository ?? trustedDeviceRepository;
    this.privacyPolicyRepository = deps.privacyPolicyRepository ?? privacyPolicyRepository;
    this.consentRecorder = deps.consentRecorder ?? consentRecorder;
    this.biometricCredentialRepository = deps.biometricCredentialRepository ?? biometricCredentialRepository;
    this.biometricChallengeRepository = deps.biometricChallengeRepository ?? biometricChallengeRepository;
    this.userSessionRepository = deps.userSessionRepository ?? userSessionRepository;
    // Misma política de sesiones que el login por contraseña (una por dispositivo + límite simultáneo)
    this.sessionControl =
      deps.sessionControl ?? new SessionControlService({ userSessionRepository: this.userSessionRepository });
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  // ============================================================
  // REGISTER
  // ============================================================

  /**
   * Genera un challenge para el registro de huella.
   * Solo desde dispositivos TRUSTED.
   *
   * @returns {Promise<BiometricRegisterStartDTO>}
   */
  async registerStart(userId, fingerprintHash) {
    // Verificar que el dispositivo actual es TRUSTED
    const device = await this.trustedDeviceRepository.findByFingerprint(userId, fingerprintHash);
    if (!device || device.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes registrar una huella desde un dispositivo de confianza');
    }

    // Verificar que el dispositivo no tiene ya una credencial activa
    const existing = await this.biometricCredentialRepository.findByUserAndDevice(userId, device.user_trusted_device_id);
    if (existing) {
      throw AppError.conflict('Este dispositivo ya tiene una huella registrada. Elimínala primero.');
    }

    const challenge = crypto.randomBytes(CHALLENGE_BYTES).toString('base64url');

    await this.biometricChallengeRepository.create({
      user_id: userId,
      challenge,
      type: 'registration'
    });

    logAudit(
      'BIOMETRIC_REGISTER_START',
      userId,
      {},
      { entityId: device.user_trusted_device_id, entityType: 'UserTrustedDevice', entityTable: 'user_trusted_devices' }
    );

    return BiometricRegisterStartDTO({
      challenge,
      deviceId: device.user_trusted_device_id,
      algorithm: SUPPORTED_ALGORITHM
    });
  }

  /**
   * Recibe la llave pública del dispositivo y registra la credencial.
   *
   * El dispositivo móvil debe enviar:
   *   - credentialId: string (base64url) — ID único generado por el dispositivo
   *   - publicKey:    string (base64url o PEM) — llave pública ES256
   *   - challenge:    string — el mismo challenge que recibió en registerStart
   *   - signature:    string (base64url) — firma del challenge con la llave privada
   *
   * @returns {Promise<BiometricRegisterFinishDTO>}
   */
  async registerFinish({ credentialId, publicKey, challenge, signature }, userId, fingerprintHash) {
    // Verificar dispositivo TRUSTED
    const device = await this.trustedDeviceRepository.findByFingerprint(userId, fingerprintHash);
    if (!device || device.status !== 'trusted') {
      throw AppError.forbidden('Solo puedes registrar una huella desde un dispositivo de confianza');
    }

    // Verificar y consumir el challenge
    const challengeRecord = await this.biometricChallengeRepository.findValid(challenge);
    if (!challengeRecord) {
      throw AppError.badRequest('Challenge inválido, expirado o ya utilizado');
    }
    if (challengeRecord.user_id !== userId) {
      throw AppError.forbidden('El challenge no pertenece a este usuario');
    }
    if (challengeRecord.type !== 'registration') {
      throw AppError.badRequest('Tipo de challenge incorrecto');
    }

    // Marcar como usado ANTES de verificar la firma — evita race conditions
    await this.biometricChallengeRepository.markAsUsed(challengeRecord.challenge_id);

    // Verificar la firma ES256
    const isValid = this._verifySignature({ publicKey, challenge, signature });
    if (!isValid) {
      logAudit(
        'BIOMETRIC_REGISTER_INVALID_SIGNATURE',
        userId,
        {},
        {
          entityId: device.user_trusted_device_id,
          entityType: 'UserTrustedDevice',
          entityTable: 'user_trusted_devices',
          outcome: 'failure'
        }
      );
      throw AppError.unauthorized('Firma biométrica inválida');
    }

    // Verificar que el credentialId no esté ya registrado
    const existingCred = await this.biometricCredentialRepository.findByCredentialId(credentialId);
    if (existingCred) {
      throw AppError.conflict('Esta credencial biométrica ya está registrada');
    }

    // Guardar la credencial
    const credential = await this.biometricCredentialRepository.create({
      user_id: userId,
      user_trusted_device_id: device.user_trusted_device_id,
      credential_id: credentialId,
      public_key: publicKey,
      sign_count: 0
    });

    logAudit(
      'BIOMETRIC_REGISTER_SUCCESS',
      userId,
      {
        deviceId: device.user_trusted_device_id
      },
      { entityId: credential.biometric_credential_id, entityType: 'BiometricCredential', entityTable: 'biometric_credentials' }
    );

    setImmediate(() => {
      this.userRepository
        .findByUserId(userId, 'basic')
        .then(user =>
          this.NotificationUtil.crearNotificacion({
            tipoNotificacion: 'BIOMETRIC_CREDENTIAL_REGISTERED',
            userId,
            relatedEntity: credential.biometric_credential_id,
            metadata: { nombre: user?.person?.first_name ?? 'Usuario', logoUrl: notifications.ses.logoUrl }
          })
        )
        .catch(err => logger.warn('Error enviando notificación biométrico registrado', { error: err.message }));
    });

    return BiometricRegisterFinishDTO(credential);
  }

  // ============================================================
  // LOGIN
  // ============================================================

  /**
   * Genera un challenge para el login biométrico.
   * Endpoint público — recibe nationalId para identificar al usuario.
   *
   * @returns {Promise<BiometricLoginStartDTO>}
   */
  async loginStart({ nationalId }) {
    const user = await this.userRepository.findByUsernameAndNationalId(nationalId, 'login');
    if (!user) {
      throw AppError.unauthorized('Credenciales inválidas');
    }
    if (!user.is_active) {
      throw AppError.forbidden('Cuenta inactiva o suspendida');
    }

    const challenge = crypto.randomBytes(CHALLENGE_BYTES).toString('base64url');

    await this.biometricChallengeRepository.create({
      user_id: user.user_id,
      challenge,
      type: 'authentication'
    });

    logAudit(
      'BIOMETRIC_LOGIN_START',
      user.user_id,
      { nationalId },
      { entityId: user.user_id, entityType: 'User', entityTable: 'users' }
    );

    return BiometricLoginStartDTO({ challenge, userId: user.user_id });
  }

  /**
   * Verifica la firma del dispositivo y autentica al usuario.
   *
   * El dispositivo móvil debe enviar:
   *   - credentialId: string — el mismo que guardó al registrarse
   *   - challenge:    string — el challenge recibido en loginStart
   *   - signature:    string (base64url) — challenge firmado con la llave privada
   *   - signCount:    number — contador del authenticator (debe ser mayor al guardado)
   *
   * @returns {Promise<LoginResponseDTO>}
   */
  async loginFinish({ credentialId, challenge, signature, signCount }, auditContext) {
    const { ip, userAgent, fingerprintHash } = auditContext;

    // Buscar la credencial
    const credential = await this.biometricCredentialRepository.findByCredentialId(credentialId);
    if (!credential) {
      throw AppError.unauthorized('Credencial biométrica no encontrada');
    }

    const userId = credential.user_id;

    // Verificar y consumir el challenge, sign_count y firma
    await this._verifyLoginChallenge({
      credential,
      challenge,
      signature,
      signCount,
      userId,
      credentialId
    });

    // Cargar usuario con las asociaciones que LoginResponseDTO necesita (mismo nivel que login normal)
    const user = await this.userRepository.findByUserId(userId, 'login');
    if (!user) {
      throw AppError.unauthorized('Usuario no encontrado');
    }
    if (!user.is_active) {
      throw AppError.forbidden('Cuenta inactiva o suspendida');
    }

    // Verificar política de privacidad — misma lógica que el login por contraseña
    const policyCheck = await this._checkPrivacyPolicy(user, auditContext.acceptPolicy === true, auditContext.ip);
    if (policyCheck) {
      return policyCheck;
    }

    // Verificar que el dispositivo de la credencial sigue siendo TRUSTED
    const device = await this.trustedDeviceRepository.findById(credential.user_trusted_device_id);
    if (!device || device.status !== 'trusted') {
      throw AppError.forbidden('El dispositivo asociado a esta credencial ya no es de confianza');
    }

    // Una sesión por dispositivo + límite de sesiones simultáneas — igual que el login por contraseña
    await this.sessionControl.closePreviousDeviceSessions(userId, device.user_trusted_device_id);
    await this.sessionControl.enforceSessionLimit(userId);

    // La firma ES256 verificada YA autenticó al usuario: la huella desbloqueó la llave
    // privada en el secure enclave del dispositivo. Emitimos tokens propios RS256 igual
    // que _completeSuccessfulLogin del login por contraseña — sin Cognito ni contraseña.
    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const accessToken = await JwtUtil.generateAccessToken(user, sessionId);
    const refreshToken = await JwtUtil.generateRefreshToken(user.user_id, jti, sessionId);

    // Guardar JTI (awaited — si falla, el refresh token no servirá)
    const jtiSaved = await RefreshTokenStore.save(jti, userId);
    if (!jtiSaved) {
      logger.warn('No se pudo guardar JTI de refresh token en login biométrico', { userId });
    }

    // Crear registro de sesión activa en BD (fire-and-forget) — igual que el login normal
    this.userSessionRepository
      .create({
        user_session_id: sessionId,
        user_id: userId,
        device_id: device.user_trusted_device_id || null,
        jti,
        ip_address: ip || null,
        user_agent: userAgent || null,
        started_at: new Date(),
        last_access_at: new Date()
      })
      .catch(err =>
        logger.warn('Error creando registro de sesión en BD (login biométrico)', {
          error: err.message,
          userId
        })
      );

    const tokens = { accessToken, refreshToken, expiresIn: jwtConfig.accessTokenExpiry };

    // Actualizar sign_count, last_seen y registrar intento — en paralelo
    await Promise.all([
      this.biometricCredentialRepository.updateAfterLogin(credentialId, signCount),
      this.trustedDeviceRepository.updateLastSeen(userId, device.fingerprint_hash),
      this.userLoginAttemptRepository.recordAttempt({
        user_id: userId,
        username_attempt: user.auth_username,
        national_id: user.username,
        ip_address: ip,
        user_agent: userAgent,
        device_fingerprint: fingerprintHash,
        success: true,
        attempted_at: new Date(),
        // Explícito por lo mismo que en auth-login: la ruta de login biométrico es pública, el
        // AsyncLocalStorage no trae sessionId aunque la sesión ya exista en scope.
        origin_session_id: sessionId
      })
    ]);

    logAudit(
      'BIOMETRIC_LOGIN_SUCCESS',
      userId,
      {
        deviceId: device.user_trusted_device_id
      },
      { entityId: credentialId, entityType: 'BiometricCredential', entityTable: 'biometric_credentials' }
    );

    return new LoginResponseDTO({
      user,
      tokens,
      deviceId: device.user_trusted_device_id,
      // El mobile necesita el hmacSecret para firmar requests posteriores
      deviceHmacSecret: device.hmac_secret || null
    });
  }

  /**
   * Verifica el challenge, el sign_count y la firma ES256 para el login biométrico.
   * Extrae la lógica de validación de loginFinish para mantener el método dentro del límite.
   * @private
   */
  async _verifyLoginChallenge({ credential, challenge, signature, signCount, userId, credentialId }) {
    // Verificar y consumir el challenge
    const challengeRecord = await this.biometricChallengeRepository.findValid(challenge);
    if (!challengeRecord) {
      throw AppError.badRequest('Challenge inválido, expirado o ya utilizado');
    }
    if (challengeRecord.user_id !== userId) {
      throw AppError.forbidden('El challenge no pertenece a este usuario');
    }
    if (challengeRecord.type !== 'authentication') {
      throw AppError.badRequest('Tipo de challenge incorrecto');
    }

    // Marcar como usado ANTES de verificar — evita race conditions
    await this.biometricChallengeRepository.markAsUsed(challengeRecord.challenge_id);

    // Verificar sign_count — debe ser mayor al guardado (anti-replay)
    if (signCount <= credential.sign_count) {
      logAudit(
        'BIOMETRIC_LOGIN_REPLAY_ATTACK',
        userId,
        { signCount },
        { entityId: credentialId, entityType: 'BiometricCredential', entityTable: 'biometric_credentials', outcome: 'failure' }
      );
      throw AppError.unauthorized('Sign count inválido — posible ataque de replay');
    }

    // Verificar la firma ES256
    const isValid = this._verifySignature({
      publicKey: credential.public_key,
      challenge,
      signature
    });

    if (!isValid) {
      logAudit(
        'BIOMETRIC_LOGIN_INVALID_SIGNATURE',
        userId,
        {},
        {
          entityId: credentialId,
          entityType: 'BiometricCredential',
          entityTable: 'biometric_credentials',
          outcome: 'failure'
        }
      );
      throw AppError.unauthorized('Firma biométrica inválida');
    }
  }

  // ============================================================
  // GESTIÓN DE CREDENCIALES
  // ============================================================

  /**
   * Lista las credenciales biométricas activas del usuario.
   */
  async getCredentials(userId) {
    const credentials = await this.biometricCredentialRepository.findAllByUser(userId);

    logAudit(
      'BIOMETRIC_CREDENTIALS_VIEWED',
      userId,
      { count: credentials.length },
      { entityType: 'BiometricCredential', entityTable: 'biometric_credentials' }
    );

    return BiometricCredentialListDTO(credentials);
  }

  /**
   * Elimina (desactiva) una credencial biométrica.
   */
  async deleteCredential(userId, biometricCredentialId) {
    // Verificar que la credencial pertenece al usuario
    const credential = await this.biometricCredentialRepository.findOne({
      biometric_credential_id: biometricCredentialId,
      user_id: userId
    });
    if (!credential) {
      throw AppError.notFound('Credencial biométrica no encontrada');
    }

    await this.biometricCredentialRepository.deactivate(biometricCredentialId);

    logAudit(
      'BIOMETRIC_CREDENTIAL_DELETED',
      userId,
      {},
      { entityId: biometricCredentialId, entityType: 'BiometricCredential', entityTable: 'biometric_credentials' }
    );

    return null;
  }

  // ============================================================
  // PRIVATE — Política de privacidad
  // ============================================================

  /**
   * Verifica si el usuario tiene la versión activa de la política de privacidad.
   * Si el request trae `acceptPolicy: true`, registra la versión activa y deja continuar el login
   * y deja continuar el login en un solo paso.
   * @private
   */
  async _checkPrivacyPolicy(user, acceptPolicy, ip) {
    const activePolicy = await this.privacyPolicyRepository.findActive();

    // Los usuarios internos no están sujetos a la política de privacidad de clientes
    const roleName = user.role?.name;
    if (INTERNAL_ROLE_NAMES.includes(roleName)) {
      return null;
    }
    if (!activePolicy) {
      return null;
    }
    if (user.privacy_policy_version === activePolicy.version) {
      return null;
    }

    if (acceptPolicy === true) {
      await this.userRepository.updatePrivacyPolicy(user.user_id, {
        version: activePolicy.version,
        acceptedAt: new Date(),
        acceptedIp: ip || null
      });

      // RF-ADM-04: trazabilidad granular en user_consents
      await this.consentRecorder
        .grantPrivacyPolicy({ userId: user.user_id, privacyPolicyId: activePolicy.privacy_policy_id, ip }).catch(err =>
        logger.warn('auth-biometric: no se pudo registrar user_consent de privacy policy', {
          userId: user.user_id,
          error: err.message
        })
      );

      logAudit(
        'PRIVACY_POLICY_ACCEPTED',
        user.user_id,
        {
          version: activePolicy.version,
          ip: ip || null
        },
        { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }
      );

      return null;
    }

    logAudit(
      'BIOMETRIC_LOGIN_BLOCKED_POLICY_UPDATE',
      user.user_id,
      {
        userVersion: user.privacy_policy_version || 'ninguna',
        activeVersion: activePolicy.version
      },
      { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies', outcome: 'failure' }
    );

    return PolicyUpdateRequiredDTO({
      currentVersion: user.privacy_policy_version || null,
      newVersion: activePolicy.version,
      documentUrl: activePolicy.document_url,
      summary: activePolicy.summary,
      effectiveDate: activePolicy.effective_date
    });
  }

  // ============================================================
  // PRIVATE — Verificación ES256
  // ============================================================

  /**
   * Verifica una firma ES256 (ECDSA P-256 + SHA-256).
   *
   * El dispositivo móvil firma el challenge con su llave privada.
   * Nosotros verificamos con la llave pública guardada.
   *
   * @param {{ publicKey: string, challenge: string, signature: string }} params
   *   - publicKey:  llave pública en base64 (formato SubjectPublicKeyInfo / DER) o PEM
   *   - challenge:  string base64url que fue firmado
   *   - signature:  firma en base64url (formato DER o raw r||s de 64 bytes)
   * @returns {boolean}
   * @private
   */
  _verifySignature({ publicKey, challenge, signature }) {
    try {
      const verify = crypto.createVerify('SHA256');

      // El challenge fue firmado como bytes — lo convertimos desde base64url
      const challengeBuffer = Buffer.from(challenge, 'base64url');
      verify.update(challengeBuffer);

      // La llave pública puede venir en base64 (DER/SPKI) o ya en PEM
      const pemKey = publicKey.startsWith('-----') ? publicKey : this._derToPem(publicKey);

      // La firma puede venir en base64url (raw 64 bytes r||s) o DER
      const signatureBuffer = Buffer.from(signature, 'base64url');
      const derSignature = signatureBuffer.length === ES256_RAW_SIGNATURE_LEN ? this._rawToDer(signatureBuffer) : signatureBuffer;

      return verify.verify(pemKey, derSignature);
    } catch (error) {
      logger.info('Biometric signature verification error', { error: error.message });
      return false;
    }
  }

  /**
   * Convierte una llave pública DER (base64) a formato PEM.
   * @private
   */
  _derToPem(base64Der) {
    const regex = new RegExp(`.{1,${PEM_LINE_LENGTH}}`, 'g');
    const lines = base64Der.match(regex).join('\n');
    return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
  }

  /**
   * Convierte firma raw (r||s, 64 bytes) a formato DER.
   * Los dispositivos móviles a veces envían la firma en formato raw.
   * @private
   */
  _rawToDer(rawSignature) {
    const r = rawSignature.slice(0, ES256_COMPONENT_LEN);
    const s = rawSignature.slice(ES256_COMPONENT_LEN, ES256_RAW_SIGNATURE_LEN);

    const encodeInt = buf => {
      // Si el bit más significativo es 1, agregar byte 0x00 para indicar positivo
      const needsPad = buf[0] & DER_POSITIVE_PAD;
      const padded = needsPad ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
      return Buffer.concat([Buffer.from([DER_INTEGER_TAG, padded.length]), padded]);
    };

    const rDer = encodeInt(r);
    const sDer = encodeInt(s);
    const seq = Buffer.concat([rDer, sDer]);

    return Buffer.concat([Buffer.from([DER_SEQUENCE_TAG, seq.length]), seq]);
  }
}


module.exports = new AuthBiometricService();
module.exports.AuthBiometricService = AuthBiometricService;
