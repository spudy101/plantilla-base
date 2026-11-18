# Auditoría y Alertas — guía de onboarding

> El detalle vive aquí.
> Relacionado: `docs/request-flow.md` (cómo el middleware setea el auditContext y AsyncLocalStorage).

## Idea general

El sistema tiene **dos herramientas de logging** con responsabilidades distintas:

- **`logAudit(...)`** → registra en **BD (`audit_logs`)**, **S3** y consola. Es el rastro de auditoría
  regulatorio. Si la acción está en el set de _alert triggers_, además crea una **alerta** (`audit_alerts`)
  visible para el Superadmin (RF-ADM-03).
- **`logger.{info,warn,error}`** → registra **solo en consola** (+ archivo en dev). Es trazabilidad operativa.

Ambas comparten el **correlationId** vía `AsyncLocalStorage`: dentro de un mismo flujo (request o ciclo de
worker), todos los `logAudit` y `logger.*` llevan el mismo ID, así que no se pasa en cada llamada.

## `logAudit(action, userId, details = {}, opts = {})`

`shared/utils/logger.util.ts`.

- **`action`** (req): clave de `AUDIT_ACTIONS` (ej. `'PRODUCT_DEACTIVATED'`).
- **`userId`** (req): UUID del actor; `null` en rutas públicas; `'system'` en workers/motor.
- **`details`** (opcional): objeto con datos específicos de la acción (ej. `{ totalItems, page }`).
- **`opts`** (opcional) — campos:
  - `entityId`, `entityType`, `entityTable` → **el 4º parámetro de identificación de entidad** (objeto).
    Convención del proyecto: SIEMPRE incluirlos en writes y en reads sobre una entidad concreta.
  - `outcome` = `'success'` (default) | `'failure'` | `'warning'` | `'attempt'`.
  - `httpStatus`, `errorCode`, `errorMessage` → poblados por el error handler global en fallos.
  - `context` → para tests (normalmente se omite; se resuelve solo).

```js
// Read de listado (incluir entityType/entityTable aunque no haya entityId)
logAudit('INTERNAL_USER_LIST_VIEWED', adminUserId, { totalItems: count }, { entityType: 'User', entityTable: 'users' });

// Write sobre una entidad concreta
logAudit(
  'INTERNAL_USER_DEACTIVATED',
  adminUserId,
  { justification },
  { entityId: userId, entityType: 'User', entityTable: 'users' }
);

// Worker / motor
logAudit(
  'DUAL_APPROVAL_EXPIRED',
  'system',
  { approvalRequestId },
  { entityId, entityType: 'ApprovalRequest', entityTable: 'approval_requests' }
);
```

## Contexto y correlation ID (AsyncLocalStorage)

`shared/utils/request-context.util.ts` mantiene un `AsyncLocalStorage` singleton. API:

| Método                   | Quién lo usa                                | Qué hace                                                                                           |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `run(ctx, fn)`           | `audit.middleware.ts` (routes)              | abre el contexto de una request HTTP y lo propaga a toda la cadena async                           |
| `get()`                  | `logger` (correlationFormat)                | devuelve el contexto actual o `undefined` (NO crea fallback)                                       |
| `runAsWorker(label, fn)` | cada cron/worker                            | abre el contexto de **un ciclo** de worker; envuelve `fn` en try/catch (ver `WORKER_CYCLE_FAILED`) |
| `runAsSystem(label, fn)` | callbacks de circuit breaker, eventos Redis | abre el contexto de un **evento de sistema/infra**                                                 |
| `getSafe()`              | `logAudit`                                  | devuelve el contexto actual; si NO hay, un fallback con `source:'unknown'`                         |

### Los 4 valores de `source` y los namespaces de correlationId

| `source`  | Origen                                                    | correlationId            | Cómo se setea                                                                                                                     |
| --------- | --------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `http`    | request de un route                                       | `req-<ts>-<uuid8>`       | `CorrelationMiddleware` genera el ID; `audit.middleware` arma el `auditContext` con `source:'http'` y hace `requestContext.run()` |
| `worker`  | cron/worker                                               | `worker-<label>-<uuid8>` | `requestContext.runAsWorker('<label>', …)` envuelve el ciclo                                                                      |
| `system`  | circuit breaker, Redis infra                              | `system-<label>-<uuid8>` | `requestContext.runAsSystem('<label>', …)`                                                                                        |
| `unknown` | **anomalía**: `logAudit` ejecutado fuera de todo contexto | `internal-<uuid8>`       | fallback de `getSafe()`                                                                                                           |

- **`source:'unknown'` es un termómetro de cobertura.** En operación normal NO debería aparecer: un audit
  sin contexto significa un punto de entrada que no se envolvió. Detectable con `WHERE source = 'unknown'`.
- El correlationId del cliente puede venir en el header `X-Correlation-Id`/`X-Request-Id` (se respeta) y se
  devuelve en la respuesta.

### logger: correlationId SOLO dentro de un flujo activo

`correlationFormat` usa **`get()`** (no `getSafe()`): si hay contexto activo estampa el correlationId; si NO,
no lo estampa. Por eso los **loggers huérfanos** (arranque del servidor en `base.server.ts`, eventos de
conexión de Redis en `redis.util.ts`, bootstrap de handlers) **no llevan correlationId** — correcto, no
pertenecen a ningún flujo. Sus mensajes y niveles NO se tocan, solo no se les inyecta correlationId.

> **Gotcha:** NO se pasan ip/userAgent/correlationId a `logAudit` ni a `logger.*` — viajan solos por el contexto.

### Niveles de logger (criterio del proyecto)

| Nivel   | Cuándo                                                                                             | Ejemplos                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `error` | excepción **no controlada**, el sistema no supo qué hacer                                          | bug, 5xx, ciclo de worker abortado                                                                   |
| `warn`  | algo salió mal pero el sistema **lo manejó**; solo el admin/infra puede resolver la causa          | integración caída, notificación no enviada, Redis degradado, rate-limit excedido                     |
| `info`  | todo lo **esperado** (aunque sea negativo); el usuario lo resuelve solo o no hay nada que resolver | contraseña incorrecta (401), validación fallida (422), recurso no encontrado (404), flujo completado |

Estos niveles ya están codificados en `httpLogger` (`_resolveHttpLogLevel`) y en el error middleware
(`_resolveBusinessLogLevel`): `400/404/422 → info`; el resto `≥400 → warn`; `5xx`/no-operacional → `error`.

> **`error` = alerta de CloudWatch.** Cada `logger.error` levanta una alerta operativa, así que se reserva para
> **imprevistos y causas que el admin/infra NO puede resolver por sí mismo** (bug, 5xx, ciclo de worker abortado).
> **Matiz (regla decisiva):** un error **atrapado** no baja automáticamente a `warn`. Si está controlado pero el
> admin **no puede corregirlo desde el panel** (necesita ingeniería/ops), sigue siendo `error`. `warn` se reserva
> a lo controlado **y** accionable por admin/infra (integración caída, notificación no enviada, Redis degradado).
>
> **Consecuencia en workers por lotes:** el `try/catch` **por-ítem** que captura un fallo inesperado (una
> notificación que no se pudo enviar, una sesión que no pudo expirar, un registro cuyo hash no se pudo
> recomputar) y **continúa el lote** loguea con **`logger.error`** — es un imprevisto no corregible por el admin,
> debe alertar. No es candidato a `warn` aunque esté atrapado. Reservá `warn` por-ítem solo cuando el ítem
> falla por una causa accionable (p. ej. la notificación del recordatorio no se pudo encolar).

## Persistencia (asíncrona, no bloqueante)

`logAudit` hace `setImmediate(() => Promise.allSettled([ _saveToDatabase, _saveToS3, (_createAlert si trigger) ]))`.
Retorna de inmediato; un fallo de persistencia se loguea pero no afecta la respuesta HTTP. S3:
`audit-logs/{YYYY-MM-DD}/{categoria}/{action}-{correlationId}.json` (`STANDARD_IA`).

## Estructura de una audit action

Cada acción declarada en `shared/constants/audit-actions/*.ts`:

```js
INTERNAL_USER_DEACTIVATED: {
  description: 'Usuario interno desactivado por administrador',
  category: AUDIT_CATEGORIES.INTERNAL_USERS, // valores en audit-catalog.ts
  risk: AUDIT_RISKS.HIGH,                     // low | medium | high | critical
  module: AUDIT_MODULES.ADMIN                 // admin | client | system (opcional)
}
```

- **`audit-catalog.ts` es la fuente de verdad** de las dimensiones. Exporta `AUDIT_CATEGORIES`, `AUDIT_RISKS`,
  `AUDIT_MODULES`, y además `AUDIT_OUTCOMES` (`success|failure|warning|attempt`) y `AUDIT_SOURCES`
  (`http|worker|system|unknown`). Nunca escribir un literal suelto: usar las constantes.
- `risk` solo determina si la acción puede generar **alerta** (vía el set de triggers), NO si se loguea.
- `module` indica quién la ejecuta. **No reutilizar una acción `module:'admin'` en un endpoint público/cliente**
  (rompería el filtrado por `module`); crear la acción `module:'client'` que corresponda.
- En el log persistido se guardan además: `outcome`, `httpStatus`, `errorCode`, `errorMessage`, `userId`,
  `sessionId`, `entityId/Type/Table`, `correlationId`, `ip`, `userAgent`, `fingerprint`, `method`, `path`,
  `details`, `source`, `created_at`.

### Organización de archivos (`shared/constants/audit-actions/`)

```
index.ts                       ← registro central (spread de TODOS los archivos) — SIEMPRE agregar el nuevo aquí
audit-catalog.ts               ← fuente de verdad: CATEGORIES/RISKS/MODULES/OUTCOMES/SOURCES
audit-alert-triggers.ts        ← Set de actions que generan alerta en panel Superadmin
audit-actions.system.ts        ← genéricas de infra (auth/validación/500, WORKER_CYCLE_FAILED, Redis) — outcome='failure'
audit-actions.{dominio}-admin.js   ← acciones de humanos (admin/usuario/analista)
audit-actions.{dominio}-client.js  ← acciones de cliente
audit-actions.{dominio}-shared.js  ← acciones compartidas admin+client (ej. maintainers, PQRS pública)
audit-actions.{dominio}-system.js  ← acciones de workers/cron/motor/helper → userId='system' o null
```

Reglas:

- ❌ Nunca mezclar acciones `system` dentro de un archivo `-admin`.
- ✅ Si el dominio tiene workers, crear su archivo `-system`.
- ❌ Nunca olvidar registrar el archivo nuevo en `index.ts` (si no, `logAudit` no encuentra la definición y
  cae al fallback `'Sin categoría'`/`'unknown'`).

## Dónde va el `logAudit`: éxito en el service, fallo en el middleware

El patrón es **un logAudit por punto de entrada, con el resultado**, repartido así:

- **Éxito → en el service**, al FINAL del flujo (cuando ya se conoce el resultado). El método público que
  el controller llama es el "punto de entrada".
- **Fallo → automático en el error middleware**, NO en el service. Cada route declara su acción de dominio
  con `AuditAction.declare(...)` y, si el handler explota, `error.middleware.ts` emite el logAudit con
  `outcome:'failure'` y la acción declarada. **El service NO lleva try/catch + logAudit para el error.**

### `AuditAction.declare` (`shared/middlewares/audit-action.middleware.ts`)

```js
router.post('/x',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(...),
  RateLimitMiddleware.apiLimiter(),
  XValidator.create(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('X_CREATED', { entityType: 'X', entityTable: 'xs' }), // ← último middleware antes del controller
  XController.create
);
```

- Setea `res.locals.auditAction = { action, entityType, entityTable }`.
- Va **después de Auth/RBAC/Validator y justo antes del controller**: así los fallos pre-handler
  (401/403 auth/rbac, 429 rate-limit, 422 validación) conservan su acción **genérica** del mapeo de error,
  y solo los fallos del handler heredan la acción de dominio.
- En `error.middleware.ts`: `const action = res.locals?.auditAction?.action ?? _resolveAuditAction(err)`.
  Sin declaración → cae al mapeo genérico por status (`AUTH_FAILURE`, `ACCESS_DENIED`, `VALIDATION_FAILURE`,
  `RESOURCE_NOT_FOUND`, `BUSINESS_RULE_VIOLATION`, `SYSTEM_ERROR` — definidas en `audit-actions.system.ts`).

### Granularidad por tipo de punto de entrada

- **Route:** un logAudit de éxito en el método del service + (en fallo) el del middleware. Métodos públicos
  distintos del mismo service tienen cada uno su acción — eso NO es duplicación.
- **Worker por lotes:** **un logAudit por ítem procesado** dentro del loop (ej. `DUAL_APPROVAL_EXPIRED`) es la
  granularidad correcta. El fallo **global** del ciclo lo cubre el wrapper (`WORKER_CYCLE_FAILED`).
  - **Excepción válida — worker que solo notifica:** un worker cuyo único efecto es **enviar una notificación**
    (recordatorios) **no emite `logAudit` por ítem**: la notificación deja su propia traza (`notifications`) y
    auditar cada recordatorio inflaría `audit_logs` sin valor regulatorio. Sigue envuelto en `runAsWorker` (el
    fallo del ciclo lo cubre `WORKER_CYCLE_FAILED`). No confundir con incumplir la regla de oro: la regla de oro
    aplica a **services expuestos por endpoint**, no a workers de puro side-effect de notificación.
- **Evento de sistema (`runAsSystem`):** el logAudit vive en el callback/util que ES el punto de entrada del
  evento. Los callbacks de fallback del circuit breaker (`onOpen`/`onClose` → `PROVIDER_FALLBACK_ACTIVATED`/
  `PROVIDER_FALLBACK_RESOLVED`) viven en `shared/base/circuit-breaker.bootstrap.ts` (registro neutral que cubre
  las integraciones del template —AWS: SES, SNS, S3—; se registra una vez por servidor desde `BaseServer`). Un
  proyecto derivado con integraciones de negocio propias las suma al mismo registro. Los eventos de conexión de
  Redis se auditan en `redis.util.ts`.
- **Efectos colaterales válidos (no son duplicación):** un audit de fire-and-forget fallido en un `.catch()` o
  un warning de rama son **eventos distintos** del audit principal del flujo.
- **Fallo de integración auditado como evento de dominio (NO es la Regla 2):** cuando la caída de un proveedor
  externo es un **desenlace válido del flujo** (no una excepción que deba propagar al error middleware), el
  service audita ese desenlace con `outcome:'failure'` **sin `throw`**. Es distinto del "éxito en service, fallo
  en middleware": aquí el flujo **terminó bien** (manejó la caída), y el `logAudit(..., { outcome:'failure' })`
  describe el resultado de negocio, no una excepción no controlada.
- ❌ **Anti-patrón real:** dos logAudit en la MISMA request por el MISMO evento — ej. emitir la acción del
  método principal y _además_ otra desde un helper privado que el mismo flujo invoca.

## Workers: contexto y fallo del ciclo

Cada cron envuelve su ciclo en `requestContext.runAsWorker('<dominio>.<tarea>', async () => { … })`:

- Da un correlationId estable `worker-<label>-<uuid8>` a todo el ciclo y `source:'worker'`.
- **El wrapper es el único try/catch del ciclo.** Si `fn` lanza, emite `logger.error` + `logAudit(
'WORKER_CYCLE_FAILED', 'system', { worker, error }, { outcome:'failure', entityType:'Worker' })` y traga la
  excepción (no tumba el cron). `WORKER_CYCLE_FAILED` está en el set de alert triggers (alerta a Superadmin).
- Por eso **los callbacks de cron ya NO llevan try/catch propio**. Los try/catch internos por-ítem (para que
  un ítem fallido no aborte el lote) y los `finally` de locks SÍ se conservan.

## Alert triggers (`audit-alert-triggers.ts`)

`Set` de action codes que, además de loguearse, **crean una alerta** en `audit_alerts` para el Superadmin.
`logAudit` consulta `AUDIT_ALERT_TRIGGER_ACTIONS.has(action)` y, si está, llama `_createAlert(entry)`
(crea la fila con `risk` por defecto `high`, `acknowledged: false`).

> Al agregar una acción nueva `risk:'high'`/`'critical'` relevante (cambios de roles, purga de auditoría,
> doble aprobación, caída de infra, fallo de worker, etc.), evaluar si debe entrar al Set con su comentario.

## API de consulta — `/api/v1/records/audit/audit-logs` (homologada)

El validator `admin-audit-log.validator.ts` filtra **solo contra el catálogo** (no strings libres):
`action` ∈ `Object.keys(AUDIT_ACTIONS)`; `category` ∈ `AUDIT_CATEGORIES`; `risk` ∈ `AUDIT_RISKS` **+ `'unknown'`**
(valor de fallback que la tabla puede contener); `module` ∈ `AUDIT_MODULES`; `outcome` ∈ `AUDIT_OUTCOMES`;
`source` ∈ `AUDIT_SOURCES` (incluye `'unknown'`). El endpoint de catálogo `/api/v1/records/audit/audit-action-catalog/*`
expone categorías/riesgos/módulos/acciones desde la misma fuente.

## Trazabilidad de sesión — columnas `origin_session_id` + API forense

Dos capas que atan una **fila de dominio** a la **sesión** que la originó (RF-ADM-03; el plan de origen ya no
está en el repo — lo vivo es esta sección + `docs/rbac/modulos/06-auditoria.md`). Sirven para responder "¿quién hizo esto y desde qué sesión/dispositivo?" ante una
reclamación ("yo no firmé/autoricé eso").

**Columna `origin_session_id` (+ `origin_correlation_id`)** — se **sella al CREAR** la fila, no al actualizarla, en
las tablas de acción probatoria del usuario (consentimientos, cambios de usuario, intentos de login, overrides de
permisos, preferencias/dispositivos, solicitudes de doble aprobación, etc.). El relleno es **automático** vía el
extensión del cliente de Prisma (`piiExtension`, `shared/database/prisma-extensions.ts`): toda tabla que declare la
columna la rellena sola al crear, desde el AsyncLocalStorage, **ambos
null en workers/sistema** (nunca `NOT NULL`, o rompería la creación sistémica). Se declara en `prisma/schema.prisma`
(con su migración) + índice `idx_<tabla>_origin_session_id`. El DTO expone `originSessionId` **solo donde el
admin lo necesita ver** (approval, consentimientos, change-logs). Detalle: `docs/origin-session-tracking.md`.

> **La columna NO es la fuente del timeline** — `audit_logs` ya guarda `session_id` + `entity_table`/`entity_id`, así
> que el timeline de una sesión sale de `audit_logs` con una consulta indexada. La columna es **red de seguridad**:
> índice inverso fila→sesión, cobertura de filas sin evento de auditoría, y durabilidad si `audit_logs` rota.

**API forense (`/api/v1/records/audit/sessions`)** — el consumidor. Módulo RBAC `GLOBAL_LOGS` (READ), distinto de
`/auth/sessions` (que es *control*: ver/revocar). Tres GET: listado con conteo de acciones · cabecera + timeline desde
`audit_logs` · hidratación **perezosa y por lote** (un `findAll` por tabla, reusando los DTOs admin). Respeta el
masking de PII (no es self-view). Código: `modules/admin/records/audit/*session-trace*`.

## Modelos

- `audit-log.model.ts` → tabla `audit_logs`. **Sin FK real a users** (`constraints: false`) para que el log
  sobreviva al borrado del usuario (requisito SFC). Append-only (solo `create`; nunca `update`). `source` es
  `STRING(50)` (acepta `unknown`); `risk` ENUM incluye `unknown`; `session_id` se persiste (null en worker/sistema).
- `audit-alert.model.ts` → tabla `audit_alerts`. `acknowledged` / `acknowledged_by` / `acknowledged_at`;
  `updatedAt: false` (no se actualizan, solo se crean y reconocen).

## Retención y archivado (`modules/schemas/records/audit/workers/audit-archive.worker.ts`)

- Cron mensual (día 1, 07:00). Lee `SystemGlobalConfig.audit_retention_hot_years` (default 5) y loguea
  cuántos registros están por vencer la ventana caliente.
- La **purga destructiva** del caliente la gobierna la config global `SystemGlobalConfig.audit_hot_purge_enabled`
  (BOOLEAN, default `false`): `iniciar()` la lee y solo ejecuta la purga si está encendida. Con el flag activo,
  el worker borra de la BD los registros que superaron `audit_retention_hot_years` (la copia permanece en S3/frío);
  se audita con `AUDIT_LOG_PURGE_EXECUTED` (antes/después) y usa `SET LOCAL app.allow_audit_purge = 'true'` para
  pasar el trigger de inmutabilidad de la tabla. La enciende el Superadministrador desde el panel de config.
  También puede invocarse manualmente con `run({ enableDbPurge: true })`.
- S3 conserva el frío (Standard-IA → Glacier vía lifecycle de Terraform), **sin expiración** → retención indefinida
  que excede el mínimo legal de 10 años (Circular SFC). El campo `audit_retention_cold_years` es informativo.

## Regla de oro en services

**Todo método de service expuesto por un endpoint debe llamar `logAudit()`** en la rama de éxito — listados,
detalles, estadísticas, mantenedores y todos los writes, sin excepción. El service recibe `adminUserId`/`userId`
(el controller pasa `req.user.userId`); los workers usan `'system'` o `null`. El **fallo** lo audita el error
middleware vía la acción declarada con `AuditAction.declare` — no lo dupliques en el service.
