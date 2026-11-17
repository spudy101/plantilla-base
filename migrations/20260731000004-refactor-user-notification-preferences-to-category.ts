import type { Migration } from '../shared/types/migration';
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;
const QUALIFIED = `"${SCHEMA}"."user_notification_preferences"`;

// Las preferencias pasan de estar atadas al tipo-evento (notification_type_code) a la categoría
// (notification_category_code). Se mantiene null = preferencia global. Se agrega allow_sms.
//
// ⚠️ BD compartida: el mismo nombre de tabla existe en varios esquemas. Los helpers de Sequelize
//    (renameColumn/describeTable) resuelven columnas por nombre de tabla sin filtrar por esquema y
//    fallan con "subconsulta devolvió más de un registro". Por eso todo va en SQL crudo
//    schema-qualified e idempotente (re-ejecutable ante fallos parciales).

export default {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // 1. Soltar FK e índices que dependen de la columna vieja (nombres autogenerados → IF EXISTS).
    await q.query(
      `ALTER TABLE ${QUALIFIED} DROP CONSTRAINT IF EXISTS "user_notification_preferences_notification_type_code_fkey"`
    );
    await q.query(`DROP INDEX IF EXISTS "${SCHEMA}"."user_notification_preferences_notification_type_code"`);
    await q.query(`DROP INDEX IF EXISTS "${SCHEMA}"."user_notification_preferences_user_id_notification_type_code"`);

    // 2. Filas específicas viejas (apuntaban a códigos de tipo) ya no son válidas → se borran.
    //    Las globales (notification_type_code = null) se conservan.
    await q.query(
      `DELETE FROM ${QUALIFIED}
       WHERE EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = '${SCHEMA}' AND table_name = 'user_notification_preferences'
           AND column_name = 'notification_type_code'
       ) AND notification_type_code IS NOT NULL`
    );

    // 3. Renombrar la columna (solo si aún tiene el nombre viejo).
    await q.query(
      `DO $$
       BEGIN
         IF EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = '${SCHEMA}' AND table_name = 'user_notification_preferences'
             AND column_name = 'notification_type_code'
         ) THEN
           ALTER TABLE ${QUALIFIED} RENAME COLUMN "notification_type_code" TO "notification_category_code";
         END IF;
       END $$;`
    );

    // 4. FK a las categorías (drop-if-exists + add para idempotencia).
    await q.query(
      `ALTER TABLE ${QUALIFIED} DROP CONSTRAINT IF EXISTS "user_notification_preferences_notification_category_code_fkey"`
    );
    await q.query(
      `ALTER TABLE ${QUALIFIED}
       ADD CONSTRAINT "user_notification_preferences_notification_category_code_fkey"
       FOREIGN KEY ("notification_category_code")
       REFERENCES "${SCHEMA}"."notification_categories" ("code")
       ON UPDATE CASCADE ON DELETE CASCADE`
    );

    // 5. Nuevo canal SMS a nivel preferencia.
    await q.query(`ALTER TABLE ${QUALIFIED} ADD COLUMN IF NOT EXISTS "allow_sms" BOOLEAN DEFAULT true`);

    // 6. Recrear índices sobre la columna nueva.
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_unp_notification_category_code" ON ${QUALIFIED} ("notification_category_code")`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_unp_user_id_notification_category_code" ON ${QUALIFIED} ("user_id", "notification_category_code")`
    );
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS "${SCHEMA}"."idx_unp_user_id_notification_category_code"`);
    await q.query(`DROP INDEX IF EXISTS "${SCHEMA}"."idx_unp_notification_category_code"`);
    await q.query(`ALTER TABLE ${QUALIFIED} DROP COLUMN IF EXISTS "allow_sms"`);
    await q.query(
      `ALTER TABLE ${QUALIFIED} DROP CONSTRAINT IF EXISTS "user_notification_preferences_notification_category_code_fkey"`
    );

    await q.query(
      `DO $$
       BEGIN
         IF EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = '${SCHEMA}' AND table_name = 'user_notification_preferences'
             AND column_name = 'notification_category_code'
         ) THEN
           ALTER TABLE ${QUALIFIED} RENAME COLUMN "notification_category_code" TO "notification_type_code";
         END IF;
       END $$;`
    );

    await q.query(
      `ALTER TABLE ${QUALIFIED}
       ADD CONSTRAINT "user_notification_preferences_notification_type_code_fkey"
       FOREIGN KEY ("notification_type_code")
       REFERENCES "${SCHEMA}"."notification_types" ("code")
       ON UPDATE CASCADE ON DELETE CASCADE`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "user_notification_preferences_notification_type_code" ON ${QUALIFIED} ("notification_type_code")`
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "user_notification_preferences_user_id_notification_type_code" ON ${QUALIFIED} ("user_id", "notification_type_code")`
    );
  }
} satisfies Migration;
