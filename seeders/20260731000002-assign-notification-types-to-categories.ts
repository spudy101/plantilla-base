// Asigna cada NotificationType (evento) a su categoría (grupo). Idempotente.
// El mapeo se hace por código: UPDATE notification_types.notification_category_id según la categoría.
// Editable después desde el admin (PATCH /notification-types/:id con notificationCategoryId).

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

// code de categoría → códigos de tipo que le pertenecen.
const MAPPING = {
  SECURITY: [
    'AUTH_SESSION_REVOKED_CLIENT',
    'AUTH_SESSION_REVOKED_INTERNAL',
    'IAM_INTERNAL_USER_SESSIONS_CLOSED',
    'LOGOUT_ALL',
    'NUEVO_DISPOSITIVO_DETECTADO',
    'PASSWORD_UPDATED',
    'PASSWORD_RESET_ADMIN',
    'RESET_PASSWORD',
    'SOLICITUD_RESET_PASSWORD',
    'RESET_MFA',
    'SOLICITUD_RESET_MFA',
    'TOTP_ACTIVADO',
    'TOTP_ELIMINADO',
    'SMS_MFA_ACTIVADO',
    'SMS_MFA_DESACTIVADO',
    'BIOMETRIC_CREDENTIAL_REGISTERED',
    'CODIGO_VERIFICACION',
    'ACCOUNT_BLOCKED',
    'EMAIL_CHANGED_NEW',
    'EMAIL_CHANGED_OLD',
    'NATIONAL_ID_CHANGED'
  ],
  ACCOUNT: [
    'BIENVENIDA',
    'ACCOUNT_ACTIVATED',
    'ACCOUNT_DEACTIVATED',
    'CUENTA_ELIMINADA',
    'PROFILE_UPDATED',
    'EMAIL_UPDATED',
    'PHONE_UPDATED',
    'NATIONAL_ID_UPDATED',
    'USUARIO_CREADO_ADMIN',
    'PRIVACY_POLICY_UPDATE',
    'ROL_CHANGE'
  ],
  TRANSACTIONAL: [
    'RBAC_SECOND_APPROVER',
    'DUAL_APPROVAL_RESOLVED',
    // Aprobadores maker-checker de otros dominios (si existen en la BD).
  ],
  COMMERCIAL: ['NOTIFICACION_GENERAL'],
  SYSTEM_ADMIN: [
    'AUDIT_ALERT_ACKNOWLEDGED',
    'AUDIT_ALERTS_BULK_ACKNOWLEDGED',
    'CONSENT_TYPE_ADMIN_ACTION',
    'PERSON_ADMIN_ACTION',
    'IAM_ADMIN_ROLE_CHANGED',
    'IAM_ADMIN_STATUS_CHANGED',
    'IAM_ADMIN_USER_CREATED',
    'IAM_INTERNAL_USER_ACTIVATED',
    'IAM_INTERNAL_USER_CREATED',
    'IAM_INTERNAL_USER_DEACTIVATED',
    'IAM_INTERNAL_USER_ROLE_CHANGED',
    'IAM_RBAC_PERMISSION_GRANTED',
    'IAM_RBAC_PERMISSION_REVOKED',
    'NOTIFICATION_RETRY_REQUESTED'
  ]
};

export default {
  async up(queryInterface) {
    const q = queryInterface.sequelize;
    for (const [categoryCode, typeCodes] of Object.entries(MAPPING)) {
      const inList = typeCodes.map(c => `'${c}'`).join(',');
      await q.query(
        `UPDATE "${SCHEMA}"."notification_types"
         SET notification_category_id = (
           SELECT notification_category_id FROM "${SCHEMA}"."notification_categories" WHERE code = '${categoryCode}'
         ),
         updated_at = NOW()
         WHERE code IN (${inList})`
      );
    }
  },

  async down(queryInterface) {
    const allCodes = Object.values(MAPPING).flat();
    const inList = allCodes.map(c => `'${c}'`).join(',');
    await queryInterface.sequelize.query(
      `UPDATE "${SCHEMA}"."notification_types" SET notification_category_id = NULL WHERE code IN (${inList})`
    );
  }
} satisfies Migration;
