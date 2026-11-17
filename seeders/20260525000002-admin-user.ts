// seeders/20260525000002-admin-user.ts
//
// Usuarios internos base:
//   - Admin SUPERADMIN (credenciales por env SEED_ADMIN_*)
//   - Admin ADMIN demo (segundo usuario interno; permite probar la doble aprobación
//     maker-checker con dos usuarios distintos; credenciales demo, misma password del admin)

'use strict';

import type { QueryInterface } from 'sequelize';
import type { Migration, SequelizeStatic } from '../shared/types/migration';
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;
import constantsModule = require('../shared/constants');
const { database, seeds } = constantsModule;
import bcrypt = require('bcryptjs');
import EncryptionUtil = require('../shared/utils/encryption.util');
import HashUtil = require('../shared/utils/hash.util');

const SCHEMA = database.schema;

const ADMIN_EMAIL = seeds.adminEmail;
const ADMIN_FIRST_NAME = seeds.adminFirstName || 'Admin';
const ADMIN_LAST_NAME = seeds.adminLastName || 'Sistema';
const ADMIN_NATIONAL_ID = seeds.adminNationalId || 'Admin';
const ADMIN_PASSWORD = seeds.adminPassword;

// Segundo administrador demo (rol ADMIN) — sirve de segundo aprobador en la doble
// aprobación. Email demo; password compartida con el admin.
const DEMO_ADMIN_EMAIL = 'admin2@base-project.test';
const DEMO_ADMIN_FIRST_NAME = 'Admin';
const DEMO_ADMIN_LAST_NAME = 'Secundario';
const DEMO_ADMIN_NATIONAL_ID = 'Admin2';

function validateEnvVars() {
  const missing = [];
  if (!ADMIN_EMAIL) {
    missing.push('SEED_ADMIN_EMAIL');
  }
  if (!ADMIN_PASSWORD) {
    missing.push('SEED_ADMIN_PASSWORD');
  }
  if (missing.length > 0) {
    throw new Error(`❌ Faltan variables de entorno para el seeder: ${missing.join(', ')}`);
  }
}

/**
 * Crea un usuario interno completo (persons + person_contacts + users).
 * Idempotente: si ya existe un usuario con ese email (por email_hash), no hace nada.
 */
interface InternalUserSeed {
  email: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  password: string;
  roleName: string;
}

async function createInternalUser(
  queryInterface: QueryInterface,
  Sequelize: SequelizeStatic,
  { email, firstName, lastName, nationalId, password, roleName }: InternalUserSeed
) {
  // Los hooks de Sequelize NO aplican en bulkInsert — cifrar y hashear manualmente
  const encryptedEmail = EncryptionUtil.encrypt(email);
  const encryptedNationalId = EncryptionUtil.encrypt(nationalId);
  const emailHash = HashUtil.hashForSearch(email);
  const nationalIdHash = HashUtil.hashForSearch(nationalId);

  // ── Guardia: no duplicar si ya existe ─────────────────────────────────
  // Buscar por email_hash — determinístico y no depende del IV aleatorio del cifrado
  const existingUser = await queryInterface.sequelize.query(
    `SELECT u.user_id
     FROM "${SCHEMA}"."users" u
     JOIN "${SCHEMA}"."person_contacts" pc ON pc.person_id = u.person_id
     WHERE pc.email_hash = :emailHash
     LIMIT 1`,
    {
      replacements: { emailHash },
      type: Sequelize.QueryTypes.SELECT
    }
  );

  if (existingUser.length > 0) {
    console.log(`⚠️  El usuario ${roleName} (${email}) ya existe, saltando seed...`);
    return;
  }

  // ── Obtener role_id del rol ───────────────────────────────────────────
  const [role] = await queryInterface.sequelize.query<{ role_id: string }>(
    `SELECT role_id FROM "${SCHEMA}"."roles" WHERE name = :roleName LIMIT 1`,
    { replacements: { roleName }, type: Sequelize.QueryTypes.SELECT }
  );

  if (!role) {
    throw new Error(`❌ Rol "${roleName}" no encontrado. Ejecuta primero el seeder de rbac-roles.`);
  }

  // ── Resolver document_type_id del tipo SYSTEM (sin UUID hardcodeado) ──
  const [systemDocType] = await queryInterface.sequelize.query<{ document_type_id: string }>(
    `SELECT document_type_id FROM "${SCHEMA}"."document_types" WHERE code = 'SYSTEM' LIMIT 1`,
    { type: Sequelize.QueryTypes.SELECT }
  );

  if (!systemDocType) {
    throw new Error('No se encontró document_type SYSTEM — ejecutá primero el seeder de document_types');
  }

  const personId = uuidv4();
  const userId = uuidv4();
  const contactId = uuidv4();
  const authUsername = `user_${uuidv4()}`;

  const transaction = await queryInterface.sequelize.transaction();
  let transactionFinished = false;

  try {
    // ── Crear en BD con datos cifrados + hashes ────────────────────────────

    // persons — national_id cifrado + hash para búsquedas
    await queryInterface.bulkInsert(
      { tableName: 'persons', schema: SCHEMA },
      [
        {
          person_id: personId,
          first_name: firstName,
          last_name: lastName,
          middle_name: '',
          second_last_name: '',
          national_id: encryptedNationalId, // ← AES-256-GCM
          national_id_hash: nationalIdHash, // ← HMAC-SHA256 para búsquedas
          document_type_id: systemDocType.document_type_id, // ← tipo SYSTEM resuelto por code
          birth_date: null,
          gender_id: null,
          country_id: null,
          created_at: new Date(),
          updated_at: new Date()
        }
      ],
      { transaction }
    );

    // person_contacts — email cifrado + hash para búsquedas
    await queryInterface.bulkInsert(
      { tableName: 'person_contacts', schema: SCHEMA },
      [
        {
          person_contact_id: contactId,
          person_id: personId,
          email: encryptedEmail, // ← AES-256-GCM
          email_hash: emailHash, // ← HMAC-SHA256 para búsquedas
          email_verified_at: new Date(),
          phone_primary: null,
          phone_primary_hash: null,
          phone_primary_prefix_id: null,
          phone_primary_verified_at: null,
          phone_secondary: null,
          phone_secondary_hash: null,
          phone_secondary_prefix_id: null,
          phone_secondary_verified_at: null,
          created_at: new Date(),
          updated_at: new Date()
        }
      ],
      { transaction }
    );

    // password: bcrypt es correcto para contraseñas — hash unidireccional, no AES
    const passwordHash = await bcrypt.hash(password, 10);

    // users
    await queryInterface.bulkInsert(
      { tableName: 'users', schema: SCHEMA },
      [
        {
          user_id: userId,
          username: nationalId, // username en texto plano — se usa para login
          password_hash: passwordHash,
          auth_username: authUsername,
          person_id: personId,
          role_id: role.role_id,
          avatar_id: null,
          totp_enabled: false,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deletedAt: null
        }
      ],
      { transaction }
    );

    await transaction.commit();
    transactionFinished = true;

    console.log(`✅ Usuario ${roleName} creado exitosamente`);
    console.log(`   📧 Email:    ${email}`);
    console.log(`   🪪 Username: ${nationalId}`);
    console.log(`   🔑 Password: ${password}  ← cámbialo en el primer login`);
    console.log(`   🆔 user_id:  ${userId}`);
  } catch (error) {
    if (!transactionFinished) {
      await transaction.rollback();
    }

    throw error;
  }
}

/** Elimina un usuario interno buscándolo por email_hash. */
async function deleteInternalUser(queryInterface: QueryInterface, Sequelize: SequelizeStatic, email: string) {
  const emailHash = HashUtil.hashForSearch(email);

  const [user] = await queryInterface.sequelize.query<{ user_id: string; person_id: string }>(
    `SELECT u.user_id, u.person_id
     FROM "${SCHEMA}"."users" u
     JOIN "${SCHEMA}"."person_contacts" pc ON pc.person_id = u.person_id
     WHERE pc.email_hash = :emailHash
     LIMIT 1`,
    {
      replacements: { emailHash },
      type: Sequelize.QueryTypes.SELECT
    }
  );

  if (!user) {
    console.log(`⚠️  Usuario ${email} no encontrado, nada que revertir.`);
    return;
  }

  await queryInterface.bulkDelete({ tableName: 'persons', schema: SCHEMA }, { person_id: user.person_id }, {});

  console.log(`✅ Usuario ${email} eliminado (BD)`);
}

export default {
  up: async (queryInterface, Sequelize) => {
    validateEnvVars();

    await createInternalUser(queryInterface, Sequelize, {
      email: ADMIN_EMAIL,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      nationalId: ADMIN_NATIONAL_ID,
      password: ADMIN_PASSWORD,
      roleName: 'SUPERADMIN'
    });

    // Segundo administrador (rol ADMIN): actúa como segundo aprobador en la doble aprobación.
    await createInternalUser(queryInterface, Sequelize, {
      email: DEMO_ADMIN_EMAIL,
      firstName: DEMO_ADMIN_FIRST_NAME,
      lastName: DEMO_ADMIN_LAST_NAME,
      nationalId: DEMO_ADMIN_NATIONAL_ID,
      password: ADMIN_PASSWORD,
      roleName: 'ADMIN'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await deleteInternalUser(queryInterface, Sequelize, DEMO_ADMIN_EMAIL);
    await deleteInternalUser(queryInterface, Sequelize, ADMIN_EMAIL);
  }
} satisfies Migration;
