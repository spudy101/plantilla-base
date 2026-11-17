import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'user_change_logs', schema: SCHEMA },
      {
        log_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'Usuario afectado por el cambio'
        },
        changed_by_user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          comment: 'Usuario que realizó el cambio (null si fue el sistema)'
        },
        changed_by_role: {
          type: Sequelize.ENUM('admin', 'user', 'system'),
          allowNull: false,
          comment: 'Rol del que hizo el cambio'
        },
        change_type: {
          type: Sequelize.ENUM(
            'email',
            'password',
            'mfa_status',
            'account_status',
            'role',
            'national_id',
            'name',
            'gender',
            'location',
            'phone',
            'birth_date',
            'funds_origin',
            'sms_mfa_status',
            'preferred_mfa_method'
          ),
          allowNull: false,
          comment: 'Tipo de cambio realizado'
        },
        previous_value: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Valor anterior (null para password por seguridad)'
        },
        new_value: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Valor nuevo (null para password por seguridad)'
        },
        change_reason: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'Razón del cambio (opcional)'
        },
        ip_address: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: 'IP desde donde se hizo el cambio'
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Navegador/dispositivo usado'
        },

        // ── Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id. null en workers ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que originó el cambio'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que originó el cambio'
        },

        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          allowNull: false
        }
      }
    );

    // Crear índices para optimizar consultas
    await queryInterface.addIndex({ tableName: 'user_change_logs', schema: SCHEMA }, ['user_id'], {
      name: 'idx_user_change_logs_user_id'
    });

    await queryInterface.addIndex({ tableName: 'user_change_logs', schema: SCHEMA }, ['changed_by_user_id'], {
      name: 'idx_user_change_logs_changed_by'
    });

    await queryInterface.addIndex({ tableName: 'user_change_logs', schema: SCHEMA }, ['change_type'], {
      name: 'idx_user_change_logs_change_type'
    });

    await queryInterface.addIndex({ tableName: 'user_change_logs', schema: SCHEMA }, ['created_at'], {
      name: 'idx_user_change_logs_created_at'
    });

    await queryInterface.addIndex({ tableName: 'user_change_logs', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_user_change_logs_origin_session_id'
    });

    // Los user_change_logs son registros regulatorios de cambios de datos de
    // personas. A diferencia de audit_logs, no tienen escape de purga:
    // se conservan de forma permanente y nunca se eliminan ni modifican.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION ${SCHEMA}.trg_fn_user_change_logs_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'user_change_logs is append-only: % not permitted (registro regulatorio permanente)', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_user_change_logs_immutable
      BEFORE UPDATE OR DELETE ON ${SCHEMA}.user_change_logs
      FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.trg_fn_user_change_logs_immutable();
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_user_change_logs_immutable ON ${SCHEMA}.user_change_logs;`);
    await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS ${SCHEMA}.trg_fn_user_change_logs_immutable();`);
    await queryInterface.dropTable({ tableName: 'user_change_logs', schema: SCHEMA });
  }
} satisfies Migration;
