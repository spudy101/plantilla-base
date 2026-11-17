// migrations/20260526000003-create-role-permission-overrides.ts
//
// RF-ADM-01 Fase 1b — Permisos adicionales por módulo editables en runtime.
//
// Almacena los overrides que el SUPERADMIN define sobre la matriz base (inmutable
// en código). Un registro = "este rol tiene esta acción en este módulo". Borrar
// el registro = revocar. La base NUNCA se reduce desde aquí.

import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;
import originSessionMixinModule from '../shared/models/mixins/origin-session.mixin';
const { originSessionMigrationColumns } = originSessionMixinModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'role_permission_overrides', schema: SCHEMA },
      {
        role_permission_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          defaultValue: Sequelize.literal('gen_random_uuid()')
        },
        role_name: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        module_name: {
          type: Sequelize.STRING(50),
          allowNull: false
        },
        action: {
          type: Sequelize.STRING(20),
          allowNull: false
        },
        granted_by_user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'users', schema: SCHEMA }, key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        // Trazabilidad de sesión: qué sesión de admin creó este override de permiso.
        ...originSessionMigrationColumns(Sequelize),
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
      }
    );

    await queryInterface.addConstraint(
      { tableName: 'role_permission_overrides', schema: SCHEMA },
      {
        fields: ['role_name', 'module_name', 'action'],
        type: 'unique',
        name: 'uq_role_permission_overrides_role_module_action'
      }
    );

    await queryInterface.addIndex({ tableName: 'role_permission_overrides', schema: SCHEMA }, ['role_name'], {
      name: 'idx_role_permission_overrides_role_name'
    });

    await queryInterface.addIndex({ tableName: 'role_permission_overrides', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_role_permission_overrides_origin_session_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'role_permission_overrides', schema: SCHEMA });
  }
} satisfies Migration;
