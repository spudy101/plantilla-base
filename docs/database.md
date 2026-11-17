# Base de datos — migraciones, seeders y reset

> PostgreSQL + Sequelize. Cómo se aíslan los esquemas, cómo se cambian las tablas y por qué `db:reset`
> dropea el esquema en vez de revertir migración por migración.

---

## Aislamiento por esquema (`DB_SCHEMA`)

Una misma instancia Postgres puede alojar **varios esquemas** (p. ej. el template en `plantilla` y un
proyecto real en otro). El esquema activo lo fija `DB_SCHEMA` en `.env`. El tracking de Sequelize vive
**dentro** de ese esquema (`config/database.ts`):

```js
migrationStorageTableSchema: database.schema,  // SequelizeMeta dentro de DB_SCHEMA
seederStorageTableSchema: database.schema,      // SequelizeData dentro de DB_SCHEMA
```

Consecuencia: apuntar `DB_SCHEMA` a otro esquema re-corre migraciones/seeders desde cero **sin tocar** el
tracking ni las tablas de los demás. Todo comando de BD queda acotado al esquema apuntado.

> **Antes de cualquier comando destructivo**, verificá `DB_SCHEMA` en `.env`. `db:reset` tiene además una
> guarda que **aborta si `DB_SCHEMA` está vacío o es `public`** (`scripts/db-reset.ts`).

---

## Comandos

| Comando               | Qué hace                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| `npm run db:migrate`  | Aplica migraciones pendientes (tracking en `SequelizeMeta`).                |
| `npm run db:seed`     | Aplica seeders pendientes (tracking en `SequelizeData`).                    |
| `npm run db:seed:undo`| Revierte todos los seeders.                                                 |
| `npm run db:reset`    | **Dropea y recrea el esquema**, luego migra + seedea desde cero.            |
| `npm run db:fresh`    | Alias de `db:reset`.                                                        |

---

## Convención para cambiar el esquema: editar la migración ORIGINAL

En este repo **no se acumulan migraciones `ALTER TABLE`/`ADD COLUMN`**. Para cambiar una tabla se **edita
su `create-*.ts` original** (y el modelo, y el seeder si aplica) y se corre `npm run db:reset`. Igual para
los tipos de notificación y otros datos sembrados: se edita el **seeder original** (cada `up` hace
`DELETE por code` + `bulkInsert`, idempotente) y se resetea.

Esto mantiene las migraciones legibles como el esquema real, sin arqueología de parches. Es viable porque
`db:reset` reconstruye el esquema entero.

---

## Por qué `db:reset` dropea el esquema (y no `migrate:undo:all`)

`sequelize-cli db:migrate:undo:all` depende de que **todos los `down()` funcionen en orden inverso**. En
Postgres eso es frágil con **enum types**: `createTable` con `Sequelize.ENUM(...)` crea un tipo, y varios
`down()` fallan al dropearlo ("otros objetos dependen de él") o dejan tipos huérfanos que rompen el
`up()` siguiente.

Por eso `db:reset` = `scripts/db-reset.ts`:

```
DROP SCHEMA "<DB_SCHEMA>" CASCADE;  ← también borra SequelizeMeta/SequelizeData (viven en el esquema)
CREATE SCHEMA "<DB_SCHEMA>";
sequelize-cli db:migrate
sequelize-cli db:seed:all
```

Bulletproof para un template acotado a su esquema, e independiente de la calidad de los `down()`.

### Gotchas de migraciones (Postgres)
- **Orden en `down()` con ENUM**: dropeá primero la **tabla**, luego el **tipo**
  (`DROP TYPE IF EXISTS "<schema>"."enum_..."`). Al revés, la columna todavía depende del tipo y falla.
- **Rename/remove de columnas con `prependSearchPath`**: usá **SQL crudo con esquema explícito**
  (`ALTER TABLE "schema"."tabla" ...`), no `queryInterface.renameColumn/removeColumn`: con la misma tabla
  en varios esquemas, la introspección de Sequelize v6 revienta ("subquery returned more than one row").

---

Relacionado: `docs/origin-session-tracking.md` (helpers de columnas para tablas nuevas).
