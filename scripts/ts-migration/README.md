# Herramientas de la migración a TypeScript

Scripts de apoyo para migrar archivos `.js` → `.ts` (ver [`docs/typescript-migration.md`](../../docs/typescript-migration.md)).
Se ejecutan desde la raíz del repo con `node scripts/ts-migration/<script>`. Ninguno sustituye la
revisión manual: resuelven la parte mecánica y dejan lo que no saben resolver para tiparlo a mano.

| Script | Qué hace | Uso |
|---|---|---|
| `cjs-to-ts.js` | `git mv x.js x.ts` + convierte `require`/`module.exports` a `import x = require()` / `export =` (mismo contrato CommonJS). Reporta lo que no sabe convertir. | `node scripts/ts-migration/cjs-to-ts.js <archivos.js…>` |
| `fix-params.js` | Corre `tsc` y anota parámetros "implicitly any" cuyo nombre tiene un tipo inequívoco en el proyecto (`userId: string`, `ttl: number`, `req: Request`…). | `node scripts/ts-migration/fix-params.js [prefijo]` |
| `fix-unknown-catch.js` | Corre `tsc` y en cada `catch` con error `unknown` cambia `error.message` por `errorMessage(error)` (agrega el import). | `node scripts/ts-migration/fix-unknown-catch.js [prefijo]` |
| `gen-model-types.js` | Tipa las factories de modelos desde la definición que Sequelize carga (`rawAttributes`, `associations`) y escribe `shared/models/registry.ts`. Idempotente: al regenerar conserva el namespace manual. | `npx tsx scripts/ts-migration/gen-model-types.js` |
| `type-repositories.js` | Agrega el genérico del modelo a cada repositorio (`extends BaseRepository<defineX.Instance>`) y su `import type`. | `node scripts/ts-migration/type-repositories.js <repos.ts…>` |
| `where-builders.js` | `const where = {}` → `WhereClause` y los bloques `where.x = {}; where.x[Op.gte] = …` → `range()`/`dateRange()`. | `node scripts/ts-migration/where-builders.js <archivos.ts…>` |
| `gen-repository-ports.js` | Genera `modules/schemas/repository-ports.ts` (`XRepositoryPort` por repositorio). Regenerar al agregar o renombrar un repositorio. | `node scripts/ts-migration/gen-repository-ports.js` |
| `edit.js` | Helper para scripts de edición: pares `[buscar, reemplazar]` exactos; respeta CRLF; no escribe nada si algún texto no aparece. | `require('./scripts/ts-migration/edit.js')(archivo, pares, { all })` |

## Flujo recomendado por carpeta

1. `node scripts/ts-migration/cjs-to-ts.js $(find <carpeta> -name '*.js')`
2. `node scripts/ts-migration/fix-unknown-catch.js <carpeta>` y `node scripts/ts-migration/fix-params.js <carpeta>`
3. `npx tsc -p tsconfig.json --noEmit` → tipar a mano el resto (interfaces de entrada/salida, `as const`, etc.)
4. `npm run typecheck && npm run lint && npm test`

Para **repositorios**, entre el paso 1 y el 2: `type-repositories.js` (genérico del modelo) y
`where-builders.js` (where por partes y rangos); al final, `gen-repository-ports.js`.

## Trampas conocidas

- **`fix-params.js` usa un diccionario por nombre.** Nombres ambiguos (`status`, `data`, `type`…) están
  fuera a propósito: `status` es un código HTTP en un archivo y el estado de un circuito en otro.
  Revisa el diff de cada archivo.
- **Sombra de `errorMessage`.** Si una función recibe un parámetro `errorMessage` (p. ej. opciones de
  logs), el nombre importado queda tapado dentro de ella. `fix-unknown-catch.js` lo detecta y usa
  `errorMessageModule.errorMessage(x)`; ESLint (`no-shadow`) lo marca si se escapa.
- **Comentarios en el medio.** Los scripts de edición buscan texto exacto: si entre dos líneas hay un
  comentario, inclúyelo en el texto a buscar.
- **`fix-params.js` y los sufijos `Id`/`Ids`.** En este proyecto toda PK/FK es UUID, por eso
  `fooId` → `string` y `fooIds` → `string[]`. Si algún día hay PKs numéricas, revisar esa regla.
- **Backticks en `node -e` desde bash.** El shell interpreta `` `…` `` dentro de comillas dobles: los
  template literals se pierden. Escribir el script de edición a un archivo.
- **Regex en heredocs de bash.** El shell de este entorno se come los backslashes: para editar código
  con expresiones regulares usa el editor, no un heredoc.
