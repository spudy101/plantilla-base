// tests/unit/modules/schemas/notification/services/notification-scheduler.service.test.ts
//
// NotificationSchedulerService — programación de envíos alrededor de las "quiet hours". Probamos la
// lógica pura de valor, no el acceso a datos: (1) isInQuietHours resuelve las tres ramas —sin ventana,
// ventana dentro del mismo día, y ventana que cruza medianoche—; (2) calcularFinQuietHours calcula el
// instante de reanudación (default +15 min, hoy si la hora aún no pasó, mañana si ya pasó); (3) los
// programar* escriben en el repo la fecha calculada bajo la columna del canal correcto; (4)
// procesarNotificacionesProgramadas devuelve los pendientes y propaga errores. El reloj se fija con
// fake timers para que getHours/getMinutes y Date.now sean deterministas. Repo y logger se mockean.

jest.mock('modules/schemas/notification/repositories/notification.repository', () => ({
  update: jest.fn().mockResolvedValue(undefined),
  findScheduledReady: jest.fn()
}));

jest.mock('shared/utils/logger.util', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
  logAudit: jest.fn()
}));

import { mocked } from 'tests/helpers/mock';
import notificationRepoModule from 'modules/schemas/notification/repositories/notification.repository';
const notificationRepo = mocked(notificationRepoModule);
import scheduler from 'modules/schemas/notification/services/notification-scheduler.service';

// Reloj fijo: 15-jun-2026 23:30:00 hora local. getHours()=23, getMinutes()=30 → "23:30:00".
const FIXED_NOW = new Date(2026, 5, 15, 23, 30, 0);

describe('NotificationSchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isInQuietHours', () => {
    it('sin ventana configurada (start/end ausentes) devuelve false', () => {
      expect(scheduler.isInQuietHours(null)).toBe(false);
      expect(scheduler.isInQuietHours({})).toBe(false);
      expect(scheduler.isInQuietHours({ quiet_hours_start: '22:00:00' })).toBe(false);
      expect(scheduler.isInQuietHours({ quiet_hours_end: '08:00:00' })).toBe(false);
    });

    it('ventana dentro del mismo día: dentro del rango es true', () => {
      // 23:30 ∈ [22:00, 23:59)
      expect(scheduler.isInQuietHours({ quiet_hours_start: '22:00:00', quiet_hours_end: '23:59:00' })).toBe(true);
    });

    it('ventana dentro del mismo día: antes del inicio es false', () => {
      // 23:30 ∉ [08:00, 09:00)
      expect(scheduler.isInQuietHours({ quiet_hours_start: '08:00:00', quiet_hours_end: '09:00:00' })).toBe(false);
    });

    it('ventana dentro del mismo día: el fin es exclusivo', () => {
      jest.setSystemTime(new Date(2026, 5, 15, 23, 59, 0)); // exactamente el end
      expect(scheduler.isInQuietHours({ quiet_hours_start: '22:00:00', quiet_hours_end: '23:59:00' })).toBe(false);
    });

    it('ventana que cruza medianoche: en la parte nocturna (>= start) es true', () => {
      // 23:30 con ventana [22:00, 08:00) → true por currentTime >= start
      expect(scheduler.isInQuietHours({ quiet_hours_start: '22:00:00', quiet_hours_end: '08:00:00' })).toBe(true);
    });

    it('ventana que cruza medianoche: en la madrugada (< end) es true', () => {
      jest.setSystemTime(new Date(2026, 5, 15, 3, 0, 0)); // 03:00
      expect(scheduler.isInQuietHours({ quiet_hours_start: '22:00:00', quiet_hours_end: '08:00:00' })).toBe(true);
    });

    it('ventana que cruza medianoche: en pleno día está fuera de la ventana', () => {
      jest.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 12:00
      expect(scheduler.isInQuietHours({ quiet_hours_start: '22:00:00', quiet_hours_end: '08:00:00' })).toBe(false);
    });
  });

  describe('calcularFinQuietHours', () => {
    it('sin quiet_hours_end usa el default de +15 minutos desde ahora', () => {
      const FIFTEEN_MIN_MS = 15 * 60 * 1000;
      const result = scheduler.calcularFinQuietHours({});
      expect(result.getTime()).toBe(FIXED_NOW.getTime() + FIFTEEN_MIN_MS);
    });

    it('si la hora de fin ya pasó hoy, programa para mañana', () => {
      // Son las 23:30; fin 08:00 ya pasó → mañana 08:00 local.
      const result = scheduler.calcularFinQuietHours({ quiet_hours_end: '08:00' });
      const esperado = new Date(FIXED_NOW);
      esperado.setHours(8, 0, 0, 0);
      esperado.setDate(esperado.getDate() + 1);
      expect(result.getTime()).toBe(esperado.getTime());
    });

    it('si la hora de fin aún no pasa hoy, programa para hoy', () => {
      // Son las 23:30; fin 23:59 aún no pasa → hoy 23:59 local.
      const result = scheduler.calcularFinQuietHours({ quiet_hours_end: '23:59' });
      const esperado = new Date(FIXED_NOW);
      esperado.setHours(23, 59, 0, 0);
      expect(result.getTime()).toBe(esperado.getTime());
    });
  });

  describe('programarEnvioPush', () => {
    it('persiste la fecha calculada en scheduled_for y push_next_retry_at', async () => {
      const pref = { quiet_hours_end: '08:00' };
      const esperado = scheduler.calcularFinQuietHours(pref);

      await scheduler.programarEnvioPush('n-1', pref);

      expect(notificationRepo.update).toHaveBeenCalledWith('n-1', {
        scheduled_for: esperado,
        push_next_retry_at: esperado
      });
    });
  });

  describe('programarEnvioEmail', () => {
    it('persiste la fecha calculada en scheduled_for y email_next_retry_at', async () => {
      const pref = { quiet_hours_end: '08:00' };
      const esperado = scheduler.calcularFinQuietHours(pref);

      await scheduler.programarEnvioEmail('n-2', pref);

      expect(notificationRepo.update).toHaveBeenCalledWith('n-2', {
        scheduled_for: esperado,
        email_next_retry_at: esperado
      });
    });
  });

  describe('programarEnvioSms', () => {
    it('persiste la fecha calculada en scheduled_for y sms_next_retry_at', async () => {
      const pref = { quiet_hours_end: '08:00' };
      const esperado = scheduler.calcularFinQuietHours(pref);

      await scheduler.programarEnvioSms('n-3', pref);

      expect(notificationRepo.update).toHaveBeenCalledWith('n-3', {
        scheduled_for: esperado,
        sms_next_retry_at: esperado
      });
    });
  });

  describe('procesarNotificacionesProgramadas', () => {
    it('devuelve las notificaciones programadas listas para enviar', async () => {
      const listas = [{ notification_id: 'n-1' }, { notification_id: 'n-2' }];
      notificationRepo.findScheduledReady.mockResolvedValue(listas);

      const result = await scheduler.procesarNotificacionesProgramadas();

      expect(result).toBe(listas);
      expect(notificationRepo.findScheduledReady).toHaveBeenCalledTimes(1);
    });

    it('propaga el error si falla la consulta de programadas', async () => {
      notificationRepo.findScheduledReady.mockRejectedValue(new Error('db down'));
      await expect(scheduler.procesarNotificacionesProgramadas()).rejects.toThrow('db down');
    });
  });
});
