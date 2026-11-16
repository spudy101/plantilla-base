import sequelizeModule = require('sequelize');
const { DataTypes } = sequelizeModule;
import constantsModule = require('../../../../../shared/constants');
const { database } = constantsModule;
import type { Model as SequelizeModel, ModelStatic, Optional, Sequelize } from 'sequelize';
import type { ModelRegistry } from '../../../../../shared/models/registry';
import type defineConsentType = require('./consent-type.model');
import type definePrivacyPolicy = require('./privacy-policy.model');
import type defineUser = require('../../../kyc/iam/models/user.model');







function defineUserConsent(sequelize: Sequelize): defineUserConsent.Static {
  const UserConsent = sequelize.define<defineUserConsent.Instance>(
    'UserConsent',
    {
      user_consent_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      consent_type_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      privacy_policy_id: {
        type: DataTypes.UUID,
        allowNull: true
      },
      granted_at: {
        type: DataTypes.DATE,
        allowNull: false
      },
      granted_ip: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      granted_user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      revoked_ip: {
        type: DataTypes.STRING(45),
        allowNull: true
      },
      revocation_reason: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      is_current: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
      tableName: 'user_consents',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  ) as defineUserConsent.Static;

  UserConsent.associate = models => {
    UserConsent.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    UserConsent.belongsTo(models.ConsentType, {
      foreignKey: 'consent_type_id',
      as: 'consentType'
    });
    UserConsent.belongsTo(models.PrivacyPolicy, {
      foreignKey: 'privacy_policy_id',
      as: 'privacyPolicy'
    });
  };

  return UserConsent;
}


// Tipos del modelo (generados desde la definición con scripts/ts-migration/gen-model-types.js).
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace defineUserConsent {
  /** Columnas de user_consents. */
  export interface Attributes {
    user_consent_id: string;
    user_id: string;
    consent_type_id: string;
    privacy_policy_id: string | null;
    granted_at: Date;
    granted_ip: string | null;
    granted_user_agent: string | null;
    revoked_at: Date | null;
    revoked_ip: string | null;
    revocation_reason: string | null;
    is_current: boolean;
    origin_session_id: string | null;
    origin_correlation_id: string | null;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    createdAt?: Date;
    /** Timestamp gestionado por Sequelize (opcional aquí: lo asigna Sequelize) */
    updatedAt?: Date;
  }

  /** Opcionales al crear: PK con default, columnas con default, nullable y timestamps. */
  export type CreationAttributes = Optional<Attributes, 'user_consent_id' | 'privacy_policy_id' | 'granted_ip' | 'granted_user_agent' | 'revoked_at' | 'revoked_ip' | 'revocation_reason' | 'is_current' | 'origin_session_id' | 'origin_correlation_id' | 'createdAt' | 'updatedAt'>;

  export interface Instance extends SequelizeModel<Attributes, CreationAttributes>, Attributes {
    /** Timestamp gestionado por Sequelize */
    readonly createdAt: Date;
    /** Timestamp gestionado por Sequelize */
    readonly updatedAt: Date;
    /** BelongsTo → User (solo si viene en el include) */
    user?: defineUser.Instance | null;
    /** BelongsTo → ConsentType (solo si viene en el include) */
    consentType?: defineConsentType.Instance | null;
    /** BelongsTo → PrivacyPolicy (solo si viene en el include) */
    privacyPolicy?: definePrivacyPolicy.Instance | null;
  }

  export type Static = ModelStatic<Instance> & {
    associate?: (models: ModelRegistry) => void;
  };
}

export = defineUserConsent;
