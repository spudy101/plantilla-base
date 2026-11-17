import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'audit_alerts', schema: SCHEMA },
      {
        alert_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        audit_log_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'Referencia al log de auditoría que originó la alerta. Sin FK — independencia regulatoria.'
        },
        action: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Código de la acción que originó la alerta'
        },
        category: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'Módulo origen de la alerta'
        },
        risk: {
          type: Sequelize.ENUM('low', 'medium', 'high', 'critical', 'unknown'),
          allowNull: false,
          defaultValue: 'high'
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'Usuario que originó la acción que generó la alerta'
        },
        entity_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'ID de la entidad afectada (ej: entidad, ApprovalRequest, rol)'
        },
        entity_type: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Tipo de entidad afectada (ej: Person, ApprovalRequest, NotificationType)'
        },
        message: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Descripción legible de la alerta'
        },
        acknowledged: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        acknowledged_by: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'Admin que reconoció la alerta. Sin FK — independencia regulatoria.'
        },
        acknowledged_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'audit_alerts', schema: SCHEMA }, ['acknowledged', 'created_at'], {
      name: 'idx_audit_alerts_pending'
    });
    await queryInterface.addIndex({ tableName: 'audit_alerts', schema: SCHEMA }, ['user_id']);
    await queryInterface.addIndex({ tableName: 'audit_alerts', schema: SCHEMA }, ['action']);
    await queryInterface.addIndex({ tableName: 'audit_alerts', schema: SCHEMA }, ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'audit_alerts', schema: SCHEMA });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS enum_audit_alerts_risk;`);
  }
} satisfies Migration;
