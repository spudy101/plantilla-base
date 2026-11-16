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
| **2. Resto de `shared/`** | `constants/`, `utils/`, `dtos/`, `middlewares/`, `services/`, `validators/`, `base/`, `models/index` + mixin: **`shared/` ya no tiene `.js`** | ✅ |
| **3. Modelos + repositorios** | Los 41 modelos tipados **desde su definición real** (`gen-model-types.js`: `Attributes`, `CreationAttributes`, `Instance` con asociaciones, `Static`) y registro tipado `shared/models/registry.ts`; los 41 repositorios en TS con `extends BaseRepository<defineX.Instance>`; contratos `XRepositoryPort` en `modules/schemas/repository-ports.ts` de los que cada service deriva su puerto con `Pick<…>` | ✅ |
| **4. Dominios** (uno por commit) | `modules/schemas` ✅ · `modules/shared-endpoints` ✅ · `modules/client` ✅ · `modules/admin` ⏳ (services, controllers, routes, dtos, validators) | 🔶 3/4 |
| **5. Arranque y config** | `servers/`, `config/` | ⏳ |
| **6. Cierre** | Tests a `.ts`, `allowJs: false`, pasar de `export =` a `import`/`export` nativos (ya sin consumidores JS), quitar `babel-jest`, migraciones/seeders a `.ts` | ⏳ |

Orden pensado de abajo hacia arriba: cada fase solo depende de capas ya tipadas, así los tipos
"suben" sin `any` intermedios.

## Utilidades para migrar

Scripts en [`scripts/ts-migration/`](../scripts/ts-migration/README.md): codemod `.js` → `.ts` y fixers de
parámetros y `catch` (ver su README para el flujo y las trampas conocidas).

Tipos y helpers compartidos:

- `shared/utils/error-message.util.ts`: `errorMessage(e)`, `errorName(e)`, `isOperationalError(e)` para los
  `catch` (con `strict` el error es `unknown`). Si una función recibe un parámetro llamado
  `errorMessage`, usar `errorMessageModule.errorMessage(…)` para no taparlo.
- `shared/types/express.d.ts`: propiedades que los middlewares agregan a `req` (`user`, `correlationId`,
  `serverContext`, `externalService`, `lockKey`).
- `shared/types/db-rows.ts`: formas mínimas de filas (`UserRefRow`, `DbDate`, `Maybe<T>`) para tipar lo
  que leen los DTOs sin depender de los modelos (estructurales: los modelos tipados de la fase 3 encajan).
- `shared/utils/auth-user.util.ts`: `requireAuthUser(req)` — el usuario autenticado tipado, o 401 si la
  ruta quedó sin AuthMiddleware (antes era un `TypeError` → 500).
- **Modelos** (`modules/schemas/**/models/*.model.ts`): la factory `defineX(sequelize)` y sus tipos en un
  namespace fusionado (`defineX.Attributes`, `defineX.CreationAttributes`, `defineX.Instance`,
  `defineX.Static`). Esos tipos los **genera** `gen-model-types.js` desde `rawAttributes`/`associations`:
  al cambiar una columna o asociación se vuelve a correr y no hay desincronización posible. Lo que no se
  genera (métodos de instancia, estáticos como `STATUS`) va en un namespace manual antes del bloque
  generado, que el script conserva. Los timestamps están en `Attributes` como opcionales (`createdAt?`) y
  en `Instance` como `readonly`: en un `where` literal se usa el atributo (`createdAt`), que en los modelos
  `underscored` es la misma columna `created_at`.
- `shared/repositories/query.ts`: `WhereClause` + `toWhere()` para los `where` que se arman por partes
  según filtros opcionales, y `range()` / `dateRange()` para rangos `[Op.gte, Op.lte]`.
- `ReadRepository#aggregate<R>(options)`: `findAll` con `raw: true` para COUNT/AVG/GROUP BY; `R` describe
  las columnas que devuelve (no son instancias del modelo). `ReadRepository#sequelize` para `query()` crudas.
- **Puertos de repositorio** (`modules/schemas/repository-ports.ts`, generado con
  `gen-repository-ports.js`): `UserRepositoryPort = typeof userRepository`, etc. Un service no depende
  del contrato entero sino de lo que usa: `type UserReader = Pick<UserRepositoryPort, 'findByUserId'>`
  (ejemplo en `shared/services/rbac.service.ts`).
- **Services con dependencias** (`constructor(deps = {})`): `class-deps.js` declara cada campo con el
  tipo de su default (`userRepository: typeof userRepository`) y genera `XService.Deps`. Composiciones
  (`deps.x ?? new X(...)`) quedan como `InstanceType<typeof X>`.
- **Controllers**: `requireAuthUser(req)` / `requireAuthPerson(req)` (un `const user` por handler) y
  `routeParam(req, 'id')` (`shared/utils/route-param.util`): string garantizado o 400. Lo aplica
  `req-user.js`. Cookies de sesión web: `shared/utils/auth-cookies.util` (una sola definición).
- **Contextos**: `shared/types/audit-context.ts` — `RequestAuditContext` (HTTP: ip, userAgent,
  fingerprint…) y `AdminAuditContext` (quién hace la acción admin). `KeyValueCache`
  (`shared/types/cache.ts`) para código que recibe Redis o la caché local indistintamente.
- **Tipos que cruzan archivos** van en un `*.types.ts` del dominio (`notification.types`,
  `notification-feed.types`, `profile.types`): un módulo que exporta una instancia (`export =
  new X()`) no deja alcanzar los tipos de su namespace desde otro archivo.
- Campos de clase opcionales que no siempre se asignan: `declare campo?: T`. Con target ES2023
  (`useDefineForClassFields`) un campo sin `declare` se crea como `undefined` en cada instancia.

## Hallazgos de la migración

### Bugs corregidos

- **Ventana de gracia de rotación de refresh token** (`refresh-token-store.util`): se guardaba con
  `JSON.stringify` y se leía con `JSON.parse` sobre lo que `redisClient.get` ya devuelve parseado →
  `getRotation` siempre devolvía `null` y dos `/auth/refresh` concurrentes podían detectarse como
  reuse attack. Corregido (acepta también el formato viejo) y cubierto con test.
- **Webhook con `apiKey` repetida en la query** (`?apiKey=a&apiKey=b`): llegaba un array a la verificación de
  la API key, `crypto` lanzaba y respondía 500. Ahora solo se acepta un string → 401.
- **Push token nunca se guardaba al iniciar sesión** (`user-push-token.repository#upsertToken`): faltaban los
  `await` de `findByDeviceId`/`findByToken`, así que `existing` era siempre una Promise y
  `existing.update()` lanzaba `TypeError`; `auth-login` lo tragaba en su `catch`. Corregido y con test.
- **`AuditLogRepository#register` sí podía lanzar** pese a su contrato ("nunca lanza"): el `try/catch`
  envolvía una Promise sin `await`, así que el rechazo de BD escapaba al llamador. Corregido y con test.
- **Filtros perdidos en `UserChangeLogRepository`**: `findByChangeType` y `findByAdminUser` pasaban claves
  snake_case que `findAllPaginated` no lee, y devolvían los logs de todos (sin llamadores hoy). Corregido
  (se agregó el filtro `changedByUserId`) y con test.

#### Fase 4 (dominios)

- **Push en frío**: `registrarDispositivo` usaba el campo `_snsClient` (null hasta el primer uso del
  getter) → registrar un dispositivo fallaba siempre en un proceso recién levantado. Junto con el bug de
  `upsertToken` (fase 3), el push nunca funcionó. Test.
- **Caída del servidor sin Redis**: tras una notificación global, `cache.del(...).catch` sobre la caché
  local (síncrona) lanzaba `TypeError` en un timer → `uncaughtException` → `process.exit(1)` en
  producción. Test.
- **Entidad relacionada de notificaciones**: se escribía `relatedEntity_type`/`relatedEntity_id`
  (columnas inexistentes, Sequelize las descartaba) y el biométrico pasaba el id suelto en vez de
  `{ type, id }`. Nunca se guardó. Tests.
- **Clientes SES/SNS sin timeout**: `requestTimeout` no es opción del cliente en el SDK v3 y se ignoraba;
  ahora va en `requestHandler`.
- **`blocked_by_device_id`** nunca se guardaba al bloquear un dispositivo. Test.
- **Transacciones ignoradas**: `incrementAttempts` y `roleRepository.findByName` no aceptaban
  `{ transaction }` y corrían fuera de la del llamador. Test.
- **`user_login_attempts.username_attempt`** es NOT NULL y se llenaba con `auth_username` (nullable):
  fallback a `username`.
- **TOTP**: sin `username` en el token, la etiqueta de la app autenticadora quedaba en `'null'`.

### Cambios de contrato

- **`UserRepository#create` → `createWithPassword`**: recibía `password` en claro en vez de
  `password_hash`, así que no era sustituible por el `create` del `BaseRepository` (Liskov). Ahora es un
  método propio y `create` vuelve a ser el genérico. Se actualizaron los 3 llamadores y sus tests.
- Overrides que solo llamaban a `super` (`findById`/`delete` en `privacy-policy-admin` y
  `auth-trusted-device`) se eliminaron.
- `JwtUtil.verifyRefreshToken` valida y devuelve claims tipados (`userId`/`jti` obligatorios → 401).
- Recursos inexistentes que antes terminaban en `TypeError` → 500 (contacto/persona del perfil, usuario
  recién creado, fingerprint ausente) ahora responden 404/400 explícitos.

### Código residual eliminado

- **Bypass de autenticación de desarrollo** (residuo de la integración con Cognito: sus tokens falsos
  incluían un `idToken`). Estaba apagado de hecho — la config nunca expuso `server.bypass` — y se
  eliminó de `auth.middleware`, `auth-login`, `token-refresh` y `auth-register`. Si en algún momento se
  necesita un modo de pruebas sin login, debe diseñarse aparte (variable explícita, solo en desarrollo).
- **`InvalidPasswordException`** en `updatePassword` (error de Cognito) y la limpieza de la cookie
  `id_token` (token de Cognito) en logout.

## Qué queda fuera a propósito (por ahora)

- **ORM**: Sequelize se mantiene. Cambiar a Prisma/Drizzle es una decisión aparte; gracias a los
  repositorios afectaría solo a `repositories/` y `models/`.
- **Migraciones y seeders** siguen en `.js` hasta la fase 6 (corren vía `tsx`, así que ya pueden
  importar módulos `.ts`).
