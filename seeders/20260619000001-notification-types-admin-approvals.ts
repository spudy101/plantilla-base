// Tipos de notificación del framework de doble aprobación global (maker-checker).
// Patrón borrar-y-reinsertar (idempotente) — un seeder por módulo.
//
//   RBAC_SECOND_APPROVER  → aviso al ADMIN de una operación sensible pendiente (cambio de rol,
//                           borrado de cuenta/usuario, corrección de identidad)
//   DUAL_APPROVAL_RESOLVED → aviso al maker cuando su solicitud se aprueba/rechaza

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;
import { v4 as uuidv4 } from 'uuid';

const SCHEMA = database.schema;
const TABLE = { tableName: 'notification_types', schema: SCHEMA };

const ALL_CODES = ['RBAC_SECOND_APPROVER', 'DUAL_APPROVAL_RESOLVED'];

const EMAIL_APPROVER = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #222;">
  <img src="{{logoUrl}}" alt="Base Project" style="max-height:48px;" />
  <h2>Segunda aprobación requerida</h2>
  <p>Hola {{firstName}},</p>
  <p>Una operación quedó <strong>pendiente de tu aprobación</strong>:</p>
  <p style="font-size:16px;"><strong>{{operationLabel}}</strong></p>
  <p>Revísala y resuélvela (aprobar o rechazar) desde el panel de doble aprobación.</p>
  <p style="color:#888;font-size:12px;">Solicitud: {{approvalRequestId}}</p>
</body>
</html>`;

const EMAIL_RESOLVED = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; color: #222;">
  <img src="{{logoUrl}}" alt="Base Project" style="max-height:48px;" />
  <h2>Tu solicitud fue resuelta</h2>
  <p>La operación <strong>{{operationLabel}}</strong> que enviaste fue <strong>{{decision}}</strong> por el segundo aprobador.</p>
  <p style="color:#888;font-size:12px;">Solicitud: {{approvalRequestId}}</p>
</body>
</html>`;

const approverType = (code: string, name: string) => ({
  notification_type_id: uuidv4(),
  code,
  name,
  description: 'Aviso al aprobador de una operación pendiente de segunda aprobación (doble aprobación global).',
  priority: 'urgent',
  title_template: 'Segunda aprobación requerida',
  body_template: '{{operationLabel}} requiere tu aprobación.',
  email_subject_template: '[Acción requerida] Segunda aprobación — Base Project',
  email_body_template: EMAIL_APPROVER,
  created_at: new Date(),
  updated_at: new Date()
});

const allTypes = [
  approverType('RBAC_SECOND_APPROVER', 'Segunda Aprobación Requerida'),
  {
    notification_type_id: uuidv4(),
    code: 'DUAL_APPROVAL_RESOLVED',
    name: 'Solicitud de Doble Aprobación Resuelta',
    description: 'Aviso al maker cuando su solicitud de doble aprobación es aprobada o rechazada.',
    priority: 'high',
    title_template: 'Tu solicitud fue {{decision}}',
    body_template: 'La operación "{{operationLabel}}" fue {{decision}} por el segundo aprobador.',
    email_subject_template: 'Tu solicitud de aprobación fue resuelta — Base Project',
    email_body_template: EMAIL_RESOLVED,
    created_at: new Date(),
    updated_at: new Date()
  }
];

export default {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM "${SCHEMA}"."notification_types" WHERE code IN (${ALL_CODES.map(c => `'${c}'`).join(',')})`
    );
    await queryInterface.bulkInsert(TABLE, allTypes);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(TABLE, { code: ALL_CODES });
  }
} satisfies Migration;
