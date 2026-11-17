// migrations/20260327000001-create-audit-logs.ts

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'audit_logs', schema: SCHEMA },
      {
        audit_log_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        action: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Código de acción — ej: SCREENING_CREATED, LOGIN_FAILED'
        },
        description: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'Descripción legible para humanos — ej: Creación de screening KYC inicial'
        },
        category: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'Módulo origen — ej: KYC, Autenticación, Notificaciones'
        },
        risk: {
          type: Sequelize.ENUM('low', 'medium', 'high', 'critical', 'unknown'),
          allowNull: false,
          defaultValue: 'unknown',
          comment: 'Nivel de sensibilidad regulatoria'
        },
        outcome: {
          type: Sequelize.ENUM('success', 'failure', 'warning', 'attempt'),
          allowNull: false,
          defaultValue: 'success',
          comment: 'Resultado de la operación — success | failure | warning | attempt'
        },
        http_status: {
          type: Sequelize.SMALLINT.UNSIGNED,
          allowNull: true,
          comment: 'Código HTTP de la respuesta — ej: 200, 422, 500'
        },
        error_code: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Código de error de la aplicación — ej: VALIDATION_ERROR, NOT_FOUND'
        },
        error_message: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Mensaje de error legible para auditoría regulatoria'
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'Usuario que ejecutó la acción — null si es acción de sistema/worker'
        },
        correlation_id: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'ID de trazabilidad de la request HTTP'
        },
        ip: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: 'IP de origen — soporta IPv6'
        },
        user_agent: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        fingerprint: {
          type: Sequelize.STRING(64),
          allowNull: true,
          comment: 'SHA-256 del device fingerprint'
        },
        method: {
          type: Sequelize.STRING(10),
          allowNull: true,
          comment: 'Método HTTP — GET, POST, PUT, etc.'
        },
        path: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Path de la request que originó la acción'
        },
        details: {
          type: Sequelize.JSONB,
          allowNull: true,
          comment: 'Datos adicionales específicos de la acción'
        },
        source: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'http',
          comment: 'Origen del log — http | worker | system'
        },
        entity_id: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'ID de la entidad afectada. Null en eventos sin entidad (listados, sesiones, etc.).'
        },
        entity_type: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Tipo de entidad afectada. Ej: User, Person, Role, ApprovalRequest, NotificationType.'
        },
        entity_table: {
          type: Sequelize.STRING(150),
          allowNull: true,
          comment: 'Nombre exacto de la tabla afectada. Ej: users, user_trusted_devices, notification_types.'
        },
        module: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'Módulo de la matriz RBAC. Inferido del campo module definido en cada AUDIT_ACTION. Ej: client, admin, shared.'
        },
        session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'Sesión (user_sessions.user_session_id) desde la que se originó la acción. Null en workers/sistema.'
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

    // Índices para consultas de auditoría regulatoria
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['user_id']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['action']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['category']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['risk']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['ip']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['correlation_id']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['created_at']);
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['source']);

    // Índice compuesto — consulta más frecuente de auditoría: usuario + fecha
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['user_id', 'created_at'], {
      name: 'idx_audit_logs_user_date'
    });

    // Índice compuesto — filtro por categoría + riesgo (reportes SFC)
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['category', 'risk', 'created_at'], {
      name: 'idx_audit_logs_category_risk_date'
    });

    // Índice en outcome — la SFC filtrará frecuentemente por outcome='failure'
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['outcome'], {
      name: 'idx_audit_logs_outcome'
    });

    // Índice compuesto — outcome + fecha (dashboard de fallas por período)
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['outcome', 'created_at'], {
      name: 'idx_audit_logs_outcome_date'
    });

    // Índices de entidad afectada y módulo RBAC
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['entity_id'], {
      name: 'idx_audit_logs_entity_id'
    });
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['module'], {
      name: 'idx_audit_logs_module'
    });
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['entity_table'], {
      name: 'idx_audit_logs_entity_table'
    });

    // Índice simple — filtro "todas las acciones de una sesión".
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['session_id'], {
      name: 'idx_audit_logs_session_id'
    });

    // Índice compuesto — sesión + fecha (traza ordenada cronológicamente).
    await queryInterface.addIndex({ tableName: 'audit_logs', schema: SCHEMA }, ['session_id', 'created_at'], {
      name: 'idx_audit_logs_session_date'
    });

    // Trigger append-only (Circular 052 SFC) — la tabla es inmutable.
    // La función permite DELETE solo cuando el flag de sesión app.allow_audit_purge
    // está activo — usado exclusivamente por el audit-archive.worker dentro de una
    // transacción controlada. Cualquier otro intento de UPDATE o DELETE lanza excepción.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION ${SCHEMA}.trg_fn_audit_logs_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_purge', true) = 'true' THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'audit_logs is append-only: % not permitted (Circular 052 SFC)', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON ${SCHEMA}.audit_logs
      FOR EACH ROW EXECUTE FUNCTION ${SCHEMA}.trg_fn_audit_logs_immutable();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON ${SCHEMA}.audit_logs;`);
    await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS ${SCHEMA}.trg_fn_audit_logs_immutable();`);
    await queryInterface.dropTable({ tableName: 'audit_logs', schema: SCHEMA });
  }
} satisfies Migration;
