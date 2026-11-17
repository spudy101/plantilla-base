import type { AdminAuditContext } from '../../../../../shared/types/audit-context';
import unitOfWork from '../../../../../shared/database/unit-of-work';
import userRepository from '../../../../schemas/kyc/iam/repositories/user.repository';
import personRepository from '../../../../schemas/kyc/person/repositories/person.repository';
import personContactRepository from '../../../../schemas/kyc/person/repositories/person-contact.repository';
import roleRepository from '../../../../schemas/kyc/iam/repositories/role.repository';
import NotificationUtil from '../../../../schemas/notification/services/notification-creation.service';
import AppError from '../../../../../shared/utils/app-error.util';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import ProfileHelper from '../../../../schemas/kyc/person/helpers/profile.helper';
import DualApprovalService from '../../../../schemas/core/services/dual-approval.service';
import constantsModule from '../../../../../shared/constants';
const { notifications } = constantsModule;
import personGuardsModule from './admin-person/person-guards';
const { assertNotDeleted, requirePerson } = personGuardsModule;
import PersonQueryService from './admin-person/person-query.service';
import PersonCreationService from './admin-person/person-creation.service';
import PersonAccessService from './admin-person/person-access.service';
import PersonCredentialsService from './admin-person/person-credentials.service';

/**
 * ============================================================
 * ADMIN PERSON SERVICE — fachada
 * ============================================================
 * SOLID (S): este service tenía ~1000 líneas y muchas razones de cambio.
 * Ahora cada responsabilidad vive en su propio servicio (carpeta admin-person/):
 *   - PersonQueryService        → listados, opciones de rol, detalle
 *   - PersonCreationService     → alta de cuentas
 *   - PersonAccessService       → activar/desactivar, cambio de rol
 *   - PersonCredentialsService  → contraseña, email, documento, MFA
 * La fachada conserva la eliminación de cuenta (atada a la doble aprobación) y
 * expone la misma API pública de siempre, así controllers y tests no cambian.
 *
 * INCLUDES: se delega a userRepository.findByUserId(id, level)
 * para usar los aliases exactos definidos en los modelos (snake_case).
 *
 * Para consultas puntuales dentro de operaciones (activate, resetPassword,
 * etc.) se sigue usando findById con includes mínimos inline — esos
 * usan solo 'person' y 'contact' que SÍ tienen el alias correcto.
 */

class PersonService {
  unitOfWork: typeof unitOfWork;
  profileHelper: typeof ProfileHelper;
  userRepository: typeof userRepository;
  personRepository: typeof personRepository;
  personContactRepository: typeof personContactRepository;
  roleRepository: typeof roleRepository;
  NotificationUtil: typeof NotificationUtil;
  DualApprovalService: typeof DualApprovalService;
  queries: InstanceType<typeof PersonQueryService>;
  creation: InstanceType<typeof PersonCreationService>;
  access: InstanceType<typeof PersonAccessService>;
  credentials: InstanceType<typeof PersonCredentialsService>;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new PersonService({ unitOfWork: fake })
   * @param {object} [deps]
   */
  constructor(deps: PersonService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.profileHelper = deps.profileHelper ?? ProfileHelper;
    this.userRepository = deps.userRepository ?? userRepository;
    this.personRepository = deps.personRepository ?? personRepository;
    this.personContactRepository = deps.personContactRepository ?? personContactRepository;
    this.roleRepository = deps.roleRepository ?? roleRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
    this.DualApprovalService = deps.DualApprovalService ?? DualApprovalService;

    // Sub-servicios por responsabilidad (SOLID: S). Reciben las mismas dependencias.
    const shared = {
      unitOfWork: this.unitOfWork,
      profileHelper: this.profileHelper,
      userRepository: this.userRepository,
      personRepository: this.personRepository,
      personContactRepository: this.personContactRepository,
      roleRepository: this.roleRepository,
      NotificationUtil: this.NotificationUtil,
      DualApprovalService: this.DualApprovalService
    };
    this.queries = deps.queries ?? new PersonQueryService(shared);
    this.creation = deps.creation ?? new PersonCreationService(shared);
    this.access = deps.access ?? new PersonAccessService(shared);
    this.credentials = deps.credentials ?? new PersonCredentialsService(shared);
  }

  // ============================================================
  // ELIMINAR CUENTA
  // ============================================================

  async deleteAccount(userId: string, currentPassword: string, auditContext: AdminAuditContext) {
    // Re-autenticación del admin (maker) ANTES de gatear la doble aprobación.
    const adminUser = await this.userRepository.findByUserId(auditContext.adminUserId, 'minimal');
    if (!adminUser) {
      throw AppError.notFound('Administrador no encontrado');
    }
    await this.profileHelper.validateCurrentPassword(adminUser.password_hash, currentPassword);

    // La cuenta objetivo debe existir y no estar ya eliminada (no se re-elimina).
    const target = await this.userRepository.findById(userId, {
      attributes: ['user_id', 'deleted_at'],
      include: [{ association: 'person', attributes: ['person_id'] }]
    });
    if (!target) {
      throw AppError.notFound('Usuario no encontrado');
    }
    assertNotDeleted(target);

    // Doble aprobación (maker-checker). Pendiente → 202 y la eliminación corre luego desde el
    // handler IoC (executeDeleteAccount). Flag off / super_admin → se ejecuta inline.
    const gate = await this.DualApprovalService.gate('CLIENT_ACCOUNT_DELETE', {
      entityType: 'User',
      entityId: userId,
      payload: { userId },
      ctx: auditContext
    });
    if (gate.pending) {
      return { pending: true, approvalRequest: gate.request };
    }

    await this.executeDeleteAccount(userId, auditContext);
    return null;
  }

  /**
   * Ejecuta la eliminación REAL de la cuenta (ofuscación en BD + notificación).
   * Punto de entrada del handler de doble aprobación y de la ejecución directa.
   */
  async executeDeleteAccount(userId: string, auditContext: AdminAuditContext) {
    const transaction = await this.unitOfWork.begin();

    try {
      const user = await this.userRepository.findById(userId, {
        include: [
          {
            association: 'person',
            attributes: ['person_id', 'national_id', 'first_name'],
            include: [{ association: 'contact', attributes: ['person_contact_id', 'email'] }]
          }
        ],
        attributes: ['user_id', 'username'],
        transaction
      });

      if (!user) {
        throw AppError.notFound('Usuario no encontrado');
      }

      const person = requirePerson(user);
      const result = await this.profileHelper.deleteAccountLogic({
        userId,
        personId: person.person_id,
        nationalId: person.national_id,
        email: person.contact?.email,
        username: user.username,
        firstName: person.first_name,
        changedByUserId: auditContext.adminUserId,
        changedByRole: 'admin',
        changeReason: 'Cuenta eliminada por administrador',
        auditContext: { ipAddress: auditContext.ipAddress, userAgent: auditContext.userAgent },
        transaction
      });

      await transaction.commit();

      logAudit(
        'PERSON_ACCOUNT_DELETED',
        auditContext.adminUserId,
        {},
        { entityId: userId, entityType: 'User', entityTable: 'users' }
      );

      const { deletedEmail } = result;
      if (deletedEmail) {
        setImmediate(() => {
          this.NotificationUtil.crearNotificacionDirecta({
            tipoNotificacion: 'CUENTA_ELIMINADA',
            email: deletedEmail,
            metadata: {
              nombre: result.firstName,
              email: deletedEmail,
              logoUrl: notifications.ses.logoUrl
            }
          }).catch(err =>
            logger.warn('Error sending account deletion notification', {
              userId,
              error: err.message
            })
          );

          this.NotificationUtil.crearNotificacion({
            tipoNotificacion: 'PERSON_ADMIN_ACTION',
            userId: auditContext.adminUserId,
            relatedEntity: null,
            metadata: {
              nombre: auditContext.adminFirstName,
              accion: 'eliminar_cuenta',
              userId: userId,
              logoUrl: notifications.ses.logoUrl
            }
          }).catch(err => logger.warn('Error sending admin action notification', { error: err.message }));
        });
      }

      return null;
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
        logger.info('Transaction rolled back', { userId, adminId: auditContext.adminUserId });
      }
      throw error;
    }
  }

  // ============================================================
  // DELEGACIÓN (API pública estable para controllers y tests)
  // ============================================================
  // ── CONSULTAS → PersonQueryService ──

  list(query: Record<string, unknown>, adminUserId: string) {
    return this.queries.list(query, adminUserId);
  }

  listDeleted(query: Record<string, unknown>, adminUserId: string) {
    return this.queries.listDeleted(query, adminUserId);
  }

  listRoleOptions(adminUserId: string) {
    return this.queries.listRoleOptions(adminUserId);
  }

  getById(userId: string, adminUserId: string) {
    return this.queries.getById(userId, adminUserId);
  }

  // ── CREACIÓN → PersonCreationService ──

  create(userData: Parameters<PersonService['creation']['create']>[0], auditContext: AdminAuditContext) {
    return this.creation.create(userData, auditContext);
  }

  // ── ACCESO (estado y rol) → PersonAccessService ──

  activate(userId: string, auditContext: AdminAuditContext) {
    return this.access.activate(userId, auditContext);
  }

  deactivate(userId: string, auditContext: AdminAuditContext) {
    return this.access.deactivate(userId, auditContext);
  }

  changeRole(userId: string, newRoleId: string, auditContext: AdminAuditContext) {
    return this.access.changeRole(userId, newRoleId, auditContext);
  }

  // ── CREDENCIALES E IDENTIDAD → PersonCredentialsService ──

  resetPassword(userId: string, auditContext: AdminAuditContext) {
    return this.credentials.resetPassword(userId, auditContext);
  }

  changeEmail(userId: string, newEmail: string, auditContext: AdminAuditContext) {
    return this.credentials.changeEmail(userId, newEmail, auditContext);
  }

  changeNationalId(userId: string, newNationalId: string, auditContext: AdminAuditContext) {
    return this.credentials.changeNationalId(userId, newNationalId, auditContext);
  }

  disableMFA(userId: string, auditContext: AdminAuditContext) {
    return this.credentials.disableMFA(userId, auditContext);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PersonService {
  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    profileHelper?: typeof ProfileHelper;
    userRepository?: typeof userRepository;
    personRepository?: typeof personRepository;
    personContactRepository?: typeof personContactRepository;
    roleRepository?: typeof roleRepository;
    NotificationUtil?: typeof NotificationUtil;
    DualApprovalService?: typeof DualApprovalService;
    queries?: InstanceType<typeof PersonQueryService>;
    creation?: InstanceType<typeof PersonCreationService>;
    access?: InstanceType<typeof PersonAccessService>;
    credentials?: InstanceType<typeof PersonCredentialsService>;
  }
}

export default Object.assign(new PersonService(), { PersonService });
