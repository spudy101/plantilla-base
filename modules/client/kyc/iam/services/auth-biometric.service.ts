import type defineUser from '../../../../schemas/kyc/iam/models/user.model';
import type defineUserBiometricCredential from '../../../../schemas/kyc/iam/models/user-biometric-credential.model';
import type { RequestAuditContext } from '../../../../../shared/types/audit-context';
import crypto from 'node:crypto';

import userRepository from '../../../../schemas/kyc/iam/repositories/user.repository';
import userLoginAttemptRepository from '../../../../schemas/records/audit/repositories/user-login-attempt.repository';
import trustedDeviceRepository from '../../../../schemas/kyc/iam/repositories/auth-trusted-device.repository';
import privacyPolicyRepository from '../../../../schemas/records/legal/repositories/privacy-policy.repository';
import consentRecorder from '../../../../schemas/records/legal/services/consent-recorder.service';
import biometricRepositoryModule from '../../../../schemas/kyc/iam/repositories/biometric.repository';
const {
  biometricCredentialRepository,
  biometricChallengeRepository
} = biometricRepositoryModule;
import userSessionRepository from '../../../../schemas/kyc/iam/repositories/user-session.repository';
import SessionControlService from '../../../../shared-endpoints/kyc/iam/services/auth-login/session-control.service';
import SessionIssuerService from '../../../../shared-endpoints/kyc/iam/services/auth-login/session-issuer.service';
import LoginPolicyGateService from '../../../../shared-endpoints/kyc/iam/services/auth-login/login-policy-gate.service';
import es256SignatureUtilModule from '../../../../../shared/utils/es256-signature.util';
const { verifyEs256Signature } = es256SignatureUtilModule;
import NotificationUtil from '../../../../schemas/notification/services/notification-creation.service';
import AppError from '../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import constantsModule from '../../../../../shared/constants';
const { notifications } = constantsModule;
import authBiometricDtoModule from '../dtos/auth-biometric.dto';
const {
  BiometricRegisterStartDTO,
  BiometricRegisterFinishDTO,
  BiometricLoginStartDTO,
  BiometricCredentialListDTO
} = authBiometricDtoModule;
import authLoginDtoModule from '../../../../shared-endpoints/kyc/iam/dtos/auth-login.dto';
const { LoginResponseDTO } = authLoginDtoModule;

// ============================================================
// CONSTANTES
// ============================================================

// ES256 = ECDSA con P-256 y SHA-256
const SUPPORTED_ALGORITHM = -7;

const CHALLENGE_BYTES = 32; // bytes para crypto.randomBytes

class AuthBiometricService {
  userRepository: typeof userRepository;
  userLoginAttemptRepository: typeof userLoginAttemptRepository;
  trustedDeviceRepository: typeof trustedDeviceRepository;
  privacyPolicyRepository: typeof privacyPolicyRepository;
  consentRecorder: typeof consentRecorder;
  biometricCredentialRepository: typeof biometricCredentialRepository;
  biometricChallengeRepository: typeof biometricChallengeRepository;
  userSessionRepository: typeof userSessionRepository;
  verifySignature: typeof verifyEs256Signature;
  NotificationUtil: typeof NotificationUtil;
  sessionControl: InstanceType<typeof SessionControlService>;
  sessionIssuer: InstanceType<typeof SessionIssuerService>;
  policyGate: InstanceType<typeof LoginPolicyGateService>;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AuthBiometricService({ userRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: AuthBiometricService.Deps = {}) {
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
    this.sessionIssuer =
      deps.sessionIssuer ?? new SessionIssuerService({ userSessionRepository: this.userSessionRepository });
    this.policyGate =
      deps.policyGate ??
      new LoginPolicyGateService({
        userRepository: this.userRepository,
        privacyPolicyRepository: this.privacyPolicyRepository,
        consentRecorder: this.consentRecorder
      });
    this.verifySignature = deps.verifySignature ?? verifyEs256Signature;
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
  async registerStart(userId: string, fingerprintHash: string) {
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
  async registerFinish(
    { credentialId, publicKey, challenge, signature }: { credentialId: string; publicKey: string; challenge: string; signature: string },
    userId: string,
    fingerprintHash: string
  ) {
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
            // Antes se pasaba el id suelto (string) y la notificación no guardaba la entidad
            relatedEntity: { type: 'BiometricCredential', id: credential.biometric_credential_id },
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
  async loginStart({ nationalId }: { nationalId: string }) {
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
  async loginFinish(
    { credentialId, challenge, signature, signCount }: { credentialId: string; challenge: string; signature: string; signCount: number },
    auditContext: RequestAuditContext
  ) {
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
    const { sessionId, tokens } = await this.sessionIssuer.issue(user, {
      deviceId: device.user_trusted_device_id,
      ip,
      userAgent,
      source: 'login biométrico'
    });

    // Actualizar sign_count, last_seen y registrar intento — en paralelo
    await Promise.all([
      this.biometricCredentialRepository.updateAfterLogin(credentialId, signCount),
      this.trustedDeviceRepository.updateLastSeen(userId, device.fingerprint_hash),
      this.userLoginAttemptRepository.recordAttempt({
        user_id: userId,
        username_attempt: user.auth_username ?? user.username, // columna NOT NULL; auth_username es nullable
        national_id: user.username,
        ip_address: ip,
        user_agent: userAgent,
        device_fingerprint: fingerprintHash,
        success: true,
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

    return LoginResponseDTO({
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
  async _verifyLoginChallenge({
    credential,
    challenge,
    signature,
    signCount,
    userId,
    credentialId
  }: {
    credential: defineUserBiometricCredential.Instance;
    challenge: string;
    signature: string;
    signCount: number;
    userId: string;
    credentialId: string;
  }) {
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
  async getCredentials(userId: string) {
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
  async deleteCredential(userId: string, biometricCredentialId: string) {
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
  _checkPrivacyPolicy(user: defineUser.Instance, acceptPolicy: boolean, ip: string | null | undefined) {
    return this.policyGate.check(user, acceptPolicy, ip ?? null, {
      blockedAuditAction: 'BIOMETRIC_LOGIN_BLOCKED_POLICY_UPDATE',
      source: 'auth-biometric'
    });
  }

  // ============================================================
  // PRIVATE — Verificación ES256
  // ============================================================

  /**
   * Verifica una firma ES256 (ECDSA P-256 + SHA-256). La criptografía vive en
   * shared/utils/es256-signature.util.js; aquí solo se delega (inyectable para tests).
   * @returns {boolean}
   * @private
   */
  _verifySignature({ publicKey, challenge, signature }: { publicKey: string; challenge: string; signature: string }) {
    return this.verifySignature({ publicKey, challenge, signature });
  }
}


// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AuthBiometricService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    sessionControl?: InstanceType<typeof SessionControlService>;
    sessionIssuer?: InstanceType<typeof SessionIssuerService>;
    policyGate?: InstanceType<typeof LoginPolicyGateService>;
    userRepository?: typeof userRepository;
    userLoginAttemptRepository?: typeof userLoginAttemptRepository;
    trustedDeviceRepository?: typeof trustedDeviceRepository;
    privacyPolicyRepository?: typeof privacyPolicyRepository;
    consentRecorder?: typeof consentRecorder;
    biometricCredentialRepository?: typeof biometricCredentialRepository;
    biometricChallengeRepository?: typeof biometricChallengeRepository;
    userSessionRepository?: typeof userSessionRepository;
    verifySignature?: typeof verifyEs256Signature;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export default Object.assign(new AuthBiometricService(), { AuthBiometricService });
