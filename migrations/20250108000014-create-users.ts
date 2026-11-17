// migrations/20250108000014-create-users.ts

import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'users', schema: SCHEMA },
      {
        user_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        username: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true
        },
        password_hash: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: 'Bcrypt hash of password, nullable if using only OAuth'
        },
        cognito_sub: {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true,
          comment: 'Cognito sub (user ID unico)'
        },
        cognito_username: {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true,
          comment: 'Cognito username (username unico)'
        },
        person_id: {
          type: Sequelize.UUID,
          allowNull: false,
          unique: true,
          references: {
            model: { tableName: 'persons', schema: SCHEMA },
            key: 'person_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        role_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'roles', schema: SCHEMA },
            key: 'role_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        avatar_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'avatars', schema: SCHEMA },
            key: 'avatar_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        totp_enabled: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        sms_mfa_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'true cuando el usuario tiene SMS MFA activo en Cognito'
        },
        preferred_mfa_method: {
          type: Sequelize.STRING(10),
          allowNull: false,
          defaultValue: 'none',
          comment: 'Método MFA preferido: none | totp | sms'
        },
        privacy_policy_version: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'Versión de la política de privacidad aceptada por el usuario al registrarse'
        },
        privacy_policy_accepted_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Fecha y hora exacta en que el usuario aceptó la política de privacidad'
        },
        privacy_policy_accepted_ip: {
          type: Sequelize.STRING(45),
          allowNull: true,
          comment: 'IP del dispositivo desde el que se aceptó la política (IPv4 o IPv6, máx 45 chars)'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        deletedAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Timestamp de eliminación de cuenta (ofuscación irreversible). NULL = no eliminado.'
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['username']);
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['cognito_sub']);
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['person_id']);
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['role_id']);
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['is_active']);
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['deletedAt']);
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['deleted_at'], {
      name: 'idx_users_deleted_at'
    });
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['privacy_policy_version'], {
      name: 'users_privacy_policy_version_idx'
    });
    await queryInterface.addIndex({ tableName: 'users', schema: SCHEMA }, ['sms_mfa_enabled'], {
      name: 'idx_users_sms_mfa_enabled'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ tableName: 'users', schema: SCHEMA });
  }
} satisfies Migration;
