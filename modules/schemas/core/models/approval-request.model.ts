import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../shared/constants');
const { database } = constantsModule;

import domainEnumsModule = require('../../../../shared/constants/domain-enums');
const { APPROVAL_REQUEST_STATUS: STATUS } = domainEnumsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../shared/models/registry';
import type defineUser = require('../../kyc/iam/models/user.model');







function defineApprovalRequest(sequelize: Sequelize): defineApprovalRequest.Static {
  const ApprovalRequest = sequelize.define<defineApprovalRequest.Instance>(
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
  ) as defineApprovalRequest.Static;

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

  // prototype de un ModelStatic se tipa como Model genérico: se apunta a la Instance de este modelo
  (ApprovalRequest.prototype as defineApprovalRequest.Instance).isPending = function (this: defineApprovalRequest.Instance) {
    return this.status === STATUS.PENDING;
  };

  ApprovalRequest.STATUS = STATUS;

  return ApprovalRequest;
}


// Extensiones manuales (no generadas): se fusionan con los tipos de abajo.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineApprovalRequest {
  export interface Instance {
    /** true si la solicitud sigue esperando al segundo aprobador */
    isPending(): boolean;
  }
  export interface StaticExtensions {
    STATUS: typeof STATUS;
  }
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineApprovalRequest {
  /** Columnas de approval_requests. */
  export interface Attributes {
    approval_request_id: string;
    /** Calza con el registro DUAL_APPROVAL_OPS */
    operation_key: string;
    /** Tipo de entidad afectada */
    entity_type: string | null;
    /** Id de la entidad afectada (join/annotate) */
    entity_id: string | null;
    /** Datos que el handler necesita para ejecutar la acción real */
    payload: unknown;
    /** Maker — funcionario que originó la operación */
    requested_by: string;
    requested_at: Date;
    /** Estado de la doble aprobación */
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    /** Checker — segundo funcionario que resolvió */
    second_approver_id: string | null;
    resolved_at: Date | null;
    resolution_notes: string | null;
    /** Calculado con ttlHours del registro (horas hábiles) */
    expires_at: Date | null;
    /** Salida del handler al aprobar */
    result: unknown;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'approval_request_id' | 'entity_type' | 'entity_id' | 'payload' | 'requested_at' | 'status' | 'second_approver_id' | 'resolved_at' | 'resolution_notes' | 'expires_at' | 'result' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    requester?: defineUser.Instance | null;
    /** BelongsTo → User (solo si viene en el include) */
    secondApprover?: defineUser.Instance | null;
  }

  export type Static = ModelStatic<Instance> & StaticExtensions & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineApprovalRequest;
