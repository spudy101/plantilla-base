const { database } = require('../shared/constants');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'notification_types', schema: SCHEMA },
      {
        notification_type_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        code: {
          type: Sequelize.STRING(100),
          allowNull: false,
          unique: true
        },
        name: {
          type: Sequelize.STRING(200),
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        supports_push: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        supports_email: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        priority: {
          type: Sequelize.STRING(20),
          defaultValue: 'normal'
        },
        title_template: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        body_template: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        email_subject_template: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        email_body_template: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        is_critical: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'true = la entrega de esta notificación al usuario es crítica (panel admin filtra por este flag)'
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'notification_types', schema: SCHEMA }, ['code'], {
      unique: true
    });
    await queryInterface.addIndex({ tableName: 'notification_types', schema: SCHEMA }, ['priority']);
    await queryInterface.addIndex({ tableName: 'notification_types', schema: SCHEMA }, ['is_active']);
    await queryInterface.addIndex({ tableName: 'notification_types', schema: SCHEMA }, ['is_critical'], {
      name: 'notification_types_is_critical_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'notification_types', schema: SCHEMA });
  }
};
