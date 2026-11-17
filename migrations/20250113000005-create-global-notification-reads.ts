import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'global_notification_reads', schema: SCHEMA },
      {
        global_notification_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: { tableName: 'global_notifications', schema: SCHEMA },
            key: 'global_notification_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        read_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW
        },

        // ── Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id. null en workers ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que marcó la notificación como leída'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que marcó la notificación como leída'
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'global_notification_reads', schema: SCHEMA }, ['global_notification_id']);
    await queryInterface.addIndex({ tableName: 'global_notification_reads', schema: SCHEMA }, ['user_id']);
    await queryInterface.addIndex({ tableName: 'global_notification_reads', schema: SCHEMA }, ['read_at']);
    await queryInterface.addIndex({ tableName: 'global_notification_reads', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_global_notification_reads_origin_session_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'global_notification_reads', schema: SCHEMA });
  }
} satisfies Migration;
