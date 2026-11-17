// Categorías (grupos) de notificación del template. Patrón borrar-y-reinsertar (idempotente).
// La categoría es la fuente de verdad de canales (email/sms/push), DND y layout base del email.
//
// El email_layout_template es el "cascarón" HTML+CSS compartido: contiene {{content}}, donde el
// email-notification.service inyecta el email_body_template (fragmento) de cada tipo. Así todos los
// emails de una categoría heredan el mismo diseño y editar cada notificación es solo cambiar texto.

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;

const SCHEMA = database.schema;
const TABLE = { tableName: 'notification_categories', schema: SCHEMA };

// Layout base compartido. accent = color de la barra superior por categoría.
const buildLayout = (accent: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="height:6px;background:${accent};"></td></tr>
        <tr><td style="padding:24px 32px 8px 32px;" align="left">
          <img src="{{logoUrl}}" alt="Base Project" style="max-height:40px;">
        </td></tr>
        <tr><td style="padding:8px 32px 24px 32px;font-size:15px;line-height:1.6;color:#333;">
          {{content}}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:#999;" align="center">
          Este es un mensaje automático de Base Project. Podés gestionar tus preferencias de notificación desde la app.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const now = new Date();

const categories = [
  {
    code: 'SECURITY',
    name: 'Seguridad',
    description: 'Eventos de seguridad de la cuenta: inicio de sesión, MFA, cambios de credenciales.',
    supports_push: true,
    supports_email: true,
    supports_sms: true,
    allow_dnd: false,
    is_critical: true,
    priority: 'urgent',
    accent: '#c0392b',
    sort_order: 1
  },
  {
    code: 'EMERGENCY',
    name: 'Emergencia',
    description: 'Alertas operativas urgentes que no pueden silenciarse.',
    supports_push: true,
    supports_email: true,
    supports_sms: true,
    allow_dnd: false,
    is_critical: true,
    priority: 'urgent',
    accent: '#e74c3c',
    sort_order: 2
  },
  {
    code: 'TRANSACTIONAL',
    name: 'Transaccional',
    description: 'Aprobaciones, verificación biométrica, KYC y documentos.',
    supports_push: true,
    supports_email: true,
    supports_sms: false,
    allow_dnd: true,
    is_critical: false,
    priority: 'high',
    accent: '#2d6cdf',
    sort_order: 3
  },
  {
    code: 'ACCOUNT',
    name: 'Cuenta',
    description: 'Registro, verificación de cuenta y cambios de perfil.',
    supports_push: true,
    supports_email: true,
    supports_sms: false,
    allow_dnd: true,
    is_critical: false,
    priority: 'normal',
    accent: '#16a085',
    sort_order: 4
  },
  {
    code: 'COMMERCIAL',
    name: 'Comercial',
    description: 'Promociones y avisos comerciales.',
    supports_push: true,
    supports_email: true,
    supports_sms: false,
    allow_dnd: true,
    is_critical: false,
    priority: 'low',
    accent: '#8e44ad',
    sort_order: 5
  },
  {
    code: 'SYSTEM_ADMIN',
    name: 'Sistema (admin)',
    description: 'Avisos operativos internos dirigidos a administradores.',
    supports_push: false,
    supports_email: true,
    supports_sms: false,
    allow_dnd: true,
    is_critical: false,
    priority: 'high',
    accent: '#34495e',
    sort_order: 6
  }
];

const ALL_CODES = categories.map(c => c.code);

const rows = categories.map(c => ({
  notification_category_id: uuidv4(),
  code: c.code,
  name: c.name,
  description: c.description,
  supports_push: c.supports_push,
  supports_email: c.supports_email,
  supports_sms: c.supports_sms,
  allow_dnd: c.allow_dnd,
  is_critical: c.is_critical,
  default_quiet_hours_start: null,
  default_quiet_hours_end: null,
  priority: c.priority,
  email_layout_template: buildLayout(c.accent),
  sort_order: c.sort_order,
  is_active: true,
  created_at: now,
  updated_at: now
}));

export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM "${SCHEMA}"."notification_categories" WHERE code IN (${ALL_CODES.map(c => `'${c}'`).join(',')})`
    );
    await queryInterface.bulkInsert(TABLE, rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(TABLE, { code: ALL_CODES });
  }
} satisfies Migration;
