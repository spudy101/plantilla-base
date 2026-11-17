// seeders/20260525000001-rbac-roles.ts
//
// RF-ADM-01 — Inserta los 4 roles del RBAC en la tabla `roles`.
//
//   SUPERADMIN → acceso total; omite la doble aprobación (auto-aprueba).
//   ADMIN      → acceso total; SÍ sujeto a doble aprobación.
//   AUDITOR    → solo lectura en todos los módulos.
//   CLIENTE    → rol externo (portal cliente); sin acceso al panel admin.
// Idempotente: solo inserta los roles que aún no existen (busca por `name`).

import type { Migration } from '../shared/types/migration';
import { v4 as uuidv4 } from 'uuid';
import constantsModule from '../shared/constants';
const { database, RBAC_ROLES } = constantsModule;

const SCHEMA = database.schema;

// Descripción por rol (para el panel de administración).
const ROLE_DESCRIPTIONS = {
  [RBAC_ROLES.SUPERADMIN]: 'Superadministrador — acceso total; omite la doble aprobación',
  [RBAC_ROLES.ADMIN]: 'Administrador — acceso total; sujeto a doble aprobación',
  [RBAC_ROLES.AUDITOR]: 'Auditor — solo lectura en todos los módulos',
  [RBAC_ROLES.CLIENTE]: 'Cliente externo'
};

export default {
  up: async (queryInterface, Sequelize) => {
    const roleNames = Object.values(RBAC_ROLES);

    // ── Detectar cuáles ya existen para no duplicar ──────────────────────────
    const existing = await queryInterface.sequelize.query<{ name: string }>(`SELECT name FROM "${SCHEMA}"."roles" WHERE name IN (:names)`, {
      replacements: { names: roleNames },
      type: Sequelize.QueryTypes.SELECT
    });

    const existingNames = new Set(existing.map(r => r.name));
    const toInsert = roleNames.filter(name => !existingNames.has(name));

    if (toInsert.length === 0) {
      console.log('⚠️  Todos los roles RBAC ya existen, saltando seed...');
      return;
    }

    await queryInterface.bulkInsert(
      { tableName: 'roles', schema: SCHEMA },
      toInsert.map(name => ({
        role_id: uuidv4(),
        name,
        description: ROLE_DESCRIPTIONS[name] || null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })),
      {}
    );

    console.log(`✅ ${toInsert.length} roles RBAC creados exitosamente`);
  },

  down: async (queryInterface, Sequelize) => {
    const roleNames = Object.values(RBAC_ROLES);

    await queryInterface.bulkDelete({ tableName: 'roles', schema: SCHEMA }, { name: roleNames }, {});

    console.log('✅ Roles RBAC eliminados');
  }
} satisfies Migration;
