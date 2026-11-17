// seeders/20260615000001-notification-types-admin-audit.ts
//
// Tipos de notificación generados por acciones del módulo admin/audit.
//
// Criterios de canal:
//   Interno (admin que ejecutó) → push (+ email en eventos de seguridad) como
//   confirmación trazable de operaciones que alteran el estado del sistema.
//   Cliente → push + email urgente cuando la acción afecta su acceso activo
//   (revocación de sesión = evento de seguridad que el cliente debe saber).
//
// IDEMPOTENCIA: filtra por code — se puede correr N veces sin duplicar.

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;
import { v4 as uuidv4 } from 'uuid';
const TABLE = { tableName: 'notification_types', schema: database.schema };

const CODES = [
  // admin/audit — alertas
  'AUDIT_ALERT_ACKNOWLEDGED',
  'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
  // admin/audit — sesiones
  'AUTH_SESSION_REVOKED_INTERNAL',
  'AUTH_SESSION_REVOKED_CLIENT',
  // admin/audit — reintentos de notificación
  'NOTIFICATION_RETRY_REQUESTED'
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const _base = (title: string, bodyHtml: string) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
        <tr><td style="background:#1a56db;padding:24px 32px;text-align:center">
          <img src="{{logoUrl}}" alt="Logo" height="40" style="display:block;margin:0 auto">
        </td></tr>
        <tr><td style="padding:32px">${bodyHtml}</td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px">Este es un mensaje automático. Por favor no respondas a este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

// ── Email templates ───────────────────────────────────────────────────────────

const SESSION_REVOKED_INTERNAL_EMAIL = _base(
  'Sesión revocada — confirmación',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Acción de seguridad completada</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">
    Has revocado exitosamente la siguiente sesión activa de un usuario.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase">ID de sesión</p>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;font-family:monospace">{{sessionId}}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase">Usuario afectado</p>
      <p style="margin:0;font-size:14px;color:#374151">{{targetUserId}}</p>
    </td></tr>
  </table>
  <p style="color:#374151;font-size:14px;margin:0">
    La acción quedó registrada en el log de auditoría.
    Las credenciales activas del usuario fueron invalidadas de inmediato.
  </p>`
);

const SESSION_REVOKED_CLIENT_EMAIL = _base(
  'Tu sesión fue cerrada por un administrador',
  `
  <h2 style="color:#dc2626;margin:0 0 16px">Aviso de seguridad</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">
    Un administrador de Base Project ha cerrado tu sesión activa.
    Tu acceso fue revocado de inmediato por razones de seguridad.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f7;border-left:4px solid #dc2626;border-radius:4px;margin:0 0 24px">
    <tr><td style="padding:16px 20px">
      <p style="margin:0;font-size:14px;color:#374151">
        Si no reconoces ningún problema con tu cuenta o no solicitaste esta acción,
        <strong>contacta a soporte de inmediato</strong>.
      </p>
    </td></tr>
  </table>
  <p style="color:#374151;font-size:14px;margin:0">
    Puedes volver a iniciar sesión en cualquier momento desde la aplicación.
  </p>`
);

// ── Seeder ────────────────────────────────────────────────────────────────────

export default {
  async up(queryInterface) {
    const now = new Date();

    const allTypes = [
      // ── AUDIT ALERTS — interno ─────────────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'AUDIT_ALERT_ACKNOWLEDGED',
        name: 'Alerta de auditoría reconocida — confirmación al admin',
        description: 'Push al admin que marcó una alerta de auditoría como reconocida.',
        priority: 'low',
        title_template: 'Alerta reconocida',
        body_template: 'Has reconocido la alerta de auditoría {{alertId}}.',
        email_subject_template: null,
        email_body_template: null,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
        name: 'Alertas de auditoría reconocidas en bloque — confirmación al admin',
        description: 'Push al admin que reconoció varias alertas de auditoría en una sola operación.',
        priority: 'low',
        title_template: 'Alertas reconocidas',
        body_template: 'Has reconocido {{acknowledged}} de {{total}} alertas de auditoría.',
        email_subject_template: null,
        email_body_template: null,
        created_at: now,
        updated_at: now
      },

      // ── AUTH SESSIONS — interno + cliente ─────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'AUTH_SESSION_REVOKED_INTERNAL',
        name: 'Sesión revocada por admin — confirmación al admin',
        description: 'Push + email urgente al admin que revocó una sesión activa. Evento de seguridad que requiere trazabilidad.',
        priority: 'urgent',
        title_template: 'Sesión revocada: {{targetUserId}}',
        body_template:
          'Has revocado la sesión {{sessionId}} del usuario {{targetUserId}}. El acceso fue invalidado de inmediato.',
        email_subject_template: 'Confirmación: sesión de usuario revocada en Base Project',
        email_body_template: SESSION_REVOKED_INTERNAL_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'AUTH_SESSION_REVOKED_CLIENT',
        name: 'Sesión revocada por admin — aviso al cliente',
        description: 'Push + email urgente al usuario cuya sesión activa fue cerrada por un administrador.',
        priority: 'urgent',
        title_template: 'Tu sesión fue cerrada por un administrador',
        body_template:
          'Un administrador ha cerrado tu sesión activa en Base Project. Si no reconoces esta acción, contacta a soporte de inmediato.',
        email_subject_template: 'Aviso de seguridad: tu sesión en Base Project fue cerrada por un administrador',
        email_body_template: SESSION_REVOKED_CLIENT_EMAIL,
        created_at: now,
        updated_at: now
      },

      // ── NOTIFICATION RETRY — interno ───────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'NOTIFICATION_RETRY_REQUESTED',
        name: 'Reintento de notificación solicitado — confirmación al admin',
        description: 'Push al admin que solicitó el reintento de entrega de una notificación fallida.',
        priority: 'low',
        title_template: 'Reintento iniciado',
        body_template: 'Has solicitado el reintento de la notificación {{notificationId}} por canal {{canal}}.',
        email_subject_template: null,
        email_body_template: null,
        created_at: now,
        updated_at: now
      }
    ];

    // Re-ejecutable: borra los códigos de este módulo y reinserta todos.
    await queryInterface.bulkDelete(TABLE, { code: CODES });
    await queryInterface.bulkInsert(TABLE, allTypes);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(TABLE, { code: CODES });
  }
} satisfies Migration;
