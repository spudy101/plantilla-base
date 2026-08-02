// migrations/20260730000001-totp-native-mfa.js
//
// Migración de MFA a TOTP propio y remoción de Cognito:
//   1. users.totp_secret  → nuevo. Secreto TOTP base32 CIFRADO en reposo
//      (EncryptionUtil, formato iv:authTag:ciphertext). NULL = TOTP no configurado.
//   2. cognito_username   → renombrado a auth_username. Sigue siendo el handle
//      interno estable del usuario (user_<uuid> / staff_<uuid>), ya sin relación
//      con Cognito.
//   3. cognito_sub        → eliminado. Sin Cognito ya no hay fuente de verdad.
//
// ⚠️ Se usa SQL crudo con esquema EXPLÍCITO en vez de queryInterface.renameColumn/
//    removeColumn a propósito: esos helpers de Sequelize v6 introspeccionan la tabla
//    por nombre y, cuando la misma tabla `users` existe en varios esquemas de la
//    misma BD (con prependSearchPath), la subconsulta devuelve más de una fila y
//    revienta ("subquery returned more than one row"). El ALTER TABLE con esquema
//    explícito no introspecciona nada. Idempotente (IF [NOT] EXISTS) para tolerar
//    reintentos tras un fallo parcial.

const { database } = require('../shared/constants');

const SCHEMA = database.schema;
const USERS = `"${SCHEMA}"."users"`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // 1. Secreto TOTP cifrado (TEXT: cabe el formato iv:authTag:ciphertext en hex)
    await q.query(`ALTER TABLE ${USERS} ADD COLUMN IF NOT EXISTS "totp_secret" TEXT`);
    await q.query(
      `COMMENT ON COLUMN ${USERS}."totp_secret" IS 'Secreto TOTP (base32) cifrado en reposo con AES-256-GCM. NULL = TOTP no configurado.'`
    );

    // 2. cognito_username → auth_username (conserva datos e índice único)
    await q.query(`ALTER TABLE ${USERS} RENAME COLUMN "cognito_username" TO "auth_username"`);

    // 3. cognito_sub → eliminado (Postgres elimina en cascada su índice)
    await q.query(`ALTER TABLE ${USERS} DROP COLUMN IF EXISTS "cognito_sub"`);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`ALTER TABLE ${USERS} ADD COLUMN IF NOT EXISTS "cognito_sub" VARCHAR(255) UNIQUE`);
    await q.query(`COMMENT ON COLUMN ${USERS}."cognito_sub" IS 'Cognito sub (user ID unico)'`);

    await q.query(`ALTER TABLE ${USERS} RENAME COLUMN "auth_username" TO "cognito_username"`);

    await q.query(`ALTER TABLE ${USERS} DROP COLUMN IF EXISTS "totp_secret"`);
  }
};
