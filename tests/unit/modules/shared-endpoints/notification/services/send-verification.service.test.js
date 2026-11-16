// tests/unit/modules/shared-endpoints/notification/services/send-verification.service.test.js
//
// SendVerificationService — envío y verificación de códigos OTP por email/SMS. Se prueba la lógica de
// orquestación con repos/servicios mockeados y AppError real (para assertar statusCode):
//   sendVerificationCode: (1) 429 si no se puede pedir nuevo código; (2) camino feliz email → crea la
//   fila en transacción, audita y despacha el email en background; (3) camino feliz phone →
//   truncatedCode enmascarado y despacho por SMS; (4) fallo del SMS en background solo loguea warn;
//   (5) rollback + rethrow si falla la creación.
//   verifyCode: not-found (404), reutilizado (400), bloqueado por intentos (403), código incorrecto
//   (incrementa + audita failure + 400 con intentos restantes) y código correcto (marca verificado +
//   audita + DTO). El despacho del código va en setImmediate → se drena la cola de macrotareas.

jest.mock('shared/models', () => ({
  sequelize: { transaction: jest.fn() }
}));

jest.mock('modules/schemas/notification/repositories/verification-code.repository', () => ({
  canRequestNewCode: jest.fn(),
  create: jest.fn(),
  findActiveByContact: jest.fn(),
  incrementAttempts: jest.fn().mockResolvedValue(undefined),
  markAsVerified: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/notification-creation.service', () => ({
  crearNotificacionDirecta: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('modules/schemas/notification/services/sms.service', () => ({
  resolveE164: jest.fn().mockResolvedValue('+56911112222'),
  enviarSmsOtp: jest.fn().mockResolvedValue({ success: true })
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

// EXTERNAL_PROVIDERS mutable: se alterna por prueba para forzar código determinista '123456'.
jest.mock('shared/constants', () => ({
  notifications: { ses: { logoUrl: 'https://logo.test/x.png' } },
  MOCKS: { EXTERNAL_PROVIDERS: false }
}));

// DTOs a passthrough para no acoplar a su forma interna (el real construye componentes KYC).
jest.mock('modules/shared-endpoints/notification/dtos/send-verification.dto', () => ({
  SendVerificationResponseDTO: jest.fn(args => ({ dto: 'send', ...args })),
  VerifyCodeResponseDTO: jest.fn(() => ({ verified: true }))
}));

const { sequelize } = require('shared/models');
const verificationCodeRepo = require('modules/schemas/notification/repositories/verification-code.repository');
const NotificationUtil = require('modules/schemas/notification/services/notification-creation.service');
const SmsService = require('modules/schemas/notification/services/sms.service');
const { logAudit, logger } = require('shared/utils/logger.util');
const constants = require('shared/constants');
const { SendVerificationResponseDTO } = require('modules/shared-endpoints/notification/dtos/send-verification.dto');
const service = require('modules/shared-endpoints/notification/services/send-verification.service');

const flush = () => new Promise(resolve => { setImmediate(resolve); });

function fakeTransaction() {
  return {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    finished: false
  };
}

describe('SendVerificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    constants.MOCKS.EXTERNAL_PROVIDERS = false;
    verificationCodeRepo.incrementAttempts.mockResolvedValue(undefined);
    verificationCodeRepo.markAsVerified.mockResolvedValue(undefined);
    NotificationUtil.crearNotificacionDirecta.mockResolvedValue(undefined);
    SmsService.resolveE164.mockResolvedValue('+56911112222');
    SmsService.enviarSmsOtp.mockResolvedValue({ success: true });
    sequelize.transaction.mockResolvedValue(fakeTransaction());
  });

  describe('sendVerificationCode', () => {
    it('lanza 429 si aún no se puede pedir un nuevo código', async () => {
      verificationCodeRepo.canRequestNewCode.mockResolvedValue(false);

      await expect(service.sendVerificationCode({ type: 'email', contact: 'a@b.cl' })).rejects.toMatchObject({
        statusCode: 429
      });
      expect(verificationCodeRepo.create).not.toHaveBeenCalled();
    });

    it('email — crea el código en transacción, audita y despacha el email en background', async () => {
      const tx = fakeTransaction();
      sequelize.transaction.mockResolvedValue(tx);
      verificationCodeRepo.canRequestNewCode.mockResolvedValue(true);
      verificationCodeRepo.create.mockResolvedValue({ verification_code_id: 'vc-1' });

      const result = await service.sendVerificationCode({ type: 'email', contact: 'a@b.cl' });

      expect(verificationCodeRepo.create).toHaveBeenCalledWith(
        // attempts no se envía: el repositorio no lo acepta y la columna arranca en 0
        expect.objectContaining({ type: 'email', contact_value: 'a@b.cl' }),
        { transaction: tx }
      );
      expect(tx.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('VERIFICATION_CODE_SENT', null, expect.any(Object), expect.any(Object));
      // Email → sin truncatedCode (MOCKS off).
      expect(SendVerificationResponseDTO).toHaveBeenCalledWith(
        expect.objectContaining({ verificationCode: { verification_code_id: 'vc-1' }, truncatedCode: null })
      );
      expect(result).toMatchObject({ dto: 'send' });

      await flush();
      expect(NotificationUtil.crearNotificacionDirecta).toHaveBeenCalledWith(
        expect.objectContaining({ tipoNotificacion: 'CODIGO_VERIFICACION', email: 'a@b.cl' })
      );
    });

    it('phone — enmascara el código y despacha por SMS en background', async () => {
      constants.MOCKS.EXTERNAL_PROVIDERS = true; // código determinista '123456'
      verificationCodeRepo.canRequestNewCode.mockResolvedValue(true);
      verificationCodeRepo.create.mockResolvedValue({ verification_code_id: 'vc-2' });

      await service.sendVerificationCode({ type: 'phone', contact: '911112222', phonePrefixId: 'pref-1' });

      // Últimos 2 dígitos visibles de '123456' → '****56'.
      expect(SendVerificationResponseDTO).toHaveBeenCalledWith(expect.objectContaining({ truncatedCode: '****56' }));

      await flush();
      expect(SmsService.resolveE164).toHaveBeenCalledWith('911112222', 'pref-1');
      expect(SmsService.enviarSmsOtp).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '+56911112222', purpose: 'otp_verification' })
      );
    });

    it('phone — si el SMS falla en background, solo loguea warn (no rompe la respuesta)', async () => {
      constants.MOCKS.EXTERNAL_PROVIDERS = true;
      verificationCodeRepo.canRequestNewCode.mockResolvedValue(true);
      verificationCodeRepo.create.mockResolvedValue({ verification_code_id: 'vc-3' });
      SmsService.enviarSmsOtp.mockResolvedValue({ success: false, error: 'SNS caído' });

      await service.sendVerificationCode({ type: 'phone', contact: '911112222', phonePrefixId: 'pref-1' });

      await flush();
      expect(logger.warn).toHaveBeenCalledWith(
        'Error sending verification code',
        expect.objectContaining({ error: 'SNS caído' })
      );
    });

    it('hace rollback y propaga si falla la creación del código', async () => {
      const tx = fakeTransaction();
      sequelize.transaction.mockResolvedValue(tx);
      verificationCodeRepo.canRequestNewCode.mockResolvedValue(true);
      verificationCodeRepo.create.mockRejectedValue(new Error('db down'));

      await expect(service.sendVerificationCode({ type: 'email', contact: 'a@b.cl' })).rejects.toThrow('db down');
      expect(tx.rollback).toHaveBeenCalled();
      expect(tx.commit).not.toHaveBeenCalled();
    });
  });

  describe('verifyCode', () => {
    it('lanza 404 si no hay código activo', async () => {
      verificationCodeRepo.findActiveByContact.mockResolvedValue(null);

      await expect(service.verifyCode({ type: 'email', contact: 'a@b.cl', code: '123456' })).rejects.toMatchObject({
        statusCode: 404
      });
    });

    it('lanza 400 si el código ya fue utilizado', async () => {
      verificationCodeRepo.findActiveByContact.mockResolvedValue({
        verification_code_id: 'vc-1',
        verified_at: new Date(),
        attempts: 0,
        code: '123456'
      });

      await expect(service.verifyCode({ type: 'email', contact: 'a@b.cl', code: '123456' })).rejects.toMatchObject({
        statusCode: 400
      });
    });

    it('lanza 403 si se excedió el máximo de intentos', async () => {
      verificationCodeRepo.findActiveByContact.mockResolvedValue({
        verification_code_id: 'vc-1',
        verified_at: null,
        attempts: 5,
        code: '123456'
      });

      await expect(service.verifyCode({ type: 'email', contact: 'a@b.cl', code: '000000' })).rejects.toMatchObject({
        statusCode: 403
      });
    });

    it('código incorrecto — incrementa intentos, audita failure y lanza 400 con intentos restantes', async () => {
      const tx = fakeTransaction();
      sequelize.transaction.mockResolvedValue(tx);
      verificationCodeRepo.findActiveByContact.mockResolvedValue({
        verification_code_id: 'vc-1',
        verified_at: null,
        attempts: 1,
        code: '123456'
      });

      await expect(service.verifyCode({ type: 'email', contact: 'a@b.cl', code: '999999' })).rejects.toMatchObject({
        statusCode: 400
      });

      expect(verificationCodeRepo.incrementAttempts).toHaveBeenCalledWith('vc-1', { transaction: tx });
      expect(tx.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        'VERIFICATION_CODE_FAILED',
        null,
        expect.objectContaining({ attempts: 2 }),
        expect.objectContaining({ outcome: 'failure' })
      );
    });

    it('código correcto — marca verificado, audita y devuelve el DTO { verified: true }', async () => {
      const tx = fakeTransaction();
      sequelize.transaction.mockResolvedValue(tx);
      verificationCodeRepo.findActiveByContact.mockResolvedValue({
        verification_code_id: 'vc-1',
        verified_at: null,
        attempts: 0,
        code: '123456'
      });

      const result = await service.verifyCode({ type: 'email', contact: 'a@b.cl', code: '123456' });

      expect(verificationCodeRepo.markAsVerified).toHaveBeenCalledWith('vc-1', { transaction: tx });
      expect(tx.commit).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith('VERIFICATION_CODE_VERIFIED', null, expect.any(Object), expect.any(Object));
      expect(result).toEqual({ verified: true });
    });
  });
});
