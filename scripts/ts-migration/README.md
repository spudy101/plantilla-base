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
| `class-deps.js` | Services con `constructor(deps = {})`: declara los campos (`typeof default` o `InstanceType<typeof X>`), genera `XService.Deps` y tipa el constructor. | `node scripts/ts-migration/class-deps.js <archivos.ts…>` |
| `req-user.js` | Controllers: `req.user.x` → `requireAuthUser(req).x` (un `const user` por handler; `requireAuthPerson` si lee personId) y `req.params.x` → `routeParam(req, 'x')`. | `node scripts/ts-migration/req-user.js <archivos.ts…>` |
| `dto-picks.js` | DTOs que desestructuran su entrada: `({ a, b })` → `({ a, b }: Pick<Campos, 'a' \| 'b'>)` contra una interfaz escrita a mano. | `node scripts/ts-migration/dto-picks.js <archivo.dto.ts> <Interfaz>` |
| `test-mocks.js` | Tests `.ts`: los módulos pasados a `jest.mock()` se leen con `mocked()` (`tests/helpers/mock.ts`) para poder usar `.mockReturnValue` & cía. Idempotente. | `node scripts/ts-migration/test-mocks.js <tests.ts…>` |
| `fix-test-types.js` | Tests `.ts`: corre el typecheck y resuelve lo mecánico — parámetros/`let` sin tipo → `Loose`, fixtures parciales pasados al código bajo prueba → `fixture(…)`. | `node scripts/ts-migration/fix-test-types.js [prefijo]` |
| `edit.js` | Helper para scripts de edición: pares `[buscar, reemplazar]` exactos; respeta CRLF; no escribe nada si algún texto no aparece. | `require('./scripts/ts-migration/edit.js')(archivo, pares, { all })` |

## Flujo recomendado por carpeta

1. `node scripts/ts-migration/cjs-to-ts.js $(find <carpeta> -name '*.js')`
2. `node scripts/ts-migration/fix-unknown-catch.js <carpeta>` y `node scripts/ts-migration/fix-params.js <carpeta>`
3. `npx tsc -p tsconfig.json --noEmit` → tipar a mano el resto (interfaces de entrada/salida, `as const`, etc.)
4. `npm run typecheck && npm run lint && npm test`

Para **services y controllers** (fase 4), después del paso 1: `class-deps.js` y `req-user.js`.

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
- **`x = null` sin anotar** se infiere como tipo `null`: los llamadores TS no pueden pasar un valor.
  Anotar `x: T | null = null`. Dentro de un patrón desestructurado no se puede anotar en línea.
- **`perl -pi`/`sed -i` con una lista de archivos vacía** se queda leyendo stdin: verificar la lista antes.
- **Backticks en `node -e` desde bash.** El shell interpreta `` `…` `` dentro de comillas dobles: los
  template literals se pierden. Escribir el script de edición a un archivo.
- **Regex en heredocs de bash.** El shell de este entorno se come los backslashes: para editar código
  con expresiones regulares usa el editor, no un heredoc.

## Tests (fase 6)

1. `node scripts/ts-migration/cjs-to-ts.js $(find tests -name '*.js')`
2. `node scripts/ts-migration/test-mocks.js $(find tests -name '*.test.ts')`
3. `node scripts/ts-migration/fix-test-types.js` → tipar a mano lo que quede (`?.` sobre índices,
   `as Record<…>` sobre resultados `unknown`, resultados de DTOs mockeados como `Loose`).

`tests/helpers/mock.ts` concentra la única laxitud de tipos de los tests: `mocked()` (módulos
mockeados), `fixture()` (entradas parciales) y `Loose` (parámetros de implementaciones de mocks y
resultados cuya forma la define un mock). El código bajo prueba se importa sin envolver.
