import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;
const TABLE = { tableName: 'notification_types', schema: SCHEMA };

// Los tipos-evento pasan a pertenecer a una categoría. Los canales (supports_push/email) y la
// criticidad (is_critical) suben a la categoría (fuente de verdad), así que se eliminan del tipo.

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE, 'notification_category_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: { tableName: 'notification_categories', schema: SCHEMA },
        key: 'notification_category_id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex(TABLE, ['notification_category_id'], {
      name: 'idx_notification_types_category_id'
    });

    await queryInterface.removeColumn(TABLE, 'supports_push');
    await queryInterface.removeColumn(TABLE, 'supports_email');
    await queryInterface.removeColumn(TABLE, 'is_critical');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn(TABLE, 'supports_push', {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    });
    await queryInterface.addColumn(TABLE, 'supports_email', {
      type: Sequelize.BOOLEAN,
      defaultValue: true
    });
    await queryInterface.addColumn(TABLE, 'is_critical', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.removeIndex(TABLE, 'idx_notification_types_category_id');
    await queryInterface.removeColumn(TABLE, 'notification_category_id');
  }
} satisfies Migration;
