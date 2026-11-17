import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;
const TABLE = { tableName: 'notification_categories', schema: SCHEMA };

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(TABLE, {
      notification_category_id: {
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
        allowNull: false,
        defaultValue: true
      },
      supports_email: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      supports_sms: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      allow_dnd: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'false → el usuario no puede silenciar (se ignora su quiet hours para esta categoría)'
      },
      is_critical: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'true → emergencia: ignora quiet hours y no es silenciable'
      },
      default_quiet_hours_start: {
        type: Sequelize.TIME,
        allowNull: true
      },
      default_quiet_hours_end: {
        type: Sequelize.TIME,
        allowNull: true
      },
      priority: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'normal'
      },
      email_layout_template: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Layout HTML+CSS base; debe contener el placeholder {{content}} donde se inyecta el body del tipo'
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex(TABLE, ['code'], { unique: true, name: 'idx_notification_categories_code' });
    await queryInterface.addIndex(TABLE, ['is_active'], { name: 'idx_notification_categories_is_active' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable(TABLE);
  }
} satisfies Migration;
