// seeders/20260609000001-notification-types-shared-kyc.ts
//
// Notificaciones para shared-endpoints/kyc/
// Services: auth-login, mfa, profile, contact-inquiry (BIENVENIDA → client-kyc seeder)
// (maintainers no genera notificaciones — solo catálogos)
//
// CANALES:
//   - Interno   → siempre (se inserta en tabla notifications). Es la base.
//   - Email SES → eventos de seguridad o cambios críticos que el usuario debe saber.
//   - Push SNS  → alertas inmediatas que necesitan atención en el momento.
//
// DECISIONES DE CANAL POR TIPO:
//   NUEVO_DISPOSITIVO       → email + push (alerta de seguridad, acción inmediata posible)
//   ACCOUNT_BLOCKED         → email + push (el usuario no puede entrar, necesita saberlo ya)
//   LOGOUT_ALL              → email (alguien cerró todas las sesiones, puede no ser él)
//   TOTP_ACTIVADO/ELIMINADO → solo interno (el usuario lo hizo él, ya lo sabe)
//   SMS_MFA_ACTIVADO/ELIM.  → solo interno (ídem)
//   PASSWORD_UPDATED        → email (cambio de seguridad crítico, auditable por email)
//   EMAIL_UPDATED           → email (confirmación al correo anterior)
//   PHONE_UPDATED           → solo interno (el usuario lo hizo él)
//   PROFILE_UPDATED         → solo interno (cambios cosméticos, el usuario lo hizo él)
//   NATIONAL_ID_UPDATED     → email (dato sensible, confirmación necesaria)
//   CUENTA_ELIMINADA        → email (confirmación final, crearNotificacionDirecta)
//   CONTACT_INQUIRY_ACUSE   → email (acuse al remitente, puede no tener cuenta)
//   CONTACT_INQUIRY_ADMIN   → email (alerta al equipo interno)
//
// IDEMPOTENCIA: filtra por code antes de insertar — se puede correr N veces.

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database, notifications } = constantsModule;
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;

const SCHEMA = database.schema;

const ALL_CODES = [
  'NUEVO_DISPOSITIVO_DETECTADO',
  'ACCOUNT_BLOCKED',
  'LOGOUT_ALL',
  'TOTP_ACTIVADO',
  'TOTP_ELIMINADO',
  'SMS_MFA_ACTIVADO',
  'SMS_MFA_DESACTIVADO',
  'PROFILE_UPDATED',
  'EMAIL_UPDATED',
  'PHONE_UPDATED',
  'PASSWORD_UPDATED',
  'NATIONAL_ID_UPDATED',
  'CUENTA_ELIMINADA',
];

export default {
  async up(queryInterface) {
    const logo = notifications?.ses?.logoUrl || 'https://via.placeholder.com/150';

    const allTypes = [
      // ══════════════════════════════════════════════════════════════════════
      // AUTH-LOGIN — acceso y seguridad (BIENVENIDA está en client-kyc seeder)
      // ══════════════════════════════════════════════════════════════════════

      // [RF-AUTH-03] | CA-03 | Tipo de notificación para nuevo dispositivo detectado;
      // supports_push: true + supports_email: true. Metadata: nombre, ip, browser, os,
      // ciudad, país, deviceName, fechaAcceso
      {
        notification_type_id: uuidv4(),
        code: 'NUEVO_DISPOSITIVO_DETECTADO',
        name: 'Nuevo Dispositivo Detectado',
        description: 'Alerta de seguridad cuando el usuario accede desde un dispositivo no reconocido',
        priority: 'high',
        title_template: 'Nuevo acceso desde un dispositivo no reconocido',
        body_template:
          'Detectamos un acceso desde {{browser}} en {{os}}, {{ciudad}}. Si no fuiste tú, bloquéalo desde Configuración → Dispositivos.',
        email_subject_template: 'Alerta de seguridad: nuevo acceso a tu cuenta',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #e67e22;">⚠️ Nuevo acceso desde un dispositivo no reconocido</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Detectamos un inicio de sesión desde un <strong>dispositivo no reconocido</strong>. El acceso fue <strong>permitido</strong>, pero te avisamos para que puedas revisarlo.</p>
                <div style="background-color: #f8f9fa; border-left: 4px solid #e67e22; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 4px 0;"><strong>Fecha:</strong> {{fechaAcceso}}</p>
                  <p style="margin: 4px 0;"><strong>IP:</strong> {{ip}}</p>
                  <p style="margin: 4px 0;"><strong>Navegador:</strong> {{browser}}</p>
                  <p style="margin: 4px 0;"><strong>Sistema operativo:</strong> {{os}}</p>
                  <p style="margin: 4px 0;"><strong>Ubicación:</strong> {{ciudad}}, {{pais}}</p>
                  <p style="margin: 4px 0;"><strong>Dispositivo:</strong> {{deviceName}}</p>
                </div>
                <p>Si <strong>fuiste tú</strong>, no necesitas hacer nada.</p>
                <p>Si <strong>no reconoces esta actividad</strong>, bloquea el dispositivo desde <strong>Configuración → Dispositivos</strong> y cambia tu contraseña.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        // NUEVO — no existía en seeders anteriores
        notification_type_id: uuidv4(),
        code: 'ACCOUNT_BLOCKED',
        name: 'Cuenta Bloqueada',
        description: 'Alerta cuando la cuenta queda bloqueada por múltiples intentos fallidos de login',
        priority: 'high',
        title_template: 'Tu cuenta ha sido bloqueada temporalmente',
        body_template:
          'Tu cuenta fue bloqueada por {{intentosFallidos}} intentos fallidos. Estará disponible en {{minutosBloqueo}} minutos.',
        email_subject_template: 'Aviso de seguridad: cuenta bloqueada temporalmente',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #dc3545;">🔒 Cuenta bloqueada temporalmente</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Tu cuenta fue <strong>bloqueada temporalmente</strong> por múltiples intentos de inicio de sesión fallidos.</p>
                <div style="background-color: #fff3cd; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 4px 0;"><strong>Motivo:</strong> {{intentosFallidos}} intentos fallidos consecutivos</p>
                  <p style="margin: 4px 0;"><strong>Duración del bloqueo:</strong> {{minutosBloqueo}} minutos</p>
                </div>
                <p>Si <strong>fuiste tú</strong>, espera {{minutosBloqueo}} minutos e intenta de nuevo.</p>
                <p>Si <strong>no reconoces esta actividad</strong>, contacta a soporte de inmediato.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        // NUEVO — no existía en seeders anteriores
        notification_type_id: uuidv4(),
        code: 'LOGOUT_ALL',
        name: 'Cierre de Todas las Sesiones',
        description: 'Notificación cuando el usuario cierra todas sus sesiones activas',
        priority: 'high',
        title_template: 'Todas tus sesiones fueron cerradas',
        body_template: 'Todas las sesiones activas de tu cuenta fueron cerradas.',
        email_subject_template: 'Aviso de seguridad: todas tus sesiones fueron cerradas',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #343a40;">🔐 Cierre masivo de sesiones</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Te informamos que <strong>todas las sesiones activas</strong> de tu cuenta fueron cerradas.</p>
                <p>Si <strong>fuiste tú</strong>, no necesitas hacer nada.</p>
                <p>Si <strong>no reconoces esta acción</strong>, cambia tu contraseña inmediatamente y contacta a soporte.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ══════════════════════════════════════════════════════════════════════
      // MFA — autenticación de doble factor
      // Solo interno: el usuario realizó la acción, ya la sabe.
      // ══════════════════════════════════════════════════════════════════════

      {
        notification_type_id: uuidv4(),
        code: 'TOTP_ACTIVADO',
        name: 'TOTP Activado',
        description: 'Registro interno cuando el usuario activa TOTP (autenticador)',
        priority: 'low',
        title_template: 'Autenticador TOTP activado',
        body_template: 'Has activado la autenticación de dos factores (TOTP) en tu cuenta.',
        email_subject_template: null,
        email_body_template: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        notification_type_id: uuidv4(),
        code: 'TOTP_ELIMINADO',
        name: 'TOTP Desactivado',
        description: 'Registro interno cuando el usuario desactiva su propio TOTP',
        priority: 'low',
        title_template: 'Autenticador TOTP desactivado',
        body_template: 'Has desactivado la autenticación de dos factores (TOTP) de tu cuenta.',
        email_subject_template: null,
        email_body_template: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        // NUEVO — bug fix: mfa.service usaba TOTP_ACTIVADO para SMS MFA
        notification_type_id: uuidv4(),
        code: 'SMS_MFA_ACTIVADO',
        name: 'SMS MFA Activado',
        description: 'Registro interno cuando el usuario activa SMS como método MFA',
        priority: 'low',
        title_template: 'SMS MFA activado',
        body_template: 'Has activado la autenticación por SMS en tu cuenta.',
        email_subject_template: null,
        email_body_template: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        // NUEVO — bug fix: mfa.service usaba TOTP_ELIMINADO para SMS MFA
        notification_type_id: uuidv4(),
        code: 'SMS_MFA_DESACTIVADO',
        name: 'SMS MFA Desactivado',
        description: 'Registro interno cuando el usuario desactiva SMS como método MFA',
        priority: 'low',
        title_template: 'SMS MFA desactivado',
        body_template: 'Has desactivado la autenticación por SMS de tu cuenta.',
        email_subject_template: null,
        email_body_template: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ══════════════════════════════════════════════════════════════════════
      // PROFILE — actualizaciones de datos personales
      // ══════════════════════════════════════════════════════════════════════

      {
        notification_type_id: uuidv4(),
        code: 'PROFILE_UPDATED',
        name: 'Perfil Actualizado',
        description: 'Registro interno cuando el usuario actualiza datos de su perfil (username, avatar, género, ubicación)',
        priority: 'low',
        title_template: 'Perfil actualizado',
        body_template: 'Has actualizado tu perfil exitosamente.',
        email_subject_template: null,
        email_body_template: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        notification_type_id: uuidv4(),
        code: 'EMAIL_UPDATED',
        name: 'Email Actualizado',
        description: 'Confirmación al correo anterior cuando el usuario actualiza su email',
        priority: 'high',
        title_template: 'Tu correo electrónico fue actualizado',
        body_template: 'Has actualizado tu correo electrónico.',
        email_subject_template: 'Aviso: tu correo electrónico fue actualizado',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #343a40;">📧 Cambio de correo electrónico</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Te confirmamos que el correo electrónico asociado a tu cuenta fue <strong>actualizado</strong>.</p>
                <p>Si <strong>no reconoces este cambio</strong>, contacta a soporte de inmediato.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        notification_type_id: uuidv4(),
        code: 'PHONE_UPDATED',
        name: 'Teléfono Actualizado',
        description: 'Registro interno cuando el usuario actualiza su número de teléfono',
        priority: 'low',
        title_template: 'Teléfono actualizado',
        body_template: 'Has actualizado tu número de teléfono exitosamente.',
        email_subject_template: null,
        email_body_template: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        notification_type_id: uuidv4(),
        code: 'PASSWORD_UPDATED',
        name: 'Contraseña Actualizada',
        description: 'Confirmación por email cuando el usuario cambia su propia contraseña desde perfil',
        priority: 'high',
        title_template: 'Tu contraseña fue actualizada',
        body_template: 'Has cambiado tu contraseña exitosamente.',
        email_subject_template: 'Aviso de seguridad: tu contraseña fue actualizada',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #343a40;">🔑 Contraseña actualizada</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Tu <strong>contraseña fue actualizada correctamente</strong>.</p>
                <p>Si <strong>no reconoces este cambio</strong>, contacta a soporte de inmediato y cambia tu contraseña.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        notification_type_id: uuidv4(),
        code: 'NATIONAL_ID_UPDATED',
        name: 'ID Nacional Actualizado',
        description: 'Confirmación por email cuando el usuario actualiza su número de identificación',
        priority: 'high',
        title_template: 'Tu número de identificación fue actualizado',
        body_template: 'Has actualizado tu número de identificación nacional exitosamente.',
        email_subject_template: 'Aviso: tu número de identificación fue actualizado',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #343a40;">🪪 Identificación actualizada</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Tu <strong>número de identificación nacional fue actualizado</strong> en tu cuenta.</p>
                <p>Si <strong>no reconoces este cambio</strong>, contacta a soporte de inmediato.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      {
        notification_type_id: uuidv4(),
        code: 'CUENTA_ELIMINADA',
        name: 'Cuenta Eliminada',
        description: 'Confirmación por email cuando el usuario elimina su cuenta (crearNotificacionDirecta)',
        priority: 'high',
        title_template: 'Tu cuenta fue eliminada',
        body_template: 'Tu cuenta fue eliminada exitosamente.',
        email_subject_template: 'Tu cuenta de Base Project fue eliminada',
        email_body_template: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px;">
              <div style="text-align: center;">
                <img src="${logo}" alt="Logo" style="width: 150px; margin-bottom: 20px;">
                <h2 style="color: #dc3545;">Cuenta eliminada</h2>
              </div>
              <div style="font-size: 16px; color: #333; line-height: 1.6; margin: 20px 0;">
                <p>Hola <strong>{{nombre}}</strong>,</p>
                <p>Tu cuenta de <strong>Base Project fue eliminada exitosamente</strong>. Tus datos serán tratados según nuestra política de privacidad.</p>
                <p>Si tienes alguna duda, contáctanos en soporte.</p>
              </div>
              <div style="font-size: 12px; color: #555; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
                <p>Este es un correo automático, por favor no respondas a este mensaje.</p>
              </div>
            </body>
          </html>
        `,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },

      // ══════════════════════════════════════════════════════════════════════
      // CONTACT-INQUIRY — PQRS
      // Usan crearNotificacionDirecta (el remitente puede no tener cuenta).
      // NUEVO — no existían en ningún seeder anterior.
      // ══════════════════════════════════════════════════════════════════════


    ];

    // Re-ejecutable: borra los códigos de este módulo y reinserta todos.
    const TABLE = { tableName: 'notification_types', schema: SCHEMA };
    await queryInterface.bulkDelete(TABLE, { code: ALL_CODES });
    await queryInterface.bulkInsert(TABLE, allTypes);

    console.log(`✅ ${allTypes.length} tipo(s) de notificación shared-kyc reinsertados.`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete({ tableName: 'notification_types', schema: SCHEMA }, { code: ALL_CODES }, {});
    console.log('✅ Tipos de notificación shared-kyc eliminados');
  }
} satisfies Migration;
