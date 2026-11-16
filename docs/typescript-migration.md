# Migración a TypeScript

> La plantilla pasa de JavaScript a TypeScript **por fases, en la rama `feat/typescript`**.
> Mientras dura la migración, `.ts` y `.js` conviven: la app arranca y los tests pasan al final de
> cada fase. Decisiones tomadas: base en la rama SOLID, Sequelize se mantiene (los repositorios
> aíslan el ORM, ver [`solid.md`](solid.md)), Node 24 LTS.

## Cómo funciona hoy

| Necesidad | Herramienta | Comando |
|---|---|---|
| Desarrollo con hot-reload | `nodemon` + `tsx` (ejecuta `.ts` y `.js` sin compilar) | `npm run dev` |
| Revisar tipos | `tsc --noEmit` (incluye tests) | `npm run typecheck` |
| Build de producción | `tsc` → `dist/` (CommonJS) | `npm run build` |
| Producción | `node` sobre el build | `npm start` (después de `npm run build`) |
| Tests | Jest: `.ts` con `ts-jest` (solo transpila), `.js` con `babel-jest` | `npm test` |
| Migraciones / seeders | `sequelize-cli` a través de `tsx` | `npm run db:migrate`, `npm run db:seed` |
| Lint | ESLint + `typescript-eslint` sobre `.js` y `.ts` | `npm run lint` |
| Docker | `node:24-alpine`, `npm run build` en la etapa builder, arranque desde `dist/` | — |

`tsconfig.json`: modo **estricto completo** para los `.ts` (`strict`, `noUncheckedIndexedAccess`,
`noImplicitOverride`…). Los `.js` se compilan tal cual (`allowJs`) pero **no** se revisan
(`checkJs: false`): activarlo de golpe marcaría miles de líneas que todavía no son TypeScript.

> ⚠️ `node servers/monolith.js` (Node puro sobre las fuentes) ya **no** funciona: Node 20 no carga
> `.ts`. Usa `npm run dev` (tsx) o `npm run build && npm start`.

## Reglas para migrar un archivo

1. **Renombrar** `x.js` → `x.ts` (`git mv` para conservar historial) y tiparlo. Sin `any` salvo que
   esté justificado en un comentario.
2. **Mismo contrato de exportación.** Mientras queden `.js` que hagan `require()` del archivo, el `.ts`
   exporta con `export =` (compila a `module.exports =`), así los consumidores no cambian:

   ```ts
   class MiService {
     constructor(deps: MiService.Deps = {}) { /* ... */ }
   }

   // Tipos asociados: fusión de declaraciones (namespace con el mismo nombre que la clase)
   // eslint-disable-next-line @typescript-eslint/no-namespace
   namespace MiService {
     export interface Deps { miRepository?: MiRepositoryPort }
   }

   // Instancia por defecto + la clase para tests/composición (equivale al patrón JS
   // module.exports = new X(); module.exports.X = X)
   export = Object.assign(new MiService(), { MiService });
   ```

3. **Importar** desde `.ts`: `import X = require('./x')` para módulos CommonJS del proyecto,
   `import type { … } from 'sequelize'` para tipos. `import type` no genera código.
4. **Tests**: el test del archivo puede quedarse en `.js`; si se migra, `*.test.ts`.
5. `npm run typecheck && npm run lint && npm test` en verde antes de commitear. La guarda
   `tests/unit/guards/solid-architecture.test.js` ya entiende `.ts` (imports, `export =`,
   `constructor(deps: T = {})`).

> Babel no soporta `export =`: por eso Jest usa `ts-jest` (modo `isolatedModules`, solo transpila)
> para los `.ts`. Los tipos los revisa `npm run typecheck`, no Jest.

## Fases

| Fase | Alcance | Estado |
|---|---|---|
| **1. Infraestructura + núcleo** | tsconfig, build, dev, Jest, ESLint, Docker, CLI de BD vía tsx; `AppError`, `ReadRepository` / `BaseRepository` / `AppendOnlyRepository` (genéricos `<M extends Model>`), `UnitOfWork` (con su puerto `Port`), `domain-enums` (uniones literales), `es256-signature.util` | ✅ |
| **2. Resto de `shared/`** | ✅ `constants/` (23) y `utils/` (30) · ⏳ `dtos/`, `middlewares/`, `services/`, `validators/`, `base/`, `models/index` + mixin | 🔄 |
| **3. Modelos + repositorios** | Tipar los 45 modelos de `modules/schemas/*/models` (`InferAttributes`) junto a su repositorio; `modules/**/repositories` → `extends BaseRepository<UserModel>`; definir **interfaces de puerto** (`UserRepositoryPort`) que consumen los services | ⏳ |
| **4. Dominios** (uno por commit) | `schemas/kyc`, `schemas/notification`, `schemas/records`, `schemas/core`, `schemas/integration`; luego `shared-endpoints`, `client`, `admin` (services, controllers, routes, dtos, validators) | ⏳ |
| **5. Arranque y config** | `servers/`, `config/`, `shared/base/` | ⏳ |
| **6. Cierre** | Tests a `.ts`, `allowJs: false`, pasar de `export =` a `import`/`export` nativos (ya sin consumidores JS), quitar `babel-jest`, migraciones/seeders a `.ts` | ⏳ |

Orden pensado de abajo hacia arriba: cada fase solo depende de capas ya tipadas, así los tipos
"suben" sin `any` intermedios.

## Utilidades para migrar

- `shared/utils/error-message.util.ts`: `errorMessage(e)`, `errorName(e)`, `isOperationalError(e)` para los
  `catch` (con `strict` el error es `unknown`). Si una función recibe un parámetro llamado
  `errorMessage`, usar `errorMessageModule.errorMessage(…)` para no taparlo.
- `shared/types/express.d.ts`: propiedades que los middlewares agregan a `req` (`user`, `correlationId`,
  `serverContext`, `externalService`, `lockKey`).
- Campos de clase opcionales que no siempre se asignan: `declare campo?: T`. Con target ES2023
  (`useDefineForClassFields`) un campo sin `declare` se crea como `undefined` en cada instancia.

## Bugs encontrados por los tipos

- **Ventana de gracia de rotación de refresh token** (`refresh-token-store.util`): se guardaba con
  `JSON.stringify` y se leía con `JSON.parse` sobre lo que `redisClient.get` ya devuelve parseado →
  `getRotation` siempre devolvía `null` y dos `/auth/refresh` concurrentes podían detectarse como
  reuse attack. Corregido (acepta también el formato viejo) y cubierto con test.

## Qué queda fuera a propósito (por ahora)

- **ORM**: Sequelize se mantiene. Cambiar a Prisma/Drizzle es una decisión aparte; gracias a los
  repositorios afectaría solo a `repositories/` y `models/`.
- **Migraciones y seeders** siguen en `.js` hasta la fase 6 (corren vía `tsx`, así que ya pueden
  importar módulos `.ts`).
