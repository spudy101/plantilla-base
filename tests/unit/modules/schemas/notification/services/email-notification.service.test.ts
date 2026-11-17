// tests/unit/modules/schemas/notification/services/email-notification.service.test.ts
//
// EmailNotificationService — canal de email vía AWS SES. Probamos la orquestación de
// enviarNotificacion (soporte por categoría, templates ausentes, ruta con/ sin adjuntos y
// propagación de errores) y los dos caminos de envío real (enviarEmail / enviarEmailConAdjuntos):
// supresión por rebotes duros, circuit breaker abierto, camino feliz (recordSuccess + log success)
// y fallo tras reintentos (recordFailure + log failed). SES, retry, circuit-breaker, suppression y
// masking se mockean para no tocar AWS ni depender de su implementación real. Además se cubren los
// helpers puros de plantillas/adjuntos (_reemplazarVariables, _envolverEnLayout, _normalizarAdjunto).

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: class {},
  SendEmailCommand: class { constructor(public params: unknown) {} },
  SendRawEmailCommand: class { constructor(public params: unknown) {} }
}));

jest.mock('shared/utils/retry.util', () => ({ withRetry: jest.fn() }));

jest.mock('shared/utils/circuit-breaker.util', () => ({
  canCall: jest.fn().mockResolvedValue(true),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('shared/utils/integration-api-logger.util', () => ({ log: jest.fn() }));

jest.mock('shared/utils/aws-provider-meta.util', () => ({
  resolveAwsGate: jest.fn().mockResolvedValue({ integrationId: 'int-1', unitCost: 0.001 }),
  awsErrorCode: jest.fn().mockReturnValue('SES_ERR')
}));

jest.mock('shared/utils/masking.util', () => ({
  maskEmail: jest.fn().mockReturnValue('m***@test.cl'),
  redactPayload: jest.fn(p => p)
}));

jest.mock('modules/schemas/notification/services/email-suppression.service', () => ({
  isSuppressed: jest.fn().mockResolvedValue(false)
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logAudit: jest.fn()
}));

jest.mock('shared/constants', () => ({
  notifications: { ses: { fromEmail: 'no-reply@test.cl', logoUrl: 'https://logo.test/x.png' } },
  aws: { region: 'us-east-1', accessKeyId: 'ak', secretAccessKey: 'sk' }
}));

import { mocked, fixture } from 'tests/helpers/mock';
import retryUtilModule = require('shared/utils/retry.util');
const { withRetry } = mocked(retryUtilModule);
import CircuitBreakerModule = require('shared/utils/circuit-breaker.util');
const CircuitBreaker = mocked(CircuitBreakerModule);
import ProviderApiLoggerModule = require('shared/utils/integration-api-logger.util');
const ProviderApiLogger = mocked(ProviderApiLoggerModule);
import emailSuppressionModule = require('modules/schemas/notification/services/email-suppression.service');
const emailSuppression = mocked(emailSuppressionModule);
import loggerUtilModule = require('shared/utils/logger.util');
const { logAudit } = mocked(loggerUtilModule);
import service = require('modules/schemas/notification/services/email-notification.service');

const DEST = 'user@test.cl';

describe('EmailNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    CircuitBreaker.canCall.mockResolvedValue(true);
    emailSuppression.isSuppressed.mockResolvedValue(false);
    withRetry.mockResolvedValue({ MessageId: 'ses-msg-1' });
  });

  describe('enviarNotificacion', () => {
    const notificationType = {
      code: 'WELCOME',
      email_subject_template: 'Hola {{nombre}}',
      email_body_template: 'Bienvenido {{nombre}}',
      category: { supports_email: true }
    };

    it('retorna null si la categoría no soporta email', async () => {
      const nt = { ...notificationType, category: { supports_email: false } };

      const result = await service.enviarNotificacion(DEST, fixture(nt), { nombre: 'Ana' });

      expect(result).toBeNull();
    });

    it('retorna null si faltan los templates de email', async () => {
      const nt = { code: 'X', category: { supports_email: true } };

      const result = await service.enviarNotificacion(DEST, fixture(nt), {});

      expect(result).toBeNull();
    });

    it('delega en enviarEmail cuando no hay adjuntos', async () => {
      const spy = jest.spyOn(service, 'enviarEmail').mockResolvedValue(fixture({ MessageId: 'x' }));

      await service.enviarNotificacion(DEST, fixture(notificationType), { nombre: 'Ana' }, 'notif-1');

      expect(spy).toHaveBeenCalledWith(DEST, 'Hola Ana', 'Bienvenido Ana', '', 'notif-1');
      spy.mockRestore();
    });

    it('delega en enviarEmailConAdjuntos cuando hay adjuntos válidos', async () => {
      const spy = jest.spyOn(service, 'enviarEmailConAdjuntos').mockResolvedValue(fixture({ MessageId: 'x' }));
      const datos = { nombre: 'Ana', attachments: [{ filename: 'c.pdf', content: 'BASE64==' }] };

      await service.enviarNotificacion(DEST, fixture(notificationType), datos, 'notif-2');

      expect(spy).toHaveBeenCalledWith(
        DEST,
        'Hola Ana',
        expect.any(String),
        [expect.objectContaining({ filename: 'c.pdf', base64: 'BASE64==' })],
        'notif-2'
      );
      spy.mockRestore();
    });

    it('propaga el error si el envío falla', async () => {
      const spy = jest.spyOn(service, 'enviarEmail').mockRejectedValue(new Error('boom'));

      await expect(service.enviarNotificacion(DEST, fixture(notificationType), { nombre: 'Ana' }))
        .rejects.toThrow('boom');

      spy.mockRestore();
    });

    it('trata la ausencia de categoría como que sí soporta email (default true)', async () => {
      const spy = jest.spyOn(service, 'enviarEmail').mockResolvedValue(fixture({ MessageId: 'x' }));
      const nt = { code: 'W', email_subject_template: 'S', email_body_template: 'B', category: null };

      await service.enviarNotificacion(DEST, nt, {});

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('enviarEmail', () => {
    it('omite el envío y audita si la dirección está suprimida', async () => {
      emailSuppression.isSuppressed.mockResolvedValue(true);

      const result = await service.enviarEmail(DEST, 'S', '<p>hi</p>', '', 'notif-3');

      expect(result).toBeNull();
      expect(logAudit).toHaveBeenCalledWith(
        'EMAIL_SUPPRESSED_SEND_SKIPPED',
        'system',
        expect.objectContaining({ notificationId: 'notif-3' }),
        expect.objectContaining({ entityType: 'EmailBounceSuppression' })
      );
      expect(withRetry).not.toHaveBeenCalled();
    });

    it('lanza error si el circuit breaker está abierto', async () => {
      CircuitBreaker.canCall.mockResolvedValue(false);

      await expect(service.enviarEmail(DEST, 'S', '<p>hi</p>')).rejects.toThrow(/circuit breaker/i);
      expect(withRetry).not.toHaveBeenCalled();
    });

    it('camino feliz: registra éxito, loguea success y retorna la respuesta', async () => {
      withRetry.mockResolvedValue({ MessageId: 'ses-ok' });

      const result = await service.enviarEmail(DEST, 'S', '<p>hi</p>', 'texto', 'notif-4');

      expect(CircuitBreaker.recordSuccess).toHaveBeenCalledWith('ses');
      expect(CircuitBreaker.recordFailure).not.toHaveBeenCalled();
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'success', notificationId: 'notif-4' }));
      expect(result).toEqual({ MessageId: 'ses-ok' });
    });

    it('fallo tras reintentos: registra fallo, loguea failed y re-lanza', async () => {
      withRetry.mockRejectedValue(new Error('SES down'));

      await expect(service.enviarEmail(DEST, 'S', '<p>hi</p>')).rejects.toThrow('SES down');

      expect(CircuitBreaker.recordFailure).toHaveBeenCalledWith('ses');
      expect(CircuitBreaker.recordSuccess).not.toHaveBeenCalled();
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'failed', errorCode: 'SES_ERR', errorMessage: 'SES down' })
      );
    });
  });

  describe('enviarEmailConAdjuntos', () => {
    const adjuntos = [{ filename: 'c.pdf', contentType: 'application/pdf', base64: 'QUJD' }];

    it('omite el envío y audita si la dirección está suprimida', async () => {
      emailSuppression.isSuppressed.mockResolvedValue(true);

      const result = await service.enviarEmailConAdjuntos(DEST, 'S', '<p>hi</p>', adjuntos);

      expect(result).toBeNull();
      expect(logAudit).toHaveBeenCalledWith('EMAIL_SUPPRESSED_SEND_SKIPPED', 'system', expect.any(Object), expect.any(Object));
    });

    it('lanza error si el circuit breaker está abierto', async () => {
      CircuitBreaker.canCall.mockResolvedValue(false);

      await expect(service.enviarEmailConAdjuntos(DEST, 'S', '<p>hi</p>', adjuntos)).rejects.toThrow(/circuit breaker/i);
    });

    it('lanza error si el email supera el límite de 10 MB', async () => {
      const enorme = [{ filename: 'big.bin', contentType: 'application/octet-stream', base64: 'A'.repeat(11 * 1024 * 1024) }];

      await expect(service.enviarEmailConAdjuntos(DEST, 'S', '<p>hi</p>', enorme)).rejects.toThrow(/10 MB/);
      expect(withRetry).not.toHaveBeenCalled();
    });

    it('camino feliz: registra éxito y loguea success', async () => {
      withRetry.mockResolvedValue({ MessageId: 'ses-raw-ok' });

      const result = await service.enviarEmailConAdjuntos(DEST, 'S', '<p>hi</p>', adjuntos, 'notif-5');

      expect(CircuitBreaker.recordSuccess).toHaveBeenCalledWith('ses');
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'SES:SendRawEmailCommand', result: 'success', notificationId: 'notif-5' })
      );
      expect(result).toEqual({ MessageId: 'ses-raw-ok' });
    });

    it('fallo tras reintentos: registra fallo, loguea failed y re-lanza', async () => {
      withRetry.mockRejectedValue(new Error('raw fail'));

      await expect(service.enviarEmailConAdjuntos(DEST, 'S', '<p>hi</p>', adjuntos)).rejects.toThrow('raw fail');

      expect(CircuitBreaker.recordFailure).toHaveBeenCalledWith('ses');
      expect(ProviderApiLogger.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed', errorCode: 'SES_ERR' }));
    });
  });

  describe('enviarEmailConPdf', () => {
    it('normaliza el PDF a adjunto base64 y delega en enviarEmailConAdjuntos', () => {
      const spy = jest.spyOn(service, 'enviarEmailConAdjuntos').mockReturnValue(fixture('delegado'));
      const pdf = Buffer.from('contenido-pdf');

      const result = service.enviarEmailConPdf(DEST, 'S', '<p>hi</p>', pdf, 'doc.pdf');

      expect(result).toBe('delegado');
      expect(spy).toHaveBeenCalledWith(DEST, 'S', '<p>hi</p>', [
        { filename: 'doc.pdf', contentType: 'application/pdf', base64: pdf.toString('base64') }
      ]);
      spy.mockRestore();
    });
  });

  describe('_reemplazarVariables', () => {
    it('reemplaza las variables presentes en los datos', () => {
      expect(service._reemplazarVariables('Hola {{nombre}}', { nombre: 'Ana' })).toBe('Hola Ana');
    });

    it('mantiene el placeholder si la variable no está en los datos', () => {
      expect(service._reemplazarVariables('Hola {{nombre}}', {})).toBe('Hola {{nombre}}');
    });

    it('retorna string vacío si el template es falsy', () => {
      expect(service._reemplazarVariables('', {})).toBe('');
      expect(service._reemplazarVariables(null, {})).toBe('');
    });
  });

  describe('_envolverEnLayout', () => {
    it('devuelve el contenido tal cual si la categoría no tiene layout', () => {
      expect(service._envolverEnLayout('cuerpo', {}, {})).toBe('cuerpo');
    });

    it('devuelve el contenido tal cual si ya es un documento HTML completo', () => {
      const doc = '<html><body>x</body></html>';
      const category = { email_layout_template: '<div>{{content}}</div>' };
      expect(service._envolverEnLayout(doc, category, {})).toBe(doc);
    });

    it('envuelve el contenido en el layout y resuelve variables restantes', () => {
      const category = { email_layout_template: '<div>{{content}} - {{logoUrl}}</div>' };
      const result = service._envolverEnLayout('cuerpo', category, { logoUrl: 'L' });
      expect(result).toBe('<div>cuerpo - L</div>');
    });
  });

  describe('_resolverAdjuntos / _normalizarAdjunto', () => {
    it('retorna [] si no hay attachments', () => {
      expect(service._resolverAdjuntos({})).toEqual([]);
      expect(service._resolverAdjuntos({ attachments: [] })).toEqual([]);
    });

    it('normaliza un Buffer a base64', () => {
      const buf = Buffer.from('abc');
      const result = service._resolverAdjuntos({ attachments: [{ filename: 'a.txt', content: buf }] });
      expect(result).toEqual([{ filename: 'a.txt', contentType: 'application/octet-stream', base64: buf.toString('base64') }]);
    });

    it('acepta content string (base64 ya codificado) y aplica contentType por defecto', () => {
      const result = service._resolverAdjuntos({ attachments: [{ filename: 'a.txt', content: 'QUJD' }] });
      expect(result[0]).toMatchObject({ filename: 'a.txt', base64: 'QUJD', contentType: 'application/octet-stream' });
    });

    it('descarta adjuntos sin filename o sin contenido válido', () => {
      const result = service._resolverAdjuntos({
        attachments: [
          { content: 'QUJD' },        // sin filename
          { filename: 'x.txt' },      // sin content
          { filename: 'y.txt', content: '' } // content vacío
        ]
      });
      expect(result).toEqual([]);
    });
  });
});
