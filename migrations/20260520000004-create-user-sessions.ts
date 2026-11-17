// migrations/20260520000004-create-user-sessions.ts
//
// === RF-AUTH-02: Login, Gestión de Sesión Segura y Recuperación de Contraseña ===
// === RF-AUTH-03: Gestión de Dispositivos Autenticados y Control de Sesiones ===
// [RF-AUTH-03] | CA-01, CA-02, CA-04 | Tabla user_sessions: almacena sesiones
// activas con jti, ip_address, user_agent, status, started_at, last_access_at,
// closed_at, close_reason
// Todos los logAudit que escriben sobre esta tabla usan entityTable='user_sessions'.

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    // [RF-AUTH-02] | CA-04 | Registra sesiones activas: IP, user-agent, started_at, last_access_at, device_id (JOIN a user_trusted_devices para ciudad/OS/browser)
    await queryInterface.createTable(
      { tableName: 'user_sessions', schema: SCHEMA },
      {
        user_session_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          defaultValue: Sequelize.literal('gen_random_uuid()')
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          comment: 'Sin FK constraint — preserva historial si el usuario es eliminado'
        },
        device_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'user_trusted_devices', schema: SCHEMA },
            key: 'user_trusted_device_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment: 'Dispositivo de confianza asociado — null si aún no registrado'
        },
        jti: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          comment: 'JTI activo del refresh token — se actualiza en cada rotación'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          allowNull: true
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('active', 'closed'),
          allowNull: false,
          defaultValue: 'active'
        },
        started_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        },
        last_access_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        },
        closed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        close_reason: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'logout | logout_all | revoked_by_admin'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'user_sessions', schema: SCHEMA }, ['user_id']);
    await queryInterface.addIndex({ tableName: 'user_sessions', schema: SCHEMA }, ['device_id']);
    await queryInterface.addIndex({ tableName: 'user_sessions', schema: SCHEMA }, ['status']);
    await queryInterface.addIndex({ tableName: 'user_sessions', schema: SCHEMA }, ['started_at']);
    await queryInterface.addIndex({ tableName: 'user_sessions', schema: SCHEMA }, ['user_id', 'status'], {
      name: `${SCHEMA}_user_sessions_user_id_status`
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'user_sessions', schema: SCHEMA });
  }
} satisfies Migration;
