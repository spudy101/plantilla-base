# Arquitectura

Este documento es la referencia de cómo está organizado el proyecto y dónde va cada cosa.
Si algo del código lo contradice, el código está mal (o este documento está desactualizado: arréglalo).

## Resumen

**Monolito modular.** Un solo proceso y un solo despliegue, dividido en **módulos por dominio**
(`iam`, `person`, `notification`, …). Cada módulo es dueño de todo lo suyo: rutas, lógica, acceso a
datos, workers y documentación. Dentro de cada módulo el código se organiza en **tres capas**.

Principios: **KISS** y **YAGNI**. No se construye nada "por si acaso": ni interfaces con una sola
implementación, ni configuraciones para despliegues que no existen.

## Estructura

```
src/
  server.ts            arranque: infraestructura, workers, listen, apagado ordenado
  app.ts               Express: middlewares globales + monta los routers de cada módulo
  config/              swagger y certificados

  modules/
    iam/               usuarios, roles, RBAC, sesiones, login, registro, MFA, biometría, dispositivos
    person/            persona, contactos, ubicaciones, referencias, perfil
    catalogs/          país, departamento, ciudad, género, tipo de documento, prefijos, avatares
    notification/      tipos, categorías, envío, proveedores, preferencias, webhook de rebotes
    audit/             auditoría, alertas, traza de sesiones y operaciones, actividad del usuario
    legal/             consentimientos, políticas de privacidad
    approvals/         doble aprobación (maker-checker)
    settings/          configuración global del sistema
    banners/           banners promocionales
    integration/       logs de APIs externas, fallback de proveedores

  shared/              infraestructura técnica, SIN conocimiento del negocio
    database/          cliente Prisma, unit of work, extensiones
    http/              AppError, respuestas, paginación, middlewares técnicos
    security/          jwt, hash, cifrado, hmac, totp, firmas
    infra/             redis, s3, callProvider (circuit breaker, reintentos, timeout)
    observability/     logger, contexto de la operación (AsyncLocalStorage), traza de operaciones
    constants/         constantes técnicas y configuración de entorno
    types/             tipos globales (augmentations de Express, etc.)
    utils/             helpers genéricos mínimos (interop, mensajes de error)

prisma/                schema, migraciones y seeds
tests/                 helpers y tests de integración
docs/                  documentación
```

## Un módulo por dentro

Todos los módulos siguen el mismo molde. Las carpetas que un módulo no necesita no se crean.

```
modules/notification/
  index.ts             API pública: lo ÚNICO que otros módulos pueden importar
  routes/              <feature>.routes.ts  — URL + middlewares (auth, RBAC, validación)
  controllers/         traduce HTTP ↔ servicio
  services/            reglas de negocio
  repositories/        acceso a datos (Prisma)
  requests/            esquemas Zod de la entrada (validan, tipan y documentan)
  responses/           esquemas Zod de la salida + la función que la arma (lista blanca, PII enmascarada)
  workers/             tareas periódicas
  providers/           integraciones externas (SES, SNS, …)
  middlewares/         middlewares con reglas del dominio (p. ej. auth y RBAC en iam)
  utils/               helpers propios del dominio
  docs/                documentación OpenAPI de sus rutas
```

Los tests unitarios viven **al lado del archivo que prueban**: `foo.service.ts` → `foo.service.test.ts`.

## Las capas

| Capa | Hace | No hace |
|---|---|---|
| **route** | Declara URL, método y middlewares | Lógica |
| **controller** | Lee `req`, llama al servicio, arma la respuesta | Reglas de negocio, acceso a BD |
| **service** | Reglas de negocio, orquesta repositorios y otros módulos, transacciones | Conocer `req`/`res` o Express |
| **repository** | Habla con Prisma (y nadie más lo hace) | Decisiones de negocio |

## Entrada y salida: un esquema, tres usos

Cada petición tiene **un esquema Zod** en `requests/` y cada respuesta uno en `responses/`. Ese único esquema:

1. **valida** la entrada en la ruta: `validate({ body: ReplaceBannersBody })` → si falla, 422 con
   `{ field, message, hint, value }` en español; si pasa, `req.body` queda con el valor ya parseado;
2. **tipa** el código: `type ReplaceBannersBody = z.infer<typeof ReplaceBannersBody>` es lo que recibe el service;
3. **documenta** la API: `toOpenApi(ReplaceBannersBody)` genera el schema de Swagger, así no se desalinea.

```ts
// requests/admin-promotional-banner.request.ts
import { z } from '../../../shared/validation/z';
import { text, optionalText } from '../../../shared/validation/fields';
export const BannerInput = z.object({ title: text('El título', { max: 120 }), tag: optionalText('La etiqueta', 40) });

// routes
router.put('/promotional-banners', AuthMiddleware.authenticate, …, validate({ body: ReplaceBannersBody }), Controller.replace);
```

Los campos genéricos (uuid, texto, entero, booleano) están en `shared/validation/fields.ts`; los de un dominio
(documento, teléfono…) en su módulo. Importar `z` siempre desde `shared/validation/z` (mensajes en español).

En `responses/`, cada archivo tiene la función que arma la salida (`XxxDTO` o un `Component.build`) y, al
final, su esquema (`XxxSchema`). Una prueba de conformidad (`*.response.test.ts`) corre cada función sobre un
ejemplo y exige que cumpla su esquema: si alguien agrega un campo a la salida y no al esquema, falla.

```ts
// responses/admin-notification-category.response.ts
export const NotificationCategoryAdminSchema = NotificationCategorySchema.extend({ emailLayoutTemplate: z.string().nullable(), updatedAt: dateTime() });

// docs/notification-category.paths.ts — nada escrito a mano
const schemas = {
  AdminNotificationCategory: toOpenApi(NotificationCategoryAdminSchema, 'output'),
  AdminNotificationCategoryUpdateRequest: toOpenApi(UpdateCategoryBody)
};
// en cada operación
parameters: toParameters(CategoryIdParams, 'path'),
requestBody: jsonBody('AdminNotificationCategoryUpdateRequest'),
```

Piezas de salida compartidas: `dateTime()`, `PaginationMetadata` y `listOf()` en `shared/validation/output.ts`;
los textos de enmascaramiento PII en `shared/validation/pii-masking.doc.ts`. Si otro módulo necesita un esquema
de salida, el `index.ts` lo expone (`personModule.personSchemas`, `iamModule.authSchemas`,
`catalogsModule.catalogSchemas`, `legalModule.legalSchemas`). Los esquemas globales de Swagger
(`src/config/swagger/schemas`) también se generan desde los módulos: ahí no se escribe nada a mano.

> Los esquemas de entrada migrados desde express-validator usan `input()` (aceptan campos no declarados, como
> antes); para código nuevo usá `z.object` (descarta lo que no está declarado).

## Reglas

1. **Las dependencias van hacia abajo:** route → controller → service → repository. Nunca al revés.
2. **Un módulo solo importa el `index.ts` de otro módulo**, nunca sus archivos internos.
3. **`shared/` no importa nada de `modules/`.** Si algo necesita saber qué es un usuario, pertenece a un módulo.
4. **Interfaces solo donde hay más de una implementación real** (p. ej. proveedores con fallback).
5. **Las reglas se verifican con tests** (`tests/unit/guards/`), no con buena voluntad.

### Cómo se usa otro módulo

```ts
import iamModule from '../../iam';
const { AuthMiddleware, userRepository } = iamModule;
import type { UserProfileRow } from '../../iam';
```

El `index.ts` de cada módulo es un objeto con getters: cada export se carga recién al usarse. Los
módulos se usan entre sí (iam ↔ audit, iam ↔ notification…) y un `index` que cargara todo de una vez
generaría ciclos de carga. Para exponer algo nuevo, se agrega un getter al `index.ts` del módulo.

### Cómo usa `shared/` algo de un módulo

No lo importa: publica un punto de registro y `src/app.ts` le conecta el módulo dueño al arrancar.

| `shared/` necesita… | Punto de registro | Lo provee |
|---|---|---|
| Auditar un evento de infraestructura (worker caído, Redis, 401/403) | `registerAuditSink` | `modules/audit` |
| Persistir una llamada a un proveedor externo | `registerIntegrationLogWriter` | `modules/integration` |
| Leer la configuración de resiliencia | `registerResilienceSource` | `modules/settings` |
| Avisar que un circuito se abrió o se cerró (ventana de fallback + auditoría) | `CircuitBreaker.registerCallbacks` | `modules/integration` |

## ¿Dónde va esto?

| Quiero… | Va en |
|---|---|
| Un endpoint nuevo | `modules/<dominio>/routes/` + controller + service |
| Una regla de negocio | `modules/<dominio>/services/` |
| Una consulta a la BD | `modules/<dominio>/repositories/` |
| Usar algo de otro módulo | `import … from '../<otro>'` (su `index.ts`) |
| Mandar una notificación | `notifier.notify({ type, userId, metadata })` del index de `modules/notification` |
| Registrar un hecho de negocio | `audit.record(acción, { actorId, … })` del index de `modules/audit` |
| Un job periódico | `modules/<dominio>/workers/` |
| Integrar un proveedor externo | `modules/<dominio>/providers/` |
| Llamar a un proveedor externo (SES, S3, SNS…) | `callProvider` de `shared/infra/provider-call.util` (nunca `client.send` suelto) |
| Una operación que no se debe ejecutar dos veces aunque el cliente reintente (crear, enviar, cobrar) | `idempotent()` de `shared/http/idempotency` en la ruta (ver docs/idempotency.md) |
| Un error temporal (reintentar puede funcionar) | `retryable` + `retryAfter` en el `AppError` (ver docs/errors-and-retries.md) |
| Algo técnico sin negocio (cifrado, Redis, paginación) | `shared/<área>/` |
| Un dominio nuevo | copiar el molde de un módulo existente |

## Llamadas a proveedores externos

Toda llamada de red a un proveedor pasa por `callProvider`, que aplica, en este orden: **circuit breaker** del
producto → **reintentos** con backoff → **timeout** por intento → **una línea de log** por llamada.

```ts
const res = await callProvider({ product: 'ses', endpoint: 'SES:SendEmailCommand', notificationId }, abortSignal =>
  sesClient.send(command, { abortSignal })
);
```

- Timeout, intentos y umbrales del breaker salen de settings (`integrationResilience`), no del código.
- **Métricas y traza en CloudWatch, no en la base.** La línea `[Provider] <producto> <endpoint> → <resultado>`
  lleva producto, endpoint, resultado, duración, código de error y `correlationId` (Logs Insights la encuentra con
  el resto de la operación). En producción trae además un bloque EMF y CloudWatch la convierte en métricas
  (namespace `ProviderCalls`, dimensión `Product`: `Calls`, `Failures`, `Rejected`, `Latency`), sin SDK ni
  llamadas extra. Sirve igual para un proveedor que no sea de AWS. Las **alarmas** (p. ej. `Failures`/`Calls`
  de SES > 5% en 5 min, `Rejected` > 0) y la retención del log group se configuran en AWS.
- Si el negocio necesita un dato de la llamada, se guarda **en la entidad del negocio**: p. ej. el código de
  error de un envío va a `notifications.email_error_code` / `push_error_code`, que lee el worker de reintentos.
- Los clientes del SDK (SES, SNS, S3) se crean con `...AWS_CLIENT_OPTIONS` (`maxAttempts: 1`): reintenta solo
  `callProvider`, no también el SDK. Lo verifica `tests/unit/guards/provider-calls.test.ts`.
- Solo los errores **transitorios** (5xx, 408/429, throttling, timeout, red) se reintentan y cuentan para el
  circuito. Un 4xx (dirección inválida, acceso denegado) muestra que el proveedor responde: se propaga al primer intento.
- Con el circuito abierto se lanza `CircuitOpenError` (503) sin llamar al proveedor. Pasado `recoveryTimeMs`,
  **una sola** llamada de prueba (entre todas las instancias) decide si se cierra o sigue abierto.
- El estado vive en Redis (memoria si no hay Redis) y no vence solo: cada apertura tiene su cierre. Al abrirse y
  al cerrarse, `modules/integration` registra la ventana en `provider_fallback_events` y lo audita.

> **Alternativa conocida (no adoptada):** las librerías habituales en Node son [opossum](https://github.com/nodeshift/opossum)
> (circuit breaker) y [cockatiel](https://github.com/connor4312/cockatiel) (reintento + breaker + timeout combinados).
> Guardan el estado en memoria de cada proceso: con varias instancias, cada una abre su propio circuito y avisa su
> propia ventana de fallback. Se eligió el estado compartido en Redis para tener una sola ventana por caída. Si eso
> deja de importar, cambiar `circuit-breaker.util` por una de ellas no toca a los que usan `callProvider`.

## Auditoría, operaciones y logs

Son tres cosas distintas y cada una tiene su lugar:

| | Auditoría | Traza de operaciones | Logs |
|---|---|---|---|
| Responde | ¿Qué hecho de negocio ocurrió y quién lo hizo? | ¿Qué operación corrió, cuánto tardó, cómo terminó? | ¿Qué pasó por dentro, paso a paso? |
| ¿Se puede perder? | No: se escribe en la misma transacción | Tolerable | Tolerable |
| Retención | Años | Semanas o meses | Días o semanas |
| Dónde | `audit_logs` → S3 | `operations` | consola (JSON) → CloudWatch |

Todo comparte el mismo `correlationId`, que identifica una operación (petición HTTP, webhook, ciclo
de worker o tarea de sistema) de principio a fin.

## Errores, reintentos e idempotencia

Toda respuesta de error dice si es **temporal** (`retryable: true`, y `Retry-After` si se sabe cuánto
esperar) o **permanente**. El servidor repite por su cuenta las transacciones que chocan por deadlock o
serialización (si no tuvieron efectos externos) y responde 503, no 500, cuando la base no está. El
contrato completo, para quien consume la API: docs/errors-and-retries.md.

Las operaciones que no se deben ejecutar dos veces (hoy: crear y enviar notificaciones) exigen el header
`Idempotency-Key`: un reintento con la misma clave recibe la respuesta guardada. Cómo funciona, cuándo
usarlo y sus límites: docs/idempotency.md.

## Servidor

Hay un único servidor. Los prefijos `/admin` y `/client` separan las audiencias a nivel de rutas
(cada una con sus políticas de autenticación), no de despliegue.
