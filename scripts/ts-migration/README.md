# Herramientas de la migración a TypeScript

Scripts de apoyo para migrar archivos `.js` → `.ts` (ver [`docs/typescript-migration.md`](../../docs/typescript-migration.md)).
Se ejecutan desde la raíz del repo con `node scripts/ts-migration/<script>`. Ninguno sustituye la
revisión manual: resuelven la parte mecánica y dejan lo que no saben resolver para tiparlo a mano.

| Script | Qué hace | Uso |
|---|---|---|
| `cjs-to-ts.js` | `git mv x.js x.ts` + convierte `require`/`module.exports` a `import x = require()` / `export =` (mismo contrato CommonJS). Reporta lo que no sabe convertir. | `node scripts/ts-migration/cjs-to-ts.js <archivos.js…>` |
| `fix-params.js` | Corre `tsc` y anota parámetros "implicitly any" cuyo nombre tiene un tipo inequívoco en el proyecto (`userId: string`, `ttl: number`, `req: Request`…). | `node scripts/ts-migration/fix-params.js [prefijo]` |
| `fix-unknown-catch.js` | Corre `tsc` y en cada `catch` con error `unknown` cambia `error.message` por `errorMessage(error)` (agrega el import). | `node scripts/ts-migration/fix-unknown-catch.js [prefijo]` |
| `edit.js` | Helper para scripts de edición: pares `[buscar, reemplazar]` exactos; respeta CRLF; no escribe nada si algún texto no aparece. | `require('./scripts/ts-migration/edit.js')(archivo, pares, { all })` |

## Flujo recomendado por carpeta

1. `node scripts/ts-migration/cjs-to-ts.js $(find <carpeta> -name '*.js')`
2. `node scripts/ts-migration/fix-unknown-catch.js <carpeta>` y `node scripts/ts-migration/fix-params.js <carpeta>`
3. `npx tsc -p tsconfig.json --noEmit` → tipar a mano el resto (interfaces de entrada/salida, `as const`, etc.)
4. `npm run typecheck && npm run lint && npm test`

## Trampas conocidas

- **`fix-params.js` usa un diccionario por nombre.** Nombres ambiguos (`status`, `data`, `type`…) están
  fuera a propósito: `status` es un código HTTP en un archivo y el estado de un circuito en otro.
  Revisa el diff de cada archivo.
- **Sombra de `errorMessage`.** Si una función recibe un parámetro `errorMessage` (p. ej. opciones de
  logs), el nombre importado queda tapado dentro de ella. `fix-unknown-catch.js` lo detecta y usa
  `errorMessageModule.errorMessage(x)`; ESLint (`no-shadow`) lo marca si se escapa.
- **Comentarios en el medio.** Los scripts de edición buscan texto exacto: si entre dos líneas hay un
  comentario, inclúyelo en el texto a buscar.
- **Regex en heredocs de bash.** El shell de este entorno se come los backslashes: para editar código
  con expresiones regulares usa el editor, no un heredoc.
