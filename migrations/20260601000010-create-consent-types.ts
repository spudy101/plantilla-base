import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'consent_types', schema: SCHEMA },
      {
        consent_type_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.UUIDV4
        },
        code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: 'Identificador único de la finalidad — ej: PRIVACY_POLICY, CREDIT_BUREAU_QUERY'
        },
        name: {
          type: Sequelize.STRING(200),
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        is_mandatory: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'false = consentimiento opcional (ej: marketing); no puede ser condición de acceso'
        },
        is_revocable: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'true = el usuario puede revocarlo en cualquier momento'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        scope: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'ONBOARDING',
          comment: 'Momento en que se captura el consentimiento. ONBOARDING = durante la vinculación. ' +
            'Punto de extensión: agrega tus propios scopes (y actualiza el CHECK) para gatear operaciones de tu dominio.'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'consent_types', schema: SCHEMA }, ['code'], {
      name: 'consent_types_code_idx'
    });

    await queryInterface.addIndex({ tableName: 'consent_types', schema: SCHEMA }, ['is_active'], {
      name: 'consent_types_is_active_idx'
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE ${SCHEMA}.consent_types
      ADD CONSTRAINT consent_types_scope_check CHECK (scope IN ('ONBOARDING'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'consent_types', schema: SCHEMA });
  }
} satisfies Migration;
