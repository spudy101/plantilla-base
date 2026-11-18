# Flujo de request, errores y contexto — guía de onboarding

> Cómo viaja un request por la app: middlewares globales, autenticación, RBAC, rate-limit, request-lock,
> validación, controller→service, y manejo centralizado de errores. Auditoría en `docs/audit-and-alerts.md`; RBAC en
> `docs/rbac/rbac.md`; enmascaramiento de PII en `docs/pii-masking.md`.

## Pipeline completo

```
Request
 → [middlewares globales BaseApp]
 → [middlewares de ruta]  Auth → RBAC → RateLimit → RequestLock → Validator → handleValidationErrors
 → Controller → Service → Repository → Model → DB
 → ApiResponse  (o AppError → ErrorMiddleware.handleError)
```

| Capa       | Responsabilidad                                                                     |
| ---------- | ----------------------------------------------------------------------------------- |
| Controller | recibe req, llama validator+service, devuelve `ApiResponse`. Sin lógica de negocio. |
| Service    | toda la lógica; lanza `AppError`; llama `logAudit`. No accede a DB directo.         |
| Repository | único lugar con el cliente de Prisma; extiende `PrismaRepository`.                  |
| Schema     | `prisma/schema.prisma` (tablas, relaciones); la PII la cifra la extensión del cliente. |
| Validator  | cadenas express-validator; extiende `BaseValidator`.                                |
| DTO        | arma la respuesta en camelCase, campo a campo (nunca spread de una fila).            |

## Middlewares globales (`shared/base/base.app.ts`) — ORDEN CRÍTICO

```js
this.app.set('trust proxy', 1);
this.app.use(CorrelationMiddleware.addCorrelationId); // 1. req.correlationId (PRIMERO)
this.app.use(SecurityMiddleware.helmet()); // 2. headers seguridad
this.app.use(SecurityMiddleware.cors());
this.app.use(SecurityMiddleware.addSecurityHeaders);
this.app.use(express.json({ limit: '10mb' })); // 3. body parsing
this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
this.app.use(this._handleMalformedJson.bind(this)); //    captura JSON inválido → 400
this.app.use(auditContextMiddleware); // 4. auditContext + AsyncLocalStorage (necesita body + correlationId)
this.app.use(compression()); // 5. gzip
this.app.use(httpLogger); // 6. log HTTP (necesita correlationId)
// rutas built-in de BaseApp: GET /health, GET /   (los docs los monta setupSwagger() de cada app en GET /docs)
```

Dependencias: `auditContext` necesita `correlationId` + `body` ya parseados; `httpLogger` necesita
`correlationId`. **No reordenar.** No se repiten en las rutas.

> ⚠️ `cookieParser()` **no** está en `BaseApp`: lo monta solo el monolito (`servers/monolith.ts:24`). En modo
> standalone (`dev:admin`/`dev:client`) `req.cookies.access_token` es `undefined` y todo request cae al camino
> `Authorization: Bearer` → `canal='mobile'`. Ver `docs/run-modes.md`.

## Middlewares de ruta (orden recomendado)

```js
router.post(
  '/recurso/:id',
  AuthMiddleware.authenticate, // 1. pobla req.user (debe ir antes de RBAC)
  RbacMiddleware.requirePermission(RBAC_MODULES.X, RBAC_ACTIONS.UPDATE), // 2. autoriza
  RateLimitMiddleware.apiLimiter(), // 3. rate limit
  RequestLockMiddleware.forAuthenticatedUsers(), // 4. dedup de requests concurrentes
  MyValidator.update(), // 5. validación
  ValidatorUtil.handleValidationErrors, // 6. corta con 422 si hubo errores
  AuditAction.declare('X_UPDATED', { entityType: 'X', entityTable: 'xs' }), // 7. declara la acción auditada
  MyController.update // 8. controller
);
```

> ❌ Gotcha: RBAC antes que Auth = `req.user` undefined → falla. Auth SIEMPRE primero.

## `req.user` (tras AuthMiddleware.authenticate)

`auth.middleware.ts` valida un **JWT RS256 propio** con `JwtUtil.verifyAccessToken` (autenticación 100% propia:
la contraseña se valida contra el hash en BD en el login; en mobile además firma HMAC con ventana de 10 s),
revisa device blocklist + token blacklist + **inactividad de 15 min para TODO usuario autenticado** (cliente e
interno, con `last_access_at` deslizante; lo único que cambia por rol es el texto del 401), y puebla:

`{ sessionId, userId, personId, roleId, roleName, firstName, lastName, email, nationalId, canal('web'|'mobile'),
username, authUsername, tokenIat, tokenExp }`

Variantes: `authenticate` (sin exigir rol), `optionalAuthenticate` (nunca falla; la usa el widget del
asistente), `requireRole(roles)` (legacy — en rutas admin nuevas usar RBAC), `externalAuthenticate`
(x-api-key para servicios externos, ej. `POST /notifications`) y `externalWebhookAuthenticate` (api key por
query string, para webhooks).

## `res.locals.auditContext`

Lo setea `auditContextMiddleware`: `{ correlationId, ip, userAgent, fingerprintHash, method, path, query,
body, timestamp, source }`. Se usa para construir el `_auditCtx` que el controller pasa al service:

```js
function _auditCtx(req, res) {
  return {
    adminUserId: req.user.userId,
    adminFirstName: req.user.firstName,
    ipAddress: res.locals.auditContext.ip,
    userAgent: res.locals.auditContext.userAgent
  };
}
```

> El ip/userAgent/correlationId también los toma `logAudit`/`logger` solos vía AsyncLocalStorage; el
> `_auditCtx` se usa cuando el service necesita esos datos explícitos (ej. para persistir o notificar).

## Errores — `AppError` + handler global

`shared/utils/app-error.util.ts` — lanzar SIEMPRE `AppError` (nunca `throw 'string'`), sin try/catch en
controllers/validators (el `asyncHandler` reenvía al handler global).

| Factory                                                | HTTP | code                 |
| ------------------------------------------------------ | ---- | -------------------- |
| `AppError.badRequest(msg, details?)`                   | 400  | BAD_REQUEST          |
| `AppError.unauthorized(msg, details?)`                 | 401  | UNAUTHORIZED         |
| `AppError.forbidden(msg, details?)`                    | 403  | FORBIDDEN            |
| `AppError.notFound(msg, details?)`                     | 404  | NOT_FOUND            |
| `AppError.conflict(msg, details?)`                     | 409  | CONFLICT             |
| `AppError.unprocessableEntity(msg, details?)`          | 422  | UNPROCESSABLE_ENTITY |
| `AppError.tooManyRequests(msg, details?, retryAfter?)` | 429  | RATE_LIMIT           |
| `AppError.internal(msg, details?)`                     | 500  | INTERNAL_ERROR       |
| `AppError.serviceUnavailable(msg, details?)`           | 503  | SERVICE_UNAVAILABLE  |

El 2º arg `details` suele llevar `{ code: 'CODIGO_NEGOCIO' }` para que el front discrimine (ej.
`{ code: 'MFA_REQUIRED' }`, `{ code: 'DUAL_APPROVAL_SAME_AS_MAKER' }`).

`shared/middlewares/error.middleware.ts`:

- `asyncHandler(fn)` envuelve el handler async y reenvía rechazos a `handleError`.
- `handleError`: loguea, **audita el fallo** (`outcome: 'failure'`, mapeando el error a una acción:
  401→`AUTH_FAILURE`, 403→`ACCESS_DENIED`, 400/422→`VALIDATION_FAILURE`, 404→`RESOURCE_NOT_FOUND`,
  409/429→`BUSINESS_RULE_VIOLATION`, resto→`SYSTEM_ERROR`), y responde. Mapea también errores de Prisma (P2002 duplicado, P2025 no encontrado…), JWT y Multer.

## Respuestas — `ApiResponse`

`shared/utils/app-response.util.ts`. Éxitos: `success(res, msg, data, statusCode=200, metadata)`,
`created` (201), `accepted` (202, doble aprobación), `noContent` (204). Errores:
`badRequest/unauthorized/forbidden/notFound/conflict/tooManyRequests/validationError/error`.

Estructura éxito: `{ success, statusCode, message, data, metadata, timestamp }`.
**Aplanado automático:** si `data` ya viene como `{ data, metadata }` (DTO de lista), `success()` lo aplana
a nivel raíz → por eso el controller pasa el resultado del service directo, sin desestructurar.

**Red de seguridad PII:** `success()` pasa `data` y `metadata` por `PiiMaskingMiddleware.apply(res, …)` — es la
capa C del enmascaramiento, invisible desde el controller. Detalle en `docs/pii-masking.md` §2.

## Rate limit y request lock

- `rate-limit.middleware.ts`: `apiLimiter()` (autenticados), `authLimiter()`/`loginIpLimiter()` (login),
  `forgotPasswordLimiter()`, `publicLimiter()`, `assistantLimiter()` (chat público). Store híbrido Redis +
  memoria; al exceder → 429 con `Retry-After`.
- `request-lock.middleware.ts`: `forAuthenticatedUsers()` / `forPublicEndpoints()`. Lock por
  `hash(userId|ip + method + path + body)` (clave por ruta → endpoints distintos no se bloquean entre sí);
  Redis `SET NX EX` atómico, se libera en `res.on('finish')`. Duplicado concurrente → 409 (auth) / 429 (público).
  Ante error o sin Redis, deja pasar (no bloquea la app).

## Correlation y trazabilidad

`correlation.middleware.ts` toma `x-correlation-id`/`x-request-id` del cliente o genera
`req-{ts}-{rand}`, lo pone en `req.correlationId` y en el header `X-Correlation-Id` de la respuesta.
Todos los logs (`logger.*`, `logAudit`) lo incluyen automáticamente → se puede rastrear un request
de punta a punta.

## Gotchas

- Auth antes de RBAC (si no, `req.user` undefined).
- No try/catch en controllers; usar `asyncHandler` + lanzar `AppError` en el service.
- No desestructurar `{ data, metadata }` en el controller — pasar el resultado del service directo a `ApiResponse.success`.
- Sin Redis, auth/rate-limit/lock tienen fallback a BD/memoria (los logouts se respetan vía `UserSession` en BD).
- Nunca loguear datos sensibles; el auditContext ya sanitiza body/query (password, token, nationalId, email…).
