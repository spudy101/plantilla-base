# Sistema de Notificaciones — guía de onboarding

> El detalle vive aquí.
> Punto de entrada único: **`NotificationCreationService`** (`modules/schemas/notification/services/notification-creation.service.js`).

## Idea general

Cada notificación se define por un **`NotificationType`** (fila en `notification_types`, identificada por
`code`), que **pertenece a una `NotificationCategory`**. Un service de negocio dispara
`crearNotificacion({ tipoNotificacion: 'CODE', ... })`; el sistema resuelve el tipo por `code`, renderiza los
templates con `metadata`, persiste la notificación y programa el envío (push/email/**sms**) en background
respetando preferencias del usuario, quiet hours, rate limits y retries.

> **La categoría es la FUENTE DE VERDAD** de: los canales soportados (`supports_push`/`supports_email`/
> `supports_sms`), el "no molestar" (`allow_dnd`, `is_critical`, quiet hours por defecto), la `priority`
> y el **layout base del email** (`email_layout_template`, un cascarón HTML con el placeholder `{{content}}`
> donde se inyecta el `email_body_template` del tipo). El **tipo** solo aporta su contenido (los templates).
> Las **preferencias del usuario** se atan a la **categoría** (o son globales), no al tipo — ver "Comportamiento automático".

```
Service ──crearNotificacion()──> resuelve NotificationType por code (+ su categoría)
                                  └─ render {{variables}} con metadata
                                  └─ envuelve el email en el layout de la categoría
                                  └─ persiste Notification (o GlobalNotification si userId=null)
                                  └─ setImmediate → notification-sending (push SNS / email SES / sms SNS)
                                  └─ emite SSE 'count-updated'
Workers (cron) ──> procesar diferidas (quiet hours) · retry push · retry email · cleanup
```

## ¿Cuándo disparar una notificación? (criterio)

A diferencia de `logAudit` (mecánico: **todo** punto de entrada audita), una notificación se crea **solo cuando el evento le importa a una persona como hecho que querría conocer**. Reads, listados y consultas NO notifican; transiciones de estado, decisiones y acciones sobre la cuenta/expediente del usuario SÍ.

### El canal interno es el piso; correo/push se deciden por sensibilidad

Toda notificación crea el registro **interno (in-app)** — es el piso, siempre presente. Lo único que se decide caso por caso es si además sale por **correo** y/o **push**, según importancia/sensibilidad:

- Acción rutinaria → puede quedar solo interna. Ej: `PROFILE_UPDATED` ("actualizaste tu perfil con éxito").
- Acción sensible / de seguridad → interna **+ correo**. Ej: `TOTP_ACTIVADO`, `RESET_PASSWORD`.

(El canal efectivo se gatea con `supports_email`/`supports_push`/`supports_sms` de la **categoría** del tipo **+** las preferencias `allow_email`/`allow_push`/`allow_sms` del usuario — ver "Comportamiento automático".)

### Rutas de cliente → destinatario = el propio cliente (self)

La acción la ejecuta el cliente y le interesa saber que la hizo: `userId = req.user.userId`. Ejemplos reales del template: perfil (`EMAIL_UPDATED`, `PHONE_UPDATED`, `PASSWORD_UPDATED`, `NATIONAL_ID_UPDATED`), seguridad (`NUEVO_DISPOSITIVO_DETECTADO`, `CODIGO_VERIFICACION`), onboarding (`BIENVENIDA`).

### Rutas de admin → interno del admin + (si afecta al cliente) notificación al cliente

Misma lógica, con un matiz: si la acción del admin es algo que **al cliente le interesa saber**, se crean DOS notificaciones en el mismo método (**doble notificación**):

1. al **cliente afectado** (`target-client`, userId resuelto vía `person_id`) — la decisión/hecho.
2. **interna al admin** que la ejecutó (`adminUserId`) — registro de su propia acción.

Ejemplo canónico real — `admin-person.service.js`, al activar/desactivar la cuenta de un cliente:

```js
setImmediate(() => {
  // 1) al cliente afectado: se entera de la decisión sobre su cuenta
  NotificationCreationService.crearNotificacion({
    tipoNotificacion: userNotificationType, // ACCOUNT_ACTIVATED | ACCOUNT_DEACTIVATED
    userId: affectedUserId
    /* ... */
  }).catch(/* ... */);

  // 2) interna para el admin que actuó: queda registrado que él lo hizo
  NotificationCreationService.crearNotificacion({
    tipoNotificacion: 'PERSON_ADMIN_ACTION',
    userId: adminUserId
    /* ... */
  }).catch(/* ... */);
});
```

Otros `target-client` reales (admin actúa → el cliente se entera): `ACCOUNT_BLOCKED`, `NATIONAL_ID_CHANGED`, `EMAIL_CHANGED_NEW`/`_OLD`, `PASSWORD_RESET_ADMIN`, `AUTH_SESSION_REVOKED_CLIENT`. En IAM (gestión de usuarios internos): `IAM_ADMIN_ROLE_CHANGED`, `IAM_ADMIN_STATUS_CHANGED`, `IAM_ADMIN_USER_CREATED`.

### Destinatarios que no son "un usuario" → `crearNotificacionDirecta`

Cuando el destinatario no tiene cuenta (o no debe pasar por preferencias/quiet hours) se usa `crearNotificacionDirecta({ tipoNotificacion, email, metadata })` — email puro, sin persistir `Notification`. Casos reales del template: confirmación de cuenta eliminada (`CUENTA_ELIMINADA`) y solicitudes de reset de credenciales por email (`CODIGO_VERIFICACION`).

### Disparadas por workers/system (sin actor humano)

Eventos de tiempo/lote emitidos por un worker con `userId:'system'`: el destinatario es quien deba enterarse (el cliente afectado, el admin, o un email directo). El template base trae poca notificación de este tipo; es el gancho para cuando un dominio derivado agregue vencimientos, SLA, recordatorios, etc.

### Resumen del criterio

> Notifica cuando el evento le importe a alguien como hecho personal/operativo. **Interno siempre; correo/push por sensibilidad.** Cliente → al propio cliente. Admin → interno del admin, **y además** al cliente si la acción le concierne (doble notificación). Sin cuenta → `crearNotificacionDirecta`. Reads/listados → **no** notifican.

## Arquitectura de archivos

```
modules/schemas/notification/
  models/        notification-category / notification-type / notification / global-notification
                 global-notification-read / user-push-token / verification-code / sms-delivery-attempt
  services/      notification-creation*  ← ENTRADA
                 notification-sending / email-notification / push-notification / sms
                 notification-scheduler / notification-rate-limit / notification-retry
                 notification-batch / notification-cleanup / email-suppression
  workers/       notification-worker.js (5 cron jobs)
  utils/         notification-content.util.js (render {{var}}) / notification-emitter.util.js (SSE)
  repositories/  notification-category / notification-type / notification / global-notification / user-push-token

modules/admin/notification/          CRUD admin de categorías y tipos + panel de entregas/reintentos
modules/shared-endpoints/kyc/person/ endpoints de preferencias del usuario (global + por categoría)
```

Preferencias por usuario: tabla `user_notification_preferences` (modelo en `schemas/kyc/`), atadas a la
**categoría** (`notification_category_code`, `null` = global).

## API — `NotificationCreationService`

### `crearNotificacion(data, transaction = null)`

```js
const NotificationCreationService = require('../../../schemas/notification/services/notification-creation.service');
const { notifications } = require('../../../../shared/constants');

setImmediate(() => {
  NotificationCreationService.crearNotificacion({
    tipoNotificacion: 'IAM_ADMIN_ROLE_CHANGED', // code del NotificationType (requerido)
    userId: user.user_id, // null => notificación GLOBAL a todos los activos
    relatedEntity: { type: 'User', id: user.user_id }, // ⚠️ OBJETO { type, id } — no un string
    metadata: { nombre: 'Ana', nuevoRol: 'AUDITOR', logoUrl: notifications.ses.logoUrl }
  }).catch(err => logger.error('Error notificando', { error: err.message }));
});
```

- **`tipoNotificacion`** (req): `code` del tipo.
- **`userId`** (opcional): si `null` → **notificación global** (inserta en `global_notifications`, llega a todos los usuarios activos). Cuidado: es masivo.
- **`relatedEntity`** (opcional): `{ type, id }`. Se persiste en `related_entity_type` / `related_entity_id`. (Algunos casos legacy pasan un string; la forma correcta es el objeto.)
- **`metadata`** (opcional): valores que reemplazan los `{{placeholders}}` de los templates. Pasar **todas** las variables que usan los templates o saldrán literales.
- **`transaction`** (opcional): para crear la notificación dentro de una transacción Sequelize.

Internamente: valida el code, busca el `NotificationType`, renderiza `title/body` (+ email subject/body) con `notification-content.util`, persiste y dispara el envío con `setImmediate`. Retorna `{ estado_solicitud, message }` + **una sola** de las dos
ids, según el caso: `notification_id` (individual) o `global_notification_id` (global) — son mutuamente excluyentes.

### `crearNotificacionDirecta({ tipoNotificacion, email, metadata })`

Email directo a un destinatario **sin userId** (no persiste en BD, no respeta quiet hours). Para: acuse de PQRS/contacto a alguien sin cuenta, confirmación de cuenta eliminada, avisos a un email administrativo/externo.

### Emails con adjuntos (PDF, etc.)

Los adjuntos son **ortogonales al diseño**: el layout de la categoría es el mismo lleve o no adjunto. Como
el adjunto suele ser específico del usuario y del momento (un comprobante, un estado de cuenta), **viaja en
`metadata.attachments`** y `enviarNotificacion` lo detecta automáticamente — no hay que marcar nada en el tipo:

```js
// El adjunto va en la metadata de la notificación. content = Buffer o string ya en base64.
setImmediate(() => {
  NotificationCreationService.crearNotificacion({
    tipoNotificacion: 'COMPROBANTE_TRANSFERENCIA',
    userId: user.user_id,
    metadata: {
      nombre: 'Ana',
      attachments: [{ filename: 'comprobante.pdf', contentType: 'application/pdf', content: pdfBuffer }]
    }
  }).catch(err => logger.error('Error notificando', { error: err.message }));
});
```

- Si `metadata.attachments` trae adjuntos válidos, `enviarNotificacion` usa `enviarEmailConAdjuntos` →
  `SendRawEmailCommand` (MIME multipart/mixed, cuerpo + adjuntos en base64, límite 10 MB de SES, respeta la
  suppression list). Si no hay adjuntos, usa `enviarEmail` → `SendEmailCommand` (envío simple de siempre).
- Cada adjunto es `{ filename, contentType, content }` donde `content` es un `Buffer` o un string ya en base64
  (una metadata JSON no puede transportar un Buffer). Los inválidos (sin `filename` o sin contenido) se descartan.
- `enviarEmailConPdf(destinatario, asunto, html, pdfBuffer, filename)` sigue existiendo como wrapper
  retrocompatible (un solo PDF) — por dentro delega en `enviarEmailConAdjuntos`.
- Extensión futura marcada en el código: soportar `url` en el adjunto (descargar el binario antes de adjuntar).

## Modelo `NotificationCategory` — campos (fuente de verdad)

| Campo                                                 | Notas                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `code` STRING UNIQUE                                  | Identificador de la categoría (ej: `SECURITY`, `ACCOUNT`, `TRANSACTIONAL`)                      |
| `name`, `description`                                 | Legibles                                                                                        |
| `supports_push` / `supports_email` / `supports_sms`   | **Canales habilitados** — mandan sobre el envío de todos los tipos de la categoría              |
| `allow_dnd`                                            | `false` → el usuario NO puede silenciar la categoría (se ignora su quiet hours)                 |
| `is_critical`                                          | `true` → emergencia: ignora quiet hours y no es silenciable                                     |
| `default_quiet_hours_start` / `_end`                  | Quiet hours por defecto de la categoría                                                         |
| `priority`                                            | `low \| normal \| high \| urgent`                                                              |
| `email_layout_template`                               | Cascarón HTML del email con `{{content}}` donde se inyecta el `email_body_template` del tipo    |
| `sort_order`, `is_active`                             | Orden de presentación / habilitación                                                            |

## Modelo `NotificationType` — campos (contenido del evento)

| Campo                                            | Notas                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `code` STRING UNIQUE                             | Identificador usado en `crearNotificacion()`                                                    |
| `notification_category_id`                       | **Categoría a la que pertenece** — de ahí salen canales, DND y layout de email                 |
| `name`, `description`                            | Legibles                                                                                        |
| `priority`                                       | `low \| normal \| high \| urgent` (la categoría puede elevarla)                                 |
| `title_template` / `body_template`               | Push / in-app, con `{{variable}}`                                                               |
| `email_subject_template` / `email_body_template` | Email (HTML) — el `email_body_template` es el **fragmento** que se inyecta en el layout          |
| `is_active`                                      | Habilita/deshabilita el tipo                                                                     |

> Los canales (`supports_*`) y la criticidad (`is_critical`) **ya no viven en el tipo**: subieron a la categoría.

## Workers — cron jobs (`notification-worker.js`)

| Cron           | Frecuencia  | Qué hace                                       |
| -------------- | ----------- | ---------------------------------------------- |
| `*/5 * * * *`  | cada 5 min  | procesa notificaciones diferidas (quiet hours) |
| `*/10 * * * *` | cada 10 min | reintenta push fallidos                        |
| `*/15 * * * *` | cada 15 min | reintenta email fallidos                       |
| `5-59/15 * * * *` | cada 15 min (offset :05) | reintenta SMS fallidos              |
| `0 3 * * *`    | 3 AM diario | limpia notificaciones antiguas (retención)     |
| `0 4 * * *`    | 4 AM diario | limpia códigos de verificación (OTP) expirados |

Reintentos: máx 3 por canal, con backoff (columnas `push_retry_count`/`push_next_retry_at`, `email_*`, `sms_*`).
El retry de SMS corre en un cron aparte con offset `:05/:20/:35/:50` para no colisionar con push/email.

## Comportamiento automático

- **Quiet hours:** si el usuario configuró `quiet_hours_start`/`quiet_hours_end` (TIME), la notificación se difiere hasta el fin de la ventana. Soporta rangos que cruzan medianoche (`start > end` → `now >= start || now < end`). Si ambos son null → se envía de inmediato. **Una categoría crítica (`is_critical`) o no-silenciable (`allow_dnd=false`) ignora el quiet hours del usuario.**
- **Preferencias:** `user_notification_preferences` atadas a `notification_category_code` (o `null` = **preferencia global** que aplica a todas las categorías sin override) con `allow_push` / `allow_email` / `allow_sms` + quiet hours. Resolución en envío: override de la categoría → preferencia global → default. El usuario las gestiona vía `GET/PUT /person/notifications/preferences[/global|/category/:code]` y `GET /person/notifications/preferences/categories` (categorías activas con la preferencia efectiva ya resuelta).
- **Rate limiting:** SNS ~300/min, SES ~200/min (clave Redis por minuto; espera graceful al límite).
- **SSE (contador de no leídas):** `notification-emitter.util.js` transporta `count-updated` (Redis Pub/Sub, fallback EventEmitter local; se inicializa en `BaseServer.afterInfraReady()`); el stream es `GET /notification/notifications/count/stream` (`notification.controller.js`). El punto único de refresco es `notification-count.util.js` (`emitCountUpdate(userId)`), invocado vía `setImmediate` en cada flujo que altera el contador: crear notificación individual (`notification-creation.service.js`), marcar leídas al listar personal/global/mixto (`notification.service.js`), además del emit propio de `getUnreadCount`. La **notificación global** (1 fila para todos) no hace fan-out por usuario: publica un broadcast `{ global: true }` y cada conexión SSE abierta recalcula su propio count (`computeUnreadCount`, sin re-emitir ni auditar). **Auth por cookie** (`access_token`, canal web): el front abre el stream con `fetch` + `credentials:'include'` (no `EventSource` nativo, que no puede mandar la cookie cross-site). **Heartbeat:** el stream emite un comentario SSE `: ping` cada 25 s (`SSE_HEARTBEAT_MS`) para que el idle timeout del reverse proxy (ALB/nginx, ~60 s) no cierre la conexión en periodos sin eventos y congele el contador; se limpia en `req.on('close')` junto con el listener.

## Entrega crítica (`is_critical`) y reenvío manual del admin

`notification_categories.is_critical` (BOOLEAN, default `false`) marca las **categorías** cuya **entrega al destinatario es materialmente importante**: si el envío por canal externo falla, el admin DEBE poder reintentarlo. Una categoría "solo interna" (sin canal externo) nunca es crítica — no hay entrega que reintentar. (La criticidad subió del tipo a la categoría en el refactor de categorías; cada tipo hereda la de su categoría.)

- **No cambia el envío.** `is_critical` NO afecta cómo ni por dónde se envía; el envío sigue gateado por `supports_email`/`supports_push`/`supports_sms` de la categoría + preferencias. Además, una categoría crítica **ignora el quiet hours** del usuario (entrega inmediata) y **no es silenciable**.
- **Filtro del panel de entregas.** El panel admin de entregas acepta `onlyCritical=true`, que hace un INNER JOIN sobre la categoría con `is_critical=true` para listar solo las entregas críticas (típicamente las que fallaron).
- **Criterio de marcado.** Crítico = identidad, seguridad de acceso, OTP/recuperación de cuenta, cambios sensibles de cuenta. NO crítico = informativos (si el correo de bienvenida falla, no amerita reintento manual). Se define a nivel categoría en el seeder de categorías.

### Reenvío manual (`AdminNotificationDeliveryService.retry`)

`modules/admin/notification/services/admin-notification-delivery.service.js`:

- Rechaza reintentar si la notificación ya está `COMPLETED` (entregada en todos los canales) o si no hay canal con error **reintentable** pendiente.
- `_resolverCanal()` decide qué canal reintentar según lo que **realmente falló y sigue siendo reintentable** (ver _Reintentable vs no reintentable_ abajo); pedir `'all'` solo reintenta los canales reintentables que fallaron.
- **Resetea el MISMO registro** (`resetForRetry`), no crea uno nuevo, y **reenvía de inmediato ignorando quiet hours** (override explícito del admin).
- Audita `NOTIFICATION_DELIVERY_RETRY_REQUESTED` y emite además una notificación interna `NOTIFICATION_RETRY_REQUESTED` al admin que lo solicitó.

> Relación con la retención automática: los workers de retry (push cada 10 min, email y SMS cada 15 min, máx 3 con backoff — ver "Workers") cubren el reintento **automático**. El reenvío de esta sección es la palanca **manual** del admin para cuando esos reintentos se agotaron y la entrega es crítica.

### Métricas de entrega (% de éxito)

`GET /api/v1/notification/notification-delivery/metrics?from&to&userId` (RBAC `notificationResend` + READ).
Devuelve agregados sobre la tabla `notifications` (no sobre `integration_api_logs`, que es nivel proveedor):

- `total` y `byStatus` (completed / partial_failure / failed / pending / processing).
- `byChannel` para email, push y SMS: `{ attempted, sent, failed, successRate }`. `successRate = sent /
  attempted` (0-100, 2 decimales; `null` si no hubo intentos — no se infla el fallo con canales que no
  aplicaban). "Intentado" = enviado OK o con error registrado.
- `byCategory`: las mismas métricas desglosadas por categoría de notificación.

Implementación: `notification.repository.deliveryMetrics()` (`COUNT(*) FILTER (WHERE ...)` agrupado por
categoría) → `NotificationDeliveryMetricsDTO` (calcula overall + tasas). Es la vista de **negocio**
("¿de lo que intenté, cuánto llegó?"); la vista de **proveedor** ("¿AWS aceptó mis llamadas?") es el
dashboard de `integration_api_logs`.

### Reintentable vs no reintentable (hard bounce) — cómo se diferencia

Sólo las notificaciones **por canal externo** (email/push) pueden fallar: el canal interno (in-app) nunca falla, así que no hay nada que reintentar ahí. De los fallos externos, **no todos son reintentables**. La diferencia se decide leyendo, por canal, dos columnas de la fila de `notifications` (`email_*` / `push_*`):

| Situación                                         | `*_error` | `*_next_retry_at` | ¿Reintentable?                           |
| ------------------------------------------------- | --------- | ----------------- | ---------------------------------------- |
| Fallo temporal pendiente (lo toma el worker auto) | seteado   | fecha futura      | ✅ sí                                    |
| Temporal con reintentos auto agotados (≥3)        | seteado   | fecha             | ✅ sí — **vía reenvío manual del admin** |
| **Hard bounce** (buzón/endpoint muerto)           | seteado   | **`null`**        | ❌ **no**                                |
| Nunca intentado / reseteado                       | `null`    | `null`            | n/a                                      |

- **Cómo se detecta el hard bounce.** Un fallo es _hard bounce_ cuando AWS devuelve un `error_code` terminal (email: `MessageRejected`/`InvalidParameterValue`/`AccountSendingPausedException`; push: `EndpointDisabled`/`InvalidParameter` — catálogo en `shared/constants/aws-error-codes.js`, `isHardBounce(channel, code)`). El worker de reintentos (`notification-retry.service`) lo lee del **último log de integración** de esa notificación, correlacionado por `integration_api_logs.notification_id` (que las utils SES/SNS rellenan en la fila `product='ses'`/`'sns'`). Al detectarlo, **cierra el canal** con `markEmail/PushPermanentFailure`, que deja `*_error` seteado y **`*_next_retry_at = null`**.
- **Señal canónica del cierre.** `*_error != null && *_next_retry_at === null` ⇒ hard bounce, no reintentable. Es inequívoco porque `resetForRetry` y el estado inicial dejan `*_error = null`; un temporal agotado conserva **fecha** en `*_next_retry_at`, por eso **sí** se puede reenviar manualmente.
- **Ambos caminos respetan la misma señal.** El worker automático deja de seleccionar el canal cerrado (`findPending*Retries` filtra `*_next_retry_at <= now`; `null` no matchea). El reenvío manual del admin aplica la misma regla en `_resolverCanal()`: si los canales con error son hard bounce, devuelve `null` y `retry()` responde `400 'No hay canales con error pendiente de reintento…'`. Así el admin **no** puede reintentar en loop un buzón/endpoint muerto, pero **sí** puede reenviar fallos temporales agotados.

> **Aclaración (`notification_id` correlaciona el envío, no la integración de negocio).** La columna
> `integration_api_logs.notification_id` correlaciona la llamada **SES/SNS** (el envío) con la notificación
> que entregaba. Cualquier integración de negocio que agregue un proyecto derivado (con su propio `product`)
> tendrá `notification_id = null`: esas llamadas no son envíos de correo/push. Si una de esas integraciones
> dispara además una notificación por correo, su reintento se rige por esta misma maquinaria genérica, sin
> nada específico por dominio.

## Seeder de tipos

Un seeder por módulo (`seeders/<ts>-notification-types-{modulo}.js`). Los seeders quedan **registrados en la
tabla `SequelizeData`** (`seederStorage: 'sequelize'` en `config/database.js`): `db:seed:all` ejecuta cada
seeder **una sola vez** y **no lo relanza** una vez registrado.

**Para agregar o modificar un tipo se edita el seeder ORIGINAL del módulo** (y el esquema, la migración
original) y el dev corre `db:reset` — es la convención vigente del repo. El `DELETE por code` + `bulkInsert`
dentro del `up` de cada seeder es la salvaguarda de idempotencia que lo hace seguro.

Las **categorías** se siembran en `seeders/<ts>-notification-categories.js` (incluye el `email_layout_template`
por categoría) y la asignación tipo→categoría en `seeders/<ts>-assign-notification-types-to-categories.js`
(mapeo por `code`, editable después desde el admin con `PATCH /notification-types/:id { notificationCategoryId }`).

```js
const { database } = require('../shared/constants');
const { v4: uuidv4 } = require('uuid');
const SCHEMA = database.schema;
const TABLE = { tableName: 'notification_types', schema: SCHEMA };
const ALL_CODES = ['EVENTO_A', 'EVENTO_B'];
const allTypes = [
  /* { notification_type_id: uuidv4(), code, name, ..., title_template, body_template,
                        email_subject_template, email_body_template, created_at, updated_at } */
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM "${SCHEMA}"."notification_types" WHERE code IN (${ALL_CODES.map(c => `'${c}'`).join(',')})`
    );
    await queryInterface.bulkInsert(TABLE, allTypes);
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete(TABLE, { code: ALL_CODES });
  }
};
```

## Reglas

- ❌ Nunca instanciar `SESClient`/`SNSClient` directo — usar `EmailNotificationService` / `PushNotificationService`.
- ❌ Nunca `await crearNotificacion()` en el flujo principal — siempre `setImmediate(() => ...).catch(...)`.
- ✅ Siempre crear el tipo en un seeder **nuevo** (no editar/re-correr uno ya aplicado) — no hardcodear templates.
- ✅ Los tipos se consultan por `code`, nunca por id.
- ✅ `relatedEntity` es `{ type, id }`.
