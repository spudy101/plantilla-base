// Doble aprobación global (maker-checker) — tabla genérica `approval_requests`.
// El "estado doble aprobación" de cualquier operación gateada vive aquí, sin duplicar
// máquina de estados ni columnas por tabla en cada módulo.

const { database } = require('../shared/constants');

const SCHEMA = database.schema;
const TABLE = { tableName: 'approval_requests', schema: SCHEMA };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(TABLE, {
      approval_request_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()')
      },
      operation_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Calza con el registro DUAL_APPROVAL_OPS (shared/constants/dual-approval.js)'
      },
      entity_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Tipo de entidad afectada, ej: Role, NotificationType'
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Id de la entidad afectada (para join/annotate de pendientes)'
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Datos que el handler registrado necesita para ejecutar la acción real al aprobar'
      },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'users', schema: SCHEMA }, key: 'user_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        comment:
          'Maker — funcionario que originó la operación. NOT NULL → RESTRICT ' +
          '(SET NULL es inválido sobre NOT NULL; RESTRICT preserva la trazabilidad al impedir el borrado).'
      },
      requested_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Estado de la doble aprobación'
      },
      second_approver_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'users', schema: SCHEMA }, key: 'user_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'Checker — segundo funcionario que resolvió'
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      resolution_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Calculado con ttlHours del registro (horas hábiles)'
      },
      result: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Salida del handler al aprobar (ej: id de entidad creada)'
      },

      // ── Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id. null en workers ──
      origin_session_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'session_id de auth que solicitó la operación sujeta a doble aprobación'
      },
      origin_correlation_id: {
        type: Sequelize.STRING(128),
        allowNull: true,
        comment: 'correlationId del request que solicitó la operación sujeta a doble aprobación'
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // ── Índices ────────────────────────────────────────────────────────────────
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_status
       ON "${SCHEMA}"."approval_requests" (status)`
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_operation_key
       ON "${SCHEMA}"."approval_requests" (operation_key)`
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by
       ON "${SCHEMA}"."approval_requests" (requested_by)`
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_entity
       ON "${SCHEMA}"."approval_requests" (entity_type, entity_id)`
    );
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_expires_at
       ON "${SCHEMA}"."approval_requests" (expires_at)`
    );

    // ── Índice único parcial: máximo una pendiente por (entity, operación) ──────
    //    Impide dos solicitudes pendientes de la misma operación sobre la misma entidad
    //    (evita el "listado doble" del annotate).
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_requests_pending_entity_op
       ON "${SCHEMA}"."approval_requests" (entity_type, entity_id, operation_key)
       WHERE status = 'pending'`
    );

    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS idx_approval_requests_origin_session_id
       ON "${SCHEMA}"."approval_requests" (origin_session_id)`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${SCHEMA}"."uq_approval_requests_pending_entity_op"`);
    await queryInterface.dropTable(TABLE);
    // Limpia el tipo ENUM generado por Sequelize
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${SCHEMA}"."enum_approval_requests_status"`);
  }
};
