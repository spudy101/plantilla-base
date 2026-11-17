import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createSchema(SCHEMA);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropSchema(SCHEMA);
  }
} satisfies Migration;
