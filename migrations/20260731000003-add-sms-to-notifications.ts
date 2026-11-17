import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;
const TABLE = { tableName: 'notifications', schema: SCHEMA };

// SMS como tercer canal de notificación: columnas de estado espejo de push/email.

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE, 'sms_sent', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    await queryInterface.addColumn(TABLE, 'sms_sent_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn(TABLE, 'sms_error', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn(TABLE, 'sms_retry_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });
    await queryInterface.addColumn(TABLE, 'sms_next_retry_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(TABLE, 'sms_sent');
    await queryInterface.removeColumn(TABLE, 'sms_sent_at');
    await queryInterface.removeColumn(TABLE, 'sms_error');
    await queryInterface.removeColumn(TABLE, 'sms_retry_count');
    await queryInterface.removeColumn(TABLE, 'sms_next_retry_at');
  }
} satisfies Migration;
