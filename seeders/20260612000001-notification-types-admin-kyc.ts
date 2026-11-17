// seeders/20260612000001-notification-types-admin-kyc.ts
//
// Tipos de notificación generados por acciones del módulo admin/kyc.
//
// Criterios de canal:
//   Cliente → push + email cuando la acción altera acceso, datos sensibles o requiere acción.
//   Interno → push al admin que ejecutó (confirmación de operación).
//   Global  → push + email cuando aplica a todos los usuarios.
//
// IDEMPOTENCIA: filtra por code — se puede correr N veces sin duplicar.

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;
const TABLE = { tableName: 'notification_types', schema: database.schema };

const CODES = [
  // Existentes
  'CONSENT_TYPE_ADMIN_ACTION',
  // admin-person — cliente
  'USUARIO_CREADO_ADMIN',
  'ACCOUNT_ACTIVATED',
  'ACCOUNT_DEACTIVATED',
  'PASSWORD_RESET_ADMIN',
  'EMAIL_CHANGED_OLD',
  'EMAIL_CHANGED_NEW',
  'NATIONAL_ID_CHANGED',
  'ROL_CHANGE',
  // admin-person — interno
  'PERSON_ADMIN_ACTION',
  // privacy-policy — global
  'PRIVACY_POLICY_UPDATE',
  // notificacion-general — global
  'NOTIFICACION_GENERAL'
];

// ── Email templates ───────────────────────────────────────────────────────────

const _base = (logoSrc: string, title: string, bodyHtml: string) => `<!DOCTYPE html>
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

const USUARIO_CREADO_EMAIL = _base(
  '{{logoUrl}}',
  'Bienvenido a Base Project',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">¡Bienvenido, {{nombre}}!</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Un administrador ha creado una cuenta para ti en Base Project. Tus credenciales de acceso son:</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Email:</strong> {{email}}</p>
      <p style="margin:0;font-size:14px;color:#374151"><strong>Contraseña temporal:</strong> <span style="font-family:monospace;background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #d1d5db">{{passwordTemporal}}</span></p>
    </td></tr>
  </table>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Por seguridad, te recomendamos cambiar tu contraseña en tu primer inicio de sesión.</p>`
);

const ACCOUNT_ACTIVATED_EMAIL = _base(
  '{{logoUrl}}',
  'Cuenta activada',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Hola {{nombre}},</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Tu cuenta en Base Project ha sido <strong>activada</strong>. Ya puedes iniciar sesión y acceder a todos los servicios.</p>`
);

const ACCOUNT_DEACTIVATED_EMAIL = _base(
  '{{logoUrl}}',
  'Cuenta desactivada',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Hola {{nombre}},</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Tu cuenta en Base Project ha sido <strong>desactivada temporalmente</strong>. Si tienes preguntas sobre esta acción, comunícate con soporte.</p>`
);

const PASSWORD_RESET_ADMIN_EMAIL = _base(
  '{{logoUrl}}',
  'Contraseña restablecida por administrador',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Hola {{nombre}},</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Un administrador ha restablecido tu contraseña en Base Project. Tu nueva contraseña temporal es:</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px">
    <tr><td style="padding:16px 20px;text-align:center">
      <p style="margin:0;font-size:20px;font-family:monospace;color:#1a56db;letter-spacing:2px">{{passwordTemporal}}</p>
    </td></tr>
  </table>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0">Por seguridad, cámbiala en tu próximo inicio de sesión. Si no solicitaste este cambio, contacta a soporte de inmediato.</p>`
);

const EMAIL_CHANGED_OLD_EMAIL = _base(
  '{{logoUrl}}',
  'Tu correo electrónico fue actualizado',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Hola {{nombre}},</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Te informamos que el correo electrónico de tu cuenta Base Project fue <strong>actualizado</strong>. Este aviso fue enviado a la dirección anterior: <strong>{{email}}</strong>.</p>
  <p style="color:#dc2626;font-size:15px;font-weight:600;margin:0">Si no reconoces esta acción, contacta a soporte de inmediato.</p>`
);

const NATIONAL_ID_CHANGED_EMAIL = _base(
  '{{logoUrl}}',
  'Tu documento de identidad fue actualizado',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Hola {{nombre}},</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Tu número de documento de identidad en Base Project fue <strong>actualizado</strong> por un administrador.</p>
  <p style="color:#dc2626;font-size:15px;font-weight:600;margin:0">Si no reconoces esta acción, contacta a soporte de inmediato.</p>`
);

const ROL_CHANGE_EMAIL = _base(
  '{{logoUrl}}',
  'Tu rol fue actualizado',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Hola {{nombre}},</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Tu rol en Base Project fue actualizado a <strong>{{nuevo_rol}}</strong>.</p>
  <p style="color:#374151;font-size:14px;line-height:1.6;margin:0">{{permisos_descripcion}}</p>`
);

const PRIVACY_POLICY_EMAIL = _base(
  '{{logoUrl}}',
  'Actualización de política de privacidad',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">Política de privacidad actualizada</h2>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">Hemos publicado una nueva versión de nuestra Política de Privacidad (<strong>v{{nuevaVersion}}</strong>), vigente desde el <strong>{{fechaVigencia}}</strong>.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;border-radius:6px;margin:0 0 24px">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Resumen de cambios</p>
      <p style="margin:0;font-size:14px;color:#374151">{{resumenCambios}}</p>
    </td></tr>
  </table>
  <div style="text-align:center;margin:0 0 16px">
    <a href="{{documentUrl}}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px">Leer política completa</a>
  </div>`
);

const NOTIFICACION_GENERAL_EMAIL = _base(
  '{{logoUrl}}',
  '{{asunto}}',
  `
  <h2 style="color:#1a56db;margin:0 0 16px">{{titulo}}</h2>
  <div style="color:#374151;font-size:15px;line-height:1.6">{{contenido}}</div>`
);

export default {
  async up(queryInterface) {
    const now = new Date();

    const allTypes = [
      // ── CONSENT TYPE ────────────────────────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'CONSENT_TYPE_ADMIN_ACTION',
        name: 'Acción sobre tipo de consentimiento',
        description: 'Push al admin que creó o actualizó un tipo de consentimiento.',
        priority: 'normal',
        title_template: 'Tipo de consentimiento {{accion}}',
        body_template: "Has {{accion}} el tipo de consentimiento '{{code}}'.",
        email_subject_template: null,
        email_body_template: null,
        created_at: now,
        updated_at: now
      },

      // ── ADMIN PERSON — cliente ──────────────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'USUARIO_CREADO_ADMIN',
        name: 'Usuario creado por administrador',
        description: 'Email al nuevo usuario con sus credenciales cuando un admin crea su cuenta.',
        priority: 'high',
        title_template: '¡Bienvenido a Base Project!',
        body_template: 'Hola {{nombre}}, un administrador ha creado tu cuenta. Tu contraseña temporal es: {{passwordTemporal}}.',
        email_subject_template: 'Tu cuenta en Base Project ha sido creada',
        email_body_template: USUARIO_CREADO_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'ACCOUNT_ACTIVATED',
        name: 'Cuenta activada',
        description: 'Push + email al cliente cuando el admin activa su cuenta.',
        priority: 'high',
        title_template: 'Tu cuenta fue activada',
        body_template: 'Tu cuenta en Base Project ha sido activada. Ya puedes iniciar sesión.',
        email_subject_template: 'Tu cuenta de Base Project fue activada',
        email_body_template: ACCOUNT_ACTIVATED_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'ACCOUNT_DEACTIVATED',
        name: 'Cuenta desactivada',
        description: 'Push + email al cliente cuando el admin desactiva su cuenta.',
        priority: 'high',
        title_template: 'Tu cuenta fue desactivada',
        body_template: 'Tu cuenta en Base Project ha sido desactivada temporalmente. Contacta a soporte para más información.',
        email_subject_template: 'Tu cuenta de Base Project fue desactivada',
        email_body_template: ACCOUNT_DEACTIVATED_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'PASSWORD_RESET_ADMIN',
        name: 'Contraseña restablecida por admin',
        description: 'Email al cliente con la nueva contraseña temporal cuando el admin la restablece.',
        priority: 'high',
        title_template: 'Tu contraseña fue restablecida',
        body_template: 'Un administrador restableci tu contraseña. Tu contraseña temporal es: {{passwordTemporal}}.',
        email_subject_template: 'Tu contraseña de Base Project fue restablecida',
        email_body_template: PASSWORD_RESET_ADMIN_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'EMAIL_CHANGED_OLD',
        name: 'Cambio de email — aviso al correo anterior',
        description: 'Email al correo antiguo cuando el admin actualiza el email del cliente (crearNotificacionDirecta).',
        priority: 'high',
        title_template: 'Tu correo fue actualizado',
        body_template: 'Tu correo electrónico en Base Project fue actualizado.',
        email_subject_template: 'Aviso de seguridad: tu correo en Base Project fue actualizado',
        email_body_template: EMAIL_CHANGED_OLD_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'EMAIL_CHANGED_NEW',
        name: 'Cambio de email — confirmación al nuevo correo',
        description: 'Push al cliente cuando el admin actualiza su email (confirmación en el nuevo correo).',
        priority: 'normal',
        title_template: 'Tu correo fue actualizado',
        body_template: 'Tu correo electrónico en Base Project fue actualizado a {{email}} exitosamente.',
        email_subject_template: null,
        email_body_template: null,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'NATIONAL_ID_CHANGED',
        name: 'Documento de identidad actualizado por admin',
        description: 'Push + email al cliente cuando el admin actualiza su número de documento.',
        priority: 'high',
        title_template: 'Tu documento de identidad fue actualizado',
        body_template: 'Tu número de documento de identidad en Base Project fue actualizado por un administrador.',
        email_subject_template: 'Aviso: tu documento de identidad en Base Project fue actualizado',
        email_body_template: NATIONAL_ID_CHANGED_EMAIL,
        created_at: now,
        updated_at: now
      },
      {
        notification_type_id: uuidv4(),
        code: 'ROL_CHANGE',
        name: 'Rol actualizado',
        description: 'Push + email al cliente cuando el admin cambia su rol en la plataforma.',
        priority: 'normal',
        title_template: 'Tu rol fue actualizado a {{nuevo_rol}}',
        body_template: 'Tu rol en Base Project fue actualizado a {{nuevo_rol}}.',
        email_subject_template: 'Tu rol en Base Project fue actualizado',
        email_body_template: ROL_CHANGE_EMAIL,
        created_at: now,
        updated_at: now
      },

      // ── ADMIN PERSON — interno ──────────────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'PERSON_ADMIN_ACTION',
        name: 'Acción administrativa sobre persona',
        description: 'Push interno al administrador que ejecutó una acción sobre un usuario.',
        priority: 'low',
        title_template: 'Acción completada',
        body_template: 'Has ejecutado la acción "{{accion}}" sobre el usuario {{userId}} exitosamente.',
        email_subject_template: null,
        email_body_template: null,
        created_at: now,
        updated_at: now
      },

      // ── PRIVACY POLICY — global ─────────────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'PRIVACY_POLICY_UPDATE',
        name: 'Actualización de política de privacidad',
        description:
          'Notificación global (userId=null) cuando se publica una nueva versión de la política de privacidad (RF-ADM-04).',
        priority: 'normal',
        title_template: 'Actualizamos nuestra Política de Privacidad (v{{nuevaVersion}})',
        body_template:
          'Hemos actualizado nuestra Política de Privacidad. Vigente desde {{fechaVigencia}}. Revisa los cambios en la app.',
        email_subject_template: 'Actualización de Política de Privacidad — v{{nuevaVersion}}',
        email_body_template: PRIVACY_POLICY_EMAIL,
        created_at: now,
        updated_at: now
      },

      // ── NOTIFICACION GENERAL — global ───────────────────────────────────────

      {
        notification_type_id: uuidv4(),
        code: 'NOTIFICACION_GENERAL',
        name: 'Notificación general',
        description:
          'Notificación global (userId=null) de contenido libre enviada por el admin. Soporta push + email con templates dinámicos.',
        priority: 'normal',
        title_template: '{{titulo}}',
        body_template: '{{contenido}}',
        email_subject_template: '{{asunto}}',
        email_body_template: NOTIFICACION_GENERAL_EMAIL,
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
