// tests/unit/modules/shared-endpoints/kyc/person/services/profile.service.test.ts
//
// ProfileService — perfil del cliente (consulta + actualizaciones de username/avatar/genero/ubicacion/
// nombres/email/telefono/password + baja de cuenta). Aislamos repositorios, helper de perfil, util de
// trazabilidad, notificaciones y DTOs (passthrough). Probamos: consultas (found / notFound), cada
// mutacion (helper llamado + commit + logAudit + notificacion diferida en setImmediate + DTO), y las
// ramas de error (rollback + repropagacion). Se usa el
// AppError real para assertar statusCode. Las notificaciones fire-and-forget se vacian con `flush`.

jest.mock('shared/models', () => ({ sequelize: { transaction: jest.fn() } }));

jest.mock('modules/schemas/kyc/iam/repositories/user.repository', () => ({ findByUserId: jest.fn() }));
jest.mock('modules/schemas/kyc/person/repositories/person.repository', () => ({ findById: jest.fn() }));
jest.mock('modules/schemas/records/legal/repositories/user-consent.repository', () => ({ findCurrentByUser: jest.fn() }));
jest.mock('modules/schemas/records/legal/repositories/consent-type.repository', () => ({ findAllActive: jest.fn() }));
jest.mock('modules/schemas/kyc/person/repositories/person-contact.repository', () => ({
  findByPersonIdWithPrefixes: jest.fn()
}));
jest.mock('modules/schemas/kyc/person/repositories/person-location.repository', () => ({ findByPersonId: jest.fn() }));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacion: jest.fn().mockResolvedValue(undefined),
  crearNotificacionDirecta: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/kyc/person/utils/kyc-shared.util', () => ({ logChange: jest.fn().mockResolvedValue(undefined) }));

jest.mock('modules/schemas/kyc/person/helpers/profile.helper', () => ({
  fetchPersonSnapshot: jest.fn(),
  updateUsername: jest.fn().mockResolvedValue(undefined),
  updateAvatar: jest.fn().mockResolvedValue(undefined),
  updateGender: jest.fn().mockResolvedValue(undefined),
  updateLocation: jest.fn().mockResolvedValue(undefined),
  updateBirthDate: jest.fn().mockResolvedValue(undefined),
  updateNames: jest.fn().mockResolvedValue(undefined),
  validateCurrentPassword: jest.fn().mockResolvedValue(undefined),
  updateEmailLogic: jest.fn(),
  updatePhoneLogic: jest.fn(),
  updatePasswordLogic: jest.fn().mockResolvedValue(undefined),
  deleteAccountLogic: jest.fn()
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

// DTOs passthrough: objetos etiquetados para verificar qué recibieron.
jest.mock('modules/shared-endpoints/kyc/person/dtos/profile.dto', () => ({
  BasicProfileDTO: jest.fn((...args) => ({ dto: 'basic', args })),
  ExtendedProfileDTO: jest.fn((...args) => ({ dto: 'extended', args })),
  UpdateEmailResponseDTO: jest.fn((newEmail, updatedAt) => ({ dto: 'email', newEmail, updatedAt })),
  UpdatePhoneResponseDTO: jest.fn((phone, phonePrefixId, phoneType, updatedAt) => ({
    dto: 'phone',
    phone,
    phonePrefixId,
    phoneType,
    updatedAt
  })),
  UpdateNamesResponseDTO: jest.fn(person => ({ dto: 'names', person }))
}));

// Componentes shared requeridos de forma diferida dentro de getContactInfo/getLocation.
jest.mock('shared/dtos/kyc', () => ({
  PersonContactComponent: { build: jest.fn(c => ({ built: 'contact', c })) },
  PersonLocationComponent: { build: jest.fn(l => ({ built: 'location', l })) }
}));

import { mocked, Loose, fixture } from 'tests/helpers/mock';
import modelsModule = require('shared/models');
const { sequelize } = mocked(modelsModule);
import userRepositoryModule = require('modules/schemas/kyc/iam/repositories/user.repository');
const userRepository = mocked(userRepositoryModule);
import personRepositoryModule = require('modules/schemas/kyc/person/repositories/person.repository');
const personRepository = mocked(personRepositoryModule);
import userConsentRepositoryModule = require('modules/schemas/records/legal/repositories/user-consent.repository');
const userConsentRepository = mocked(userConsentRepositoryModule);
import consentTypeRepositoryModule = require('modules/schemas/records/legal/repositories/consent-type.repository');
const consentTypeRepository = mocked(consentTypeRepositoryModule);
import personContactRepositoryModule = require('modules/schemas/kyc/person/repositories/person-contact.repository');
const personContactRepository = mocked(personContactRepositoryModule);
import personLocationRepositoryModule = require('modules/schemas/kyc/person/repositories/person-location.repository');
const personLocationRepository = mocked(personLocationRepositoryModule);
import NotificationUtilModule = require('modules/schemas/notification/services/notification-creation.service');
const NotificationUtil = mocked(NotificationUtilModule);
import KycSharedUtilModule = require('modules/schemas/kyc/person/utils/kyc-shared.util');
const KycSharedUtil = mocked(KycSharedUtilModule);
import ProfileHelperModule = require('modules/schemas/kyc/person/helpers/profile.helper');
const ProfileHelper = mocked(ProfileHelperModule);
import loggerUtilModule = require('shared/utils/logger.util');
const { logAudit } = mocked(loggerUtilModule);
import kycModule = require('shared/dtos/kyc');
const { PersonContactComponent, PersonLocationComponent } = mocked(kycModule);
import profileDtoModule = require('modules/shared-endpoints/kyc/person/dtos/profile.dto');
const profileDto = mocked(profileDtoModule);
import service = require('modules/shared-endpoints/kyc/person/services/profile.service');

// Vacia la cola de macrotareas (setImmediate) para dejar correr las notificaciones fire-and-forget.
const flush = () =>
  new Promise(resolve => {
    setImmediate(resolve);
  });

function makeTransaction() {
  return {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    finished: false
  };
}

describe('ProfileService', () => {
  let transaction: Loose;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = makeTransaction();
    sequelize.transaction.mockResolvedValue(transaction);
  });

  // ============================================================
  // CONSULTAS
  // ============================================================

  describe('getProfile', () => {
    it('usuario existente: arma BasicProfileDTO con consentimientos y audita', async () => {
      const user = { user_id: 'u-1' };
      userRepository.findByUserId.mockResolvedValue(user);
      consentTypeRepository.findAllActive.mockResolvedValue(['ct']);
      userConsentRepository.findCurrentByUser.mockResolvedValue(['c']);

      const result = await service.getProfile('u-1');

      expect(userRepository.findByUserId).toHaveBeenCalledWith('u-1', 'basic');
      expect(profileDto.BasicProfileDTO).toHaveBeenCalledWith(user, ['ct'], ['c']);
      expect(logAudit).toHaveBeenCalledWith(
        'PROFILE_VIEWED',
        'u-1',
        {},
        { entityId: 'u-1', entityType: 'User', entityTable: 'users' }
      );
      expect(result).toEqual({ dto: 'basic', args: [user, ['ct'], ['c']] });
    });

    it('usuario inexistente: lanza AppError.notFound (404)', async () => {
      userRepository.findByUserId.mockResolvedValue(null);

      await expect(service.getProfile('u-x')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(profileDto.BasicProfileDTO).not.toHaveBeenCalled();
    });
  });

  describe('getExtendedProfile', () => {
    it('usuario existente: pide el user full y arma ExtendedProfileDTO', async () => {
      const user = { user_id: 'u-1' };
      userRepository.findByUserId.mockResolvedValue(user);
      consentTypeRepository.findAllActive.mockResolvedValue([]);
      userConsentRepository.findCurrentByUser.mockResolvedValue([]);

      await service.getExtendedProfile('u-1');

      expect(userRepository.findByUserId).toHaveBeenCalledWith('u-1', 'full');
      expect(profileDto.ExtendedProfileDTO).toHaveBeenCalledWith(user, [], []);
      expect(logAudit).toHaveBeenCalledWith('PROFILE_EXTENDED_VIEWED', 'u-1', {}, expect.any(Object));
    });

    it('usuario inexistente: lanza AppError.notFound', async () => {
      userRepository.findByUserId.mockResolvedValue(null);
      await expect(service.getExtendedProfile('u-x')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getContactInfo', () => {
    it('contacto encontrado: construye el componente y audita', async () => {
      personContactRepository.findByPersonIdWithPrefixes.mockResolvedValue({ email: 'a@b.cl' });

      const result = await service.getContactInfo('p-1', 'u-1');

      expect(personContactRepository.findByPersonIdWithPrefixes).toHaveBeenCalledWith('p-1');
      expect(PersonContactComponent.build).toHaveBeenCalledWith({ email: 'a@b.cl' });
      expect(logAudit).toHaveBeenCalledWith(
        'PROFILE_CONTACT_VIEWED',
        'u-1',
        { personId: 'p-1' },
        { entityId: 'u-1', entityType: 'User', entityTable: 'users' }
      );
      expect(result).toEqual({ built: 'contact', c: { email: 'a@b.cl' } });
    });

    it('sin contacto: lanza AppError.notFound', async () => {
      personContactRepository.findByPersonIdWithPrefixes.mockResolvedValue(null);
      await expect(service.getContactInfo('p-1', 'u-1')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getLocation', () => {
    it('construye el componente de ubicacion y audita', async () => {
      personLocationRepository.findByPersonId.mockResolvedValue({ city_id: 3 });

      const result = await service.getLocation('p-1', 'u-1');

      expect(PersonLocationComponent.build).toHaveBeenCalledWith({ city_id: 3 });
      expect(logAudit).toHaveBeenCalledWith('PROFILE_LOCATION_VIEWED', 'u-1', { personId: 'p-1' }, expect.any(Object));
      expect(result).toEqual({ built: 'location', l: { city_id: 3 } });
    });
  });

  // ============================================================
  // ACTUALIZACIONES
  // ============================================================

  describe('updateProfile', () => {
    it('camino feliz: aplica cada campo, registra cambios, commitea, audita, notifica y devuelve DTO', async () => {
      ProfileHelper.fetchPersonSnapshot.mockResolvedValue({ genderId: null, birthDate: null, location: null });
      const updatedUser = { user_id: 'u-1' };
      // 1a llamada snapshot ya cubierta; findByUserId('u-1','full') devuelve el user actualizado.
      userRepository.findByUserId.mockResolvedValue(updatedUser);

      const data = {
        username: 'nuevo',
        avatarId: 'av-1',
        genderId: 'g-1',
        location: { cityId: 5 },
        birthDate: '1990-01-01'
      };

      const result = await service.updateProfile(fixture(data), 'u-1', 'p-1', 'viejo', 'Ana', { ip: '1.1.1.1' });

      expect(ProfileHelper.updateUsername).toHaveBeenCalledWith('u-1', 'nuevo', transaction);
      expect(ProfileHelper.updateAvatar).toHaveBeenCalledWith('u-1', 'av-1', transaction);
      expect(ProfileHelper.updateGender).toHaveBeenCalledWith('p-1', 'g-1', transaction);
      expect(ProfileHelper.updateLocation).toHaveBeenCalledWith('p-1', { cityId: 5 }, transaction);
      expect(ProfileHelper.updateBirthDate).toHaveBeenCalledWith('p-1', '1990-01-01', transaction);
      // _logProfileFieldChanges: gender + birth_date + location => 3 registros de cambio.
      expect(KycSharedUtil.logChange).toHaveBeenCalledTimes(3);
      expect(transaction.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        'PROFILE_UPDATED',
        'u-1',
        { updatedFields: ['username', 'avatarId', 'genderId', 'location', 'birthDate'] },
        expect.any(Object)
      );

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'PROFILE_UPDATED', userId: 'u-1', metadata: { nombre: 'Ana' } })
      );
      expect(result).toEqual({ dto: 'extended', args: [updatedUser] });
    });

    it('no toca el username si es igual al actual', async () => {
      ProfileHelper.fetchPersonSnapshot.mockResolvedValue({});
      userRepository.findByUserId.mockResolvedValue({});

      await service.updateProfile({ username: 'mismo' }, 'u-1', 'p-1', 'mismo', 'Ana');

      expect(ProfileHelper.updateUsername).not.toHaveBeenCalled();
      expect(transaction.commit).toHaveBeenCalled();
    });

    it('si un helper falla: rollback y repropaga sin commitear', async () => {
      ProfileHelper.fetchPersonSnapshot.mockResolvedValue({});
      const boom = new Error('helper boom');
      ProfileHelper.updateAvatar.mockRejectedValueOnce(boom);

      await expect(service.updateProfile({ avatarId: 'av-1' }, 'u-1', 'p-1', 'x', 'Ana')).rejects.toBe(boom);
      expect(transaction.rollback).toHaveBeenCalled();
      expect(transaction.commit).not.toHaveBeenCalled();
    });
  });

  describe('updateEmail', () => {
    it('camino feliz: valida password, actualiza, commitea, audita, notifica y devuelve DTO', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });
      ProfileHelper.updateEmailLogic.mockResolvedValue({ newEmail: 'nuevo@b.cl' });

      const result = await service.updateEmail(
        { email: 'nuevo@b.cl', currentPassword: 'pass' },
        'u-1',
        'p-1',
        'Ana',
        { ip: '1.1.1.1' }
      );

      expect(userRepository.findByUserId).toHaveBeenCalledWith('u-1', 'minimal');
      expect(ProfileHelper.validateCurrentPassword).toHaveBeenCalledWith('hash', 'pass');
      expect(ProfileHelper.updateEmailLogic).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-1', personId: 'p-1', newEmail: 'nuevo@b.cl', changedByRole: 'user' })
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PROFILE_EMAIL_UPDATED', 'u-1', { newEmail: 'nuevo@b.cl' }, expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'EMAIL_UPDATED' })
      );
      expect(result).toMatchObject({ dto: 'email', newEmail: 'nuevo@b.cl' });
    });

    it('usuario inexistente: lanza notFound antes de abrir transaccion', async () => {
      userRepository.findByUserId.mockResolvedValue(null);

      await expect(
        service.updateEmail({ email: 'x@b.cl', currentPassword: 'p' }, 'u-x', 'p-1', 'Ana', {})
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(sequelize.transaction).not.toHaveBeenCalled();
    });

    it('si updateEmailLogic falla: rollback y repropaga', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });
      const boom = new Error('email boom');
      ProfileHelper.updateEmailLogic.mockRejectedValue(boom);

      await expect(
        service.updateEmail({ email: 'x@b.cl', currentPassword: 'p' }, 'u-1', 'p-1', 'Ana', {})
      ).rejects.toBe(boom);
      expect(transaction.rollback).toHaveBeenCalled();
    });
  });

  describe('updatePhone', () => {
    it('camino feliz: actualiza telefono, commitea, audita, notifica y devuelve DTO', async () => {
      ProfileHelper.updatePhoneLogic.mockResolvedValue({ phone: '911112222', phonePrefixId: 'pp-1', phoneType: 'mobile' });

      const result = await service.updatePhone(
        fixture({ newPhone: '911112222', phonePrefixId: 'pp-1', phoneType: 'mobile' }),
        'u-1',
        'p-1',
        'Ana',
        {}
      );

      expect(ProfileHelper.updatePhoneLogic).toHaveBeenCalledWith(
        expect.objectContaining({ personId: 'p-1', phone: '911112222', phonePrefixId: 'pp-1', phoneType: 'mobile' })
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PROFILE_PHONE_UPDATED', 'u-1', { phoneType: 'mobile' }, expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'PHONE_UPDATED' })
      );
      expect(result).toMatchObject({ dto: 'phone', phone: '911112222', phoneType: 'mobile' });
    });

    it('si updatePhoneLogic falla: rollback y repropaga', async () => {
      const boom = new Error('phone boom');
      ProfileHelper.updatePhoneLogic.mockRejectedValue(boom);

      await expect(service.updatePhone(fixture({ newPhone: '9' }), 'u-1', 'p-1', 'Ana', {})).rejects.toBe(boom);
      expect(transaction.rollback).toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('camino feliz: valida, actualiza, commitea, audita, notifica y devuelve null', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });

      const result = await service.updatePassword(
        { currentPassword: 'old', newPassword: 'new' },
        'u-1',
        'Ana',
        {}
      );

      expect(ProfileHelper.validateCurrentPassword).toHaveBeenCalledWith('hash', 'old');
      expect(ProfileHelper.updatePasswordLogic).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-1', newPassword: 'new', changedByRole: 'user' })
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('PASSWORD_CHANGED', 'u-1', {}, expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'PASSWORD_UPDATED' })
      );
      expect(result).toBeNull();
    });

    // InvalidPasswordException era un error de Cognito (código residual eliminado): cualquier error
    // del helper se repropaga tal cual tras el rollback.
    it('error del helper: rollback y repropaga el error original', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });
      const err = new Error('weak');
      err.name = 'InvalidPasswordException';
      ProfileHelper.updatePasswordLogic.mockRejectedValue(err);

      await expect(
        service.updatePassword({ currentPassword: 'old', newPassword: 'weak' }, 'u-1', 'Ana', {})
      ).rejects.toBe(err);
      expect(transaction.rollback).toHaveBeenCalled();
    });
  });

  describe('updateNames', () => {
    it('con cambio de nombre: registra el cambio, commitea, audita, notifica y devuelve DTO', async () => {
      const before = { first_name: 'Ana', last_name: 'Perez' };
      const after = { person_id: 'p-1', first_name: 'Ana Maria', last_name: 'Perez' };
      personRepository.findById.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

      const result = await service.updateNames({ firstName: 'Ana Maria' }, 'u-1', 'p-1', 'Ana', { ip: '1.1.1.1' });

      expect(ProfileHelper.updateNames).toHaveBeenCalledWith(
        'p-1',
        { firstName: 'Ana Maria', middleName: undefined, lastName: undefined, secondLastName: undefined },
        transaction
      );
      expect(KycSharedUtil.logChange).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'name', previousValue: 'Ana Perez', newValue: 'Ana Maria Perez' }),
        { transaction }
      );
      expect(transaction.commit).toHaveBeenCalled();

      await flush();
      expect(NotificationUtil.crearNotificacion).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'PROFILE_UPDATED' })
      );
      expect(result).toEqual({ dto: 'names', person: after });
    });

    it('sin cambio de nombre: NO registra cambio pero igual commitea', async () => {
      const person = { person_id: 'p-1', first_name: 'Ana', last_name: 'Perez' };
      personRepository.findById.mockResolvedValue(person);

      await service.updateNames({ firstName: 'Ana', lastName: 'Perez' }, 'u-1', 'p-1', 'Ana', {});

      expect(KycSharedUtil.logChange).not.toHaveBeenCalled();
      expect(transaction.commit).toHaveBeenCalled();
    });

    it('si updateNames falla: rollback y repropaga', async () => {
      personRepository.findById.mockResolvedValue({ first_name: 'Ana', last_name: 'Perez' });
      const boom = new Error('names boom');
      ProfileHelper.updateNames.mockRejectedValue(boom);

      await expect(service.updateNames({ firstName: 'X' }, 'u-1', 'p-1', 'Ana', {})).rejects.toBe(boom);
      expect(transaction.rollback).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('camino feliz: valida, elimina, commitea, audita, notifica al email eliminado y devuelve null', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash', username: 'ana' });
      ProfileHelper.deleteAccountLogic.mockResolvedValue({ deletedEmail: 'ana@b.cl', firstName: 'Ana' });

      const result = await service.deleteAccount(
        { currentPassword: 'pass' },
        { userId: 'u-1', personId: 'p-1', nationalId: '111', email: 'ana@b.cl', firstName: 'Ana', auditContext: {} }
      );

      expect(ProfileHelper.validateCurrentPassword).toHaveBeenCalledWith('hash', 'pass');
      expect(ProfileHelper.deleteAccountLogic).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-1', personId: 'p-1', username: 'ana', changedByRole: 'user' })
      );
      expect(transaction.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('ACCOUNT_DELETED', 'u-1', {}, expect.any(Object));

      await flush();
      expect(NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'CUENTA_ELIMINADA', email: 'ana@b.cl' })
      );
      expect(result).toBeNull();
    });

    it('sin deletedEmail: no envia notificacion directa', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });
      ProfileHelper.deleteAccountLogic.mockResolvedValue({ deletedEmail: null });

      await service.deleteAccount(
        { currentPassword: 'pass' },
        fixture({ userId: 'u-1', personId: 'p-1', auditContext: {} })
      );

      await flush();
      expect(NotificationUtil.crearNotificacionDirecta).not.toHaveBeenCalled();
    });

    it('si deleteAccountLogic falla y la tx no termino: rollback y repropaga', async () => {
      userRepository.findByUserId.mockResolvedValue({ password_hash: 'hash' });
      const boom = new Error('delete boom');
      ProfileHelper.deleteAccountLogic.mockRejectedValue(boom);

      await expect(
        service.deleteAccount({ currentPassword: 'pass' }, fixture({ userId: 'u-1', personId: 'p-1', auditContext: {} }))
      ).rejects.toBe(boom);
      expect(transaction.rollback).toHaveBeenCalled();
    });
  });
});
