import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { User } = modelsModule;
import bcrypt = require('bcryptjs');
import HashUtil = require('../../../../../shared/utils/hash.util');
import AppError = require('../../../../../shared/utils/app-error.util');
import sequelizeModule = require('sequelize');
const { Op } = sequelizeModule;
import type { CreateOptions, DestroyOptions, FindOptions, IncludeOptions, InstanceUpdateOptions } from 'sequelize';
import type defineUser = require('../models/user.model');
import ReadRepository = require('../../../../../shared/repositories/read.repository');
import type { WhereClause } from '../../../../../shared/repositories/query';

class UserRepository extends BaseRepository<defineUser.Instance> {
  constructor() {
    super(User);
  }

  /**
   * Lo mínimo para ofuscar una cuenta al eliminarla: username + persona (documento, nombre)
   * + contacto (email). Acepta { transaction }.
   */
  findForAccountDeletion(userId: string, options: FindOptions<defineUser.Attributes> = {}) {
    return this.findById(userId, {
      include: [
        {
          association: 'person',
          attributes: ['person_id', 'national_id', 'first_name'],
          include: [{ association: 'contact', attributes: ['person_contact_id', 'email'] }]
        }
      ],
      attributes: ['user_id', 'username'],
      ...options
    });
  }

  /** Usuario con el teléfono principal de su contacto (activación de SMS MFA). */
  findWithPrimaryPhone(userId: string) {
    return this.findById(userId, {
      include: [
        {
          association: 'person',
          attributes: ['person_id'],
          include: [{ association: 'contact', attributes: ['phone_primary', 'phone_primary_prefix_id'] }]
        }
      ]
    });
  }

  /** Solo los flags de MFA (lectura ligera para el gate de 2FA en cada request). */
  findMfaFlags(userId: string) {
    return this.model.findOne({ where: { user_id: userId }, attributes: ['totp_enabled', 'sms_mfa_enabled'] });
  }

  /**
   * ============================================================
   * USER MODEL - INCLUDES CENTRALIZADOS
   * ============================================================
   */

  static INCLUDES: Record<UserRepository.IncludeLevel, IncludeOptions[]> = {
    // ============================================================
    // FULL - Perfil completo con todos los detalles
    // ============================================================
    full: [
      {
        association: 'person',
        include: [
          {
            association: 'contact',
            include: [{ association: 'phone_primary_prefix' }, { association: 'phone_secondary_prefix' }]
          },
          { association: 'gender' },
          { association: 'country' },
          { association: 'document_type' },
          {
            association: 'location',
            include: [{ association: 'country' }, { association: 'city' }, { association: 'department' }]
          }
        ]
      },
      { association: 'role' },
      { association: 'avatar' }
    ],

    // ============================================================
    // BASIC - Perfil básico + registros activos clave
    // ============================================================
    basic: [
      {
        association: 'person',
        include: [
          {
            association: 'contact',
            include: [{ association: 'phone_primary_prefix' }, { association: 'phone_secondary_prefix' }]
          },
          { association: 'gender' },
          { association: 'country' },
          { association: 'document_type' },
          {
            association: 'location',
            include: [{ association: 'country' }, { association: 'department' }, { association: 'city' }]
          }
        ]
      },
      { association: 'role' },
      { association: 'avatar' }
    ],

    // ============================================================
    // AUTH - Solo lo necesario para autenticación
    // ============================================================
    auth: [
      {
        association: 'person',
        include: [{ association: 'contact' }]
      },
      { association: 'role' }
    ],

    // ============================================================
    // LOGIN - Específico para proceso de login
    // ============================================================
    login: [
      {
        association: 'person',
        required: true,
        include: [
          {
            association: 'contact',
            required: false
          }
        ]
      },
      {
        association: 'role',
        required: true
      }
    ],

    // ============================================================
    // MINIMAL - Mínimo indispensable
    // ============================================================
    minimal: [
      {
        association: 'person',
        include: [
          {
            association: 'contact',
            required: false
          }
        ]
      }
    ]
  };

  findByUsername(username: string, includeLevel: UserRepository.IncludeLevel = 'login') {
    return this.findOne({ username }, { include: UserRepository.INCLUDES[includeLevel] });
  }

  findByUserId(userId: string, includeLevel: UserRepository.IncludeLevel = 'basic') {
    return this.findOne({ user_id: userId }, { include: UserRepository.INCLUDES[includeLevel] });
  }

  findByUsernameAndNationalId(nationalId: string, includeLevel: UserRepository.IncludeLevel = 'login') {
    // Buscar por hash — national_id está cifrado con IV aleatorio, no se puede buscar directamente
    const nationalIdHash = HashUtil.hashForSearch(nationalId);
    return this.findOne(
      {
        '$person.national_id_hash$': nationalIdHash
      },
      { include: UserRepository.INCLUDES[includeLevel] }
    );
  }

  /**
   * Usuarios activos cuyo rol está dentro de roleNames (filtra por NOMBRE de rol).
   * Fuente única para notificar a colectivos por rol — reemplaza las copias de
   * `User.findAll({ include: role where name in [...] })` dispersas en workers,
   * services y helpers (superadmins de expiración, Oficial de Cumplimiento, etc.).
   *
   * @param {string[]} roleNames        - Nombres de rol a incluir (ej: SUPERADMIN_ROLE_NAMES)
   * @param {Object}   [opts]
   * @param {string[]} [opts.attributes] - Columnas de User a traer (default solo user_id)
   * @param {boolean}  [opts.includePerson] - true → incluye person (first/last name) + contact (email)
   * @returns {Promise<User[]>}
   */
  findActiveUsersByRoleNames(
    roleNames: string[],
    { attributes = ['user_id'], includePerson = false }: { attributes?: string[]; includePerson?: boolean } = {}
  ) {
    const include: IncludeOptions[] = [
      {
        association: 'role',
        where: { name: { [Op.in]: roleNames } },
        attributes: []
      }
    ];

    if (includePerson) {
      include.push({
        association: 'person',
        attributes: ['person_id', 'first_name', 'last_name'],
        include: [{ association: 'contact', attributes: ['email'] }]
      });
    }

    return this.model.findAll({
      where: { is_active: true },
      include,
      attributes
    });
  }

  /**
   * Usuarios activos cuyo rol está en roleNames, con los includes 'basic'
   * (person, contact, document_type, etc.). A diferencia de findActiveUsersByRoleNames
   * —que trae datos mínimos para listas de correos— este trae el perfil completo que
   * el broadcast de notificaciones globales necesita para push/email.
   *
   * @param {string[]} roleNames        - Nombres de rol a incluir (ej: CLIENT_ROLE_NAMES)
   * @param {Object}   [opts]
   * @param {string[]} [opts.attributes] - Columnas de User a traer (default solo user_id)
   * @returns {Promise<User[]>}
   */
  findActiveUsersByRoleNamesDetailed(roleNames: string[], { attributes = ['user_id'] }: { attributes?: string[] } = {}) {
    // Reusa los includes 'basic' pero fuerza el join por nombre de rol (INNER) para
    // restringir la audiencia. El resto de asociaciones queda intacto.
    const include = UserRepository.INCLUDES.basic.map(inc =>
      inc.association === 'role' ? { ...inc, where: { name: { [Op.in]: roleNames } }, required: true } : inc
    );

    return this.model.findAll({ where: { is_active: true }, include, attributes });
  }

  findByPersonId(personId: string, includeLevel: UserRepository.IncludeLevel = 'minimal') {
    return this.findOne(
      {
        '$person.person_id$': personId
      },
      { include: UserRepository.INCLUDES[includeLevel] }
    );
  }

  /**
   * Busca usuarios con paginación, filtros y búsqueda
   */
  override findAllPaginated(
    filters: UserRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {},
    searchTerm: string | null = null
  ) {
    // Construimos los filtros que van directo al WHERE como _extraFilters,
    // porque el base solo maneja isActive de forma nativa — todo lo demás
    // debe ir por esta vía para no perderse.
    const extraFilters: WhereClause = {};

    // role_id: uno solo o varios con Op.in
    if (filters.roleIds?.length) {
      extraFilters.role_id = filters.roleIds.length === 1 ? filters.roleIds[0] : { [Op.in]: filters.roleIds };
    }

    // national_id está cifrado con IV aleatorio — se busca por HMAC-SHA256
    if (filters.nationalId) {
      extraFilters['$person.national_id_hash$'] = HashUtil.hashForSearch(filters.nationalId);
    }

    // user_id: filtro exacto por PK del usuario
    if (filters.userId) {
      extraFilters.user_id = filters.userId;
    }

    // excludeUserId: excluye un usuario del listado (ej: el propio solicitante)
    if (filters.excludeUserId) {
      extraFilters.user_id = { [Op.ne]: filters.excludeUserId };
    }

    // Usuarios eliminados (deleted_at != null): por defecto se EXCLUYEN del listado normal.
    //   filters.onlyDeleted   → solo eliminados (listado histórico de cuentas eliminadas).
    //   filters.includeDeleted → sin filtro (incluye activos y eliminados).
    if (filters.onlyDeleted) {
      extraFilters.deleted_at = { [Op.not]: null };
    } else if (!filters.includeDeleted) {
      extraFilters.deleted_at = { [Op.is]: null };
    }

    return super.findAllPaginated(
      filters, // el base lee filters.isActive nativamente
      paginationParams,
      searchTerm,
      {
        include: UserRepository.INCLUDES.basic,
        _extraFilters: extraFilters,
        // username no está cifrado; first_name y last_name tampoco.
        // national_id y email SÍ están cifrados, no son buscables con iLike.
        _searchFields: ['username', '$person.first_name$', '$person.last_name$']
      }
    );
  }

  /**
   * Alta con contraseña en claro: la hashea y crea el usuario. Método propio (no un override de
   * create): recibe password en vez de password_hash, así que no es sustituible por el create base
   * (SOLID: L).
   */
  async createWithPassword(userData: UserRepository.CreateInput, options: CreateOptions<defineUser.Attributes> = {}) {
    const passwordHash = await this._hashPassword(userData.password);

    return this.create(
      {
        username: userData.username,
        password_hash: passwordHash,
        person_id: userData.person_id,
        role_id: userData.role_id,
        avatar_id: userData.avatar_id || null,
        auth_username: userData.auth_username || null,
        is_active: true,
        totp_enabled: false,
        privacy_policy_version: userData.privacy_policy_version || null,
        privacy_policy_accepted_at: userData.privacy_policy_accepted_at || null,
        privacy_policy_accepted_ip: userData.privacy_policy_accepted_ip || null
      },
      options
    );
  }

  async updatePassword(userId: string, newPassword: string, options: InstanceUpdateOptions<defineUser.Attributes> = {}) {
    const passwordHash = await this._hashPassword(newPassword);
    return this.update(userId, { password_hash: passwordHash }, options);
  }

  verifyPassword(plainPassword: string, hashedPassword: string) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  setActiveStatus(userId: string, isActive: boolean, options: InstanceUpdateOptions<defineUser.Attributes> = {}) {
    return this.update(userId, { is_active: isActive }, options);
  }

  setTOTPStatus(userId: string, enabled: boolean, totpSecret: string | null = null, options: InstanceUpdateOptions<defineUser.Attributes> = {}) {
    return this.update(userId, { totp_enabled: enabled, totp_secret: totpSecret }, options);
  }

  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  override delete(userId: string, options: Omit<DestroyOptions<defineUser.Attributes>, 'where'> = {}) {
    return this.model.destroy({ where: { user_id: userId }, ...options });
  }

  override findById(userId: string, options: FindOptions<defineUser.Attributes> = {}) {
    return this.model.findByPk(userId, options);
  }

  // [RF-AUTH-01] | CA-05 | bcrypt con rounds=10,
  // salt único generado automáticamente por bcrypt.
  // (verifyPassword() usa bcrypt.compare timing-safe.)
  // TODO [RF-AUTH-01][CA-05]: considerar mover
  // BCRYPT_ROUNDS a variable de entorno para
  // ajuste sin redeploy.
  _hashPassword(password: string) {
    return bcrypt.hash(password, 10);
  }

  async updateTOTPStatus(userId: string, enabled: boolean, options: InstanceUpdateOptions<defineUser.Attributes> = {}) {
    const updated = await this.update(userId, { totp_enabled: enabled }, options);
    if (!updated) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return updated;
  }

  /**
   * Registra la aceptación de una nueva versión de política de privacidad.
   */
  async updatePrivacyPolicy(
    userId: string,
    { version, acceptedAt, acceptedIp }: { version: string; acceptedAt: Date; acceptedIp: string | null },
    options: InstanceUpdateOptions<defineUser.Attributes> = {}
  ) {
    const updated = await this.update(
      userId,
      {
        privacy_policy_version: version,
        privacy_policy_accepted_at: acceptedAt,
        privacy_policy_accepted_ip: acceptedIp
      },
      options
    );
    if (!updated) {
      throw AppError.notFound('Usuario no encontrado');
    }
    return updated;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace UserRepository {
  /** Nivel de includes de UserRepository.INCLUDES. */
  export type IncludeLevel = 'full' | 'basic' | 'auth' | 'login' | 'minimal';

  export type Filters = {
    isActive?: boolean;
    roleIds?: string[];
    nationalId?: string;
    userId?: string;
    excludeUserId?: string;
    onlyDeleted?: boolean;
    includeDeleted?: boolean;
  };

  /** Alta de usuario: la contraseña llega en claro y el repositorio la hashea. */
  export type CreateInput = Pick<
    defineUser.CreationAttributes,
    | 'username'
    | 'person_id'
    | 'role_id'
    | 'avatar_id'
    | 'auth_username'
    | 'privacy_policy_version'
    | 'privacy_policy_accepted_at'
    | 'privacy_policy_accepted_ip'
  > & { password: string };
}

export = new UserRepository();
