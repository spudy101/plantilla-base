# Migración de Sequelize a Prisma (plan)

> **Objetivo:** que la plantilla salga con el stack que suelen pedir los proyectos TypeScript:
> **TypeScript + Prisma**. Se hace por fases, como la [migración a TypeScript](typescript-migration.md):
> al final de cada fase la app arranca y los tests pasan. Durante la migración **Prisma y Sequelize
> conviven contra la misma base**: cada repositorio cambia de ORM sin que los services se enteren.
>
> Estado: **fases 0 y 1 completas** en la rama `feat/prisma`; ver [Cómo funciona hoy](#cómo-funciona-hoy).

## Punto de partida (medido)

Lo que deja la fase SOLID + TypeScript y hace viable el cambio por partes:

- Ningún service importa `sequelize` (la guarda `solid-architecture.test.ts` lo impide): el ORM vive en
  **44 repositorios** y **41 modelos**.
- Transacciones detrás de un puerto (`shared/database/unit-of-work.ts`) y cada service depende de los
  métodos que usa (`XRepositoryPort` + `Pick`, `modules/schemas/repository-ports.ts`).

Lo que hay que resolver (de mayor a menor riesgo):

| # | Tema | Tamaño | Por qué cuesta |
|---|---|---|---|
| 1 | **Cifrado de PII en hooks** | `person`, `person-contact`, `user-trusted-device` + hook global de `origin-session` | `beforeCreate`/`beforeUpdate` cifran y hashean, `afterFind` descifra (también dentro de un `include`). En Prisma son *client extensions*. Un error guarda PII en claro o rompe las búsquedas por hash. |
| 2 | **Transacciones** | 35 archivos | Hoy se pasa `{ transaction }` en las opciones y `unitOfWork.begin()` da commit/rollback manual. Prisma usa `$transaction(async tx => …)` con un cliente `tx` propio. |
| 3 | **Instancias vivas fuera de repositorios** | ~40 llamadas | Services/workers hacen `record.update()`, `request.reload()`… Prisma devuelve objetos planos: cada uno pasa a ser un método del repositorio. |
| 4 | **Consultas** | 96 `Op.*`, 107 `include`, `BaseRepository` genérico | Reescritura a `where`/`include`/`select` de Prisma; paginación, `searchFields` y filtros del `BaseRepository`. |
| 5 | **Migraciones y seeders** | 45 migraciones (~4400 líneas) + 19 seeders | Triggers de inmutabilidad (auditoría), enums, índices. Pasan a Prisma Migrate con una migración base. |
| 6 | **Tests de integración** | `app-smoke` + CI | Hoy usan SQLite en memoria; en Prisma el proveedor es fijo en el schema → Postgres real en CI. |
| 7 | **Tipos** | 38 archivos usan `defineX.Instance` | Pasan a los tipos que genera Prisma (y desaparecen `gen-model-types.js`, `registry.ts` y los modelos). |

## Decisiones

| Tema | Propuesta | Estado |
|---|---|---|
| Versión | Prisma **7.10.1** (estable; la 8 está en RC). Generador `prisma-client` con `moduleFormat = "cjs"` y driver adapter `@prisma/adapter-pg` (obligatorio en Prisma 7; el query compiler es WASM, sin binarios nativos). | decidida (fase 0) |
| Rama | `feat/typescript` mergeada a `main` (fast-forward); la migración va en `feat/prisma`. | hecho |
| Nombres en el schema | **camelCase con `@map`/`@@map`** (estilo Prisma): la base sigue en snake_case y el mapeo columna ↔ campo lo hace Prisma. El código (services, DTOs, helpers, workers) pasa a leer y escribir camelCase **junto con el repositorio que migra**, sin capa de traducción intermedia: ~1200 accesos `.snake_case` en 100 archivos + ~370 claves en payloads, y `tsc` marca cada uno porque los tipos salen del cliente de Prisma. **El contrato de la API no cambia**: las claves de las respuestas las definen los DTOs. SQL crudo (`aggregate`, `query`) sigue devolviendo nombres de columna. | decidida |
| camelCase en la API | **Sí**: todo lo que es TypeScript o JSON queda en camelCase. Hoy los DTOs ya responden casi todo en camelCase (694 claves) pero quedan **88 claves snake_case en 8 DTOs** (`admin-person`, `profile`, `admin-notification-type`, `user-activity`, `components-audit`, `components-approval`, `components-system-config`, `components-auth`): se normalizan, junto con su Swagger. Es un cambio de contrato para quien consuma esos endpoints; se anota en el changelog del PR. | decidida |
| Columnas de Postgres | **Siguen en snake_case** (`@map`): es la convención de Postgres (un identificador camelCase hay que escribirlo entre comillas en todo SQL crudo, trigger, `psql` o herramienta de reportes) y lo que recomienda la documentación de Prisma; además evita renombrar las columnas de las bases existentes. Para el código es invisible. | decidida |
| Transacciones | Contexto de transacción en `AsyncLocalStorage` (ya se usa para request-context): `unitOfWork.run(work)` abre `$transaction` y los repositorios toman el `tx` activo solos. Evita pasar `{ transaction }` por 35 archivos. `begin()` manual se elimina (Prisma no tiene commit/rollback manual): sus llamadores pasan a `run()`. | propuesta |
| Base de test | Postgres real en un **esquema aislado** (`TEST_DB_SCHEMA`, por defecto `test`) de la misma base de `.env`: `npm run db:test:prepare` lo recrea con las migraciones. En CI, service container `postgres:16-alpine`. Perfil SQLite y `sqlite3` eliminados. Los unitarios no se conectan (verificado: pasan con la base inalcanzable). | hecho (fase 1) |
| Esquema (`DB_SCHEMA`) | App: opción `schema` de `PrismaPg`. CLI: `?schema=` en la URL que arma `shared/database/database-url.ts` desde las variables `DB_*` de siempre (no hace falta `DATABASE_URL`). | decidida (fase 0) |

## Convenciones de nombres

La plantilla sigue esta tabla; la migración a Prisma es el momento de dejarla cumplida en todo el proyecto.

| Elemento | Convención | Ejemplo |
|---|---|---|
| Variables, funciones, métodos | camelCase | `userId`, `getUserById()` |
| Clases, interfaces, types, enums | PascalCase | `UserService`, `CreateUserDto`, `LoanStatus` |
| Propiedades de objetos (incluido el JSON de la API) | camelCase | `firstName` |
| Constantes globales | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Archivos y carpetas | kebab-case | `user-service.ts`, `user-management/` |
| Tablas, columnas, foreign keys | snake_case | `user_accounts`, `created_at`, `user_id` |
| Índices | `idx_<tabla>_<columnas>` | `idx_users_email` |
| Constraints | `pk_` / `uq_` / `fk_` / `ck_` + `<tabla>_<columnas>` | `uq_users_email` |

### Estado actual (medido sobre el código y la base local)

| Elemento | Cumple | Desvíos |
|---|---|---|
| Código TS (variables, clases, constantes) | sí | — |
| Enums | parcial | No hay `enum` de TS: los catálogos son constantes `Object.freeze` en UPPER_SNAKE_CASE (`APPROVAL_REQUEST_STATUS`, `shared/constants/domain-enums.ts`). Con Prisma pasan a `enum ApprovalRequestStatus` en el schema y se usa el tipo/objeto que genera el cliente. |
| Archivos y carpetas | casi | La carpeta `shared/constants/auditActions/` → `audit-actions/`. |
| JSON de la API | casi | 88 claves snake_case en 8 DTOs (fase 6b). |
| Tablas y columnas | casi | 43 tablas y 510 columnas en snake_case salvo `deletedAt` en `users`, `persons` y `reset_credentials` → `deleted_at`. `SequelizeMeta`/`SequelizeData` desaparecen con Sequelize. |
| Índices | no | 69 de 197 usan `idx_`; el resto tiene el nombre que puso Sequelize (`countries_code`, `phone_prefixes_country_id`…). |
| Constraints | no | Nombres por defecto de Postgres: 43 PK `*_pkey`, 47 FK `*_fkey`, 26 UNIQUE `*_key` (1 con `uq_`), 1 CHECK `*_check`. |

En el schema de Prisma cada nombre de la base va explícito (`@@map`, `@map`, `@id(map: …)`,
`@unique(map: …)`, `@@index(…, map: …)`, `@relation(…, map: …)`); si no, Prisma usa sus propios
nombres por defecto (`*_pkey`, `*_key`, `*_fkey`, `*_idx`). El renombrado en la base es solo de
metadatos (`ALTER INDEX … RENAME`, `ALTER TABLE … RENAME CONSTRAINT`, `RENAME COLUMN`): no reescribe
datos ni bloquea por mucho tiempo.

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| **0. Spike** | Prisma 7 instalado; `prisma db pull` + `scripts/prisma-migration/prisma-names.ts` → `prisma/schema.prisma` (43 modelos, 14 enums) con las convenciones de nombres; cliente CommonJS; `PrismaRepository` (paginación con el mismo contrato que `ReadRepository`); `gender.repository` sobre Prisma y sus 3 consumidores en camelCase. Verificado contra Postgres real, también desde `dist/`. | ✅ |
| **1. Infraestructura** | Logs de Prisma por el logger de la app (consultas solo con `DB_LOGGING=true`); `shared/database/database-health.ts`: `/health`, el arranque y el shutdown verifican/cierran Sequelize **y** Prisma; `tests/test-env.ts` (entorno de test compartido por Jest y `db:test:prepare`); perfil `test` sobre Postgres; CI con Postgres, typecheck y `db:test:prepare`. | ✅ |
| **2. Unit of Work** | `unitOfWork.run()` sobre `$transaction` + contexto en `AsyncLocalStorage`; los repositorios Sequelize y Prisma leen el mismo contexto durante la convivencia; llamadores de `begin()` → `run()`. | ⏳ |
| **3. Instancias vivas** | Las ~40 llamadas `record.update()`/`reload()` en services y workers → métodos de repositorio. Todavía sobre Sequelize: deja los services listos para objetos planos. | ⏳ |
| **4. PII** | Extensiones de Prisma para cifrado/hash/descifrado (person, person-contact, trusted-device) y `origin-session`. Tests que comparan con lo que escribe hoy Sequelize: **los datos existentes tienen que seguir leyéndose** (mismo formato de `EncryptionUtil`/`HashUtil`). | ⏳ |
| **5. Repositorios** (por dominio, un commit cada uno) | `BaseRepository` / `ReadRepository` / `AppendOnlyRepository` sobre Prisma (genéricos por modelo), y los 44 repositorios: `Op.*` → filtros Prisma, `include` por nombre de relación. Los tipos de services/DTOs pasan a los de Prisma. | ⏳ |
| **6. Migraciones y seeders** | Prisma Migrate con una migración base (`0_init`, marcada como aplicada en las bases existentes con `prisma migrate resolve --applied`); triggers como SQL crudo dentro de la migración; seeders → `prisma db seed` (TS). Se van `sequelize-cli`, `.sequelizerc`, `db:tracking` y `migrations/` de Sequelize. | ⏳ |
| **6b. API en camelCase** | Las 88 claves snake_case de los 8 DTOs que quedan → camelCase, con su Swagger y tests. | ⏳ |
| **6c. Nombres en la base** | Primera migración de Prisma después de la base: quitar las columnas `deletedAt` residuales (users, persons, reset_credentials), `DEFAULT now()` en `created_at`, `ON DELETE RESTRICT` en las FK NOT NULL de `person_locations`, índices → `idx_…`, constraints → `pk_`/`uq_`/`fk_`/`ck_`. Schema con los `map:` explícitos y `prisma migrate diff` en cero contra la base. Enums del dominio como `enum` de Prisma; `auditActions/` → `audit-actions/`. | ⏳ |
| **7. Cierre** | Quitar `sequelize`, `sqlite3`, modelos, `registry.ts`, `gen-model-types.js`; guarda de arquitectura: `@prisma/client` solo en repositorios y `shared/database`; docs (`database.md`, `implementation-patterns.md`, `solid.md`, README). | ⏳ |

Orden: lo que más riesgo tiene (transacciones, PII) se resuelve antes de tocar los repositorios en masa,
y la fase 3 desacopla los services del ORM **antes** del cambio, así la fase 5 queda acotada a `repositories/`.

## Cómo funciona hoy

| Pieza | Dónde |
|---|---|
| Schema | `prisma/schema.prisma`: modelos PascalCase, campos camelCase, nombres de la base con `@@map` / `@map` / `map:`. Lo produjo `prisma db pull` + `npx tsx scripts/prisma-migration/prisma-names.ts` (relaciones con los alias `as` de Sequelize). Hasta la fase 6 las migraciones siguen siendo las de Sequelize: si cambian la base, se repiten esos dos pasos. |
| Cliente | `npm run prisma:generate` → `shared/database/generated/prisma` (gitignored). Corre solo antes de `dev*`, `build`, `typecheck` y `test`. |
| Conexión | `shared/database/prisma.ts`: cliente único con `PrismaPg` y la misma config que Sequelize (DB_*, DB_SCHEMA, TLS salvo localhost, bundle CA de RDS). |
| CLI | `prisma.config.ts`: URL desde `DB_*`; sin `DB_HOST` (CI) no la necesita `generate`. `npm run prisma:pull`, `npm run prisma:studio`. |
| Repositorios | `shared/repositories/prisma.repository.ts` (`db`, `paginationArgs`, `searchWhere`). `sortBy` acepta el nombre de columna (`created_at`, lo que mandan hoy los clientes) o el campo (`createdAt`); solo campos del modelo. |
| Guardas | La de arquitectura acepta `extends PrismaRepository`; `generated/` queda fuera de la guarda, de loadability y de ESLint. |
| Salud y cierre | `shared/database/database-health.ts`: `checkDatabase()` (arranque y `/health`: sano solo si responden los dos ORMs) y `closeDatabase()` (graceful shutdown). |
| Tests | `npm run db:test:prepare` (una vez y al cambiar migraciones) + `npm test`. Entorno en `tests/test-env.ts`: Postgres, esquema `TEST_DB_SCHEMA` (por defecto `test`), sin TLS; `db:reset` se niega a tocar `public`. |

### Hallazgos de la fase 0

- **`users` tiene dos columnas de borrado lógico**: `deleted_at` (la que usa la app) y `deletedAt`, que creó la
  migración y nadie escribe; `persons.deletedAt` y `reset_credentials.deletedAt` tampoco las usa ningún
  modelo. La de `users` queda fuera del schema (Prisma no deja mapear a un nombre que ya usa otro campo).
  Fase 6c: eliminar las residuales (y su índice `users_deleted_at`).
- **`person_locations.city_id` y `department_id` son NOT NULL con `ON DELETE SET NULL`**: borrar una ciudad
  o un departamento con ubicaciones falla por la NOT NULL. Fase 6c: `ON DELETE RESTRICT`.
- **`created_at` no tiene DEFAULT en la base** (lo ponía Sequelize): el schema usa `@default(now())` y
  `@updatedAt` (lo hace el cliente); la fase 6c agrega los DEFAULT a la base. Las PK uuid sin default usan
  `@default(uuid())` (igual que el UUIDV4 de Sequelize).
- 31 relaciones inversas no tenían asociación en Sequelize: el script les dio nombre (`User.notifications`,
  `PhonePrefix.personContactsByPhonePrimaryPrefix`…); se revisan al migrar cada dominio.

## Riesgos y cómo se cubren

- **PII ilegible o en claro** → fase 4 aislada, con tests de compatibilidad contra datos escritos por la
  versión Sequelize, y verificación manual sobre la base local antes de seguir.
- **Bases existentes** → la migración base no se ejecuta en ellas (`migrate resolve --applied`); se
  verifica con `prisma migrate diff` que el schema no tiene diferencias con la base real.
- **Comportamiento de transacciones** (aislamiento, timeouts de `$transaction`) → tests de los flujos de
  doble aprobación, registro y login, que hoy usan transacciones manuales.
