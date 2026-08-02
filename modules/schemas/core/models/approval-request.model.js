const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

module.exports = sequelize => {
  const ApprovalRequest = sequelize.define(
    'ApprovalRequest',
    {
      approval_request_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      operation_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'Calza con el registro DUAL_APPROVAL_OPS'
      },

      entity_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Tipo de entidad afectada'
      },

      entity_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Id de la entidad afectada (join/annotate)'
      },

      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Datos que el handler necesita para ejecutar la acción real'
      },

      requested_by: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Maker — funcionario que originó la operación'
      },

      requested_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },

      status: {
        type: DataTypes.ENUM(STATUS.PENDING, STATUS.APPROVED, STATUS.REJECTED, STATUS.EXPIRED),
        allowNull: false,
        defaultValue: STATUS.PENDING,
        comment: 'Estado de la doble aprobación'
      },

      second_approver_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Checker — segundo funcionario que resolvió'
      },

      resolved_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      resolution_notes: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Calculado con ttlHours del registro (horas hábiles)'
      },

      result: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: 'Salida del handler al aprobar'
      },

      // Trazabilidad de sesión: ata la fila a user_sessions / audit_logs.session_id.
      // Se fotografía al CREAR; null en creaciones de worker/sistema.
      origin_session_id: {
        type: DataTypes.UUID,
        allowNull: true
      },

      origin_correlation_id: {
        type: DataTypes.STRING(128),
        allowNull: true
      }
    },
    {
      tableName: 'approval_requests',
      schema: database.schema,
      timestamps: true,
      paranoid: false,
      underscored: true,
      indexes: [
        { name: 'idx_approval_requests_status', fields: ['status'] },
        { name: 'idx_approval_requests_operation_key', fields: ['operation_key'] },
        { name: 'idx_approval_requests_requested_by', fields: ['requested_by'] },
        { name: 'idx_approval_requests_entity', fields: ['entity_type', 'entity_id'] },
        { name: 'idx_approval_requests_expires_at', fields: ['expires_at'] }
      ]
    }
  );

  ApprovalRequest.associate = models => {
    ApprovalRequest.belongsTo(models.User, {
      foreignKey: 'requested_by',
      as: 'requester',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });

    ApprovalRequest.belongsTo(models.User, {
      foreignKey: 'second_approver_id',
      as: 'secondApprover',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  };

  ApprovalRequest.prototype.isPending = function () {
    return this.status === STATUS.PENDING;
  };

  ApprovalRequest.STATUS = STATUS;

  return ApprovalRequest;
};
