# Principios SOLID en la plantilla

> Qué principio se aplica, **dónde** está en el código y **cómo** seguirlo al crear un feature nuevo.
> La arquitectura sigue siendo **modular por capas** (`routes → controllers → services → repositories → models`).
> SOLID no cambia esa arquitectura: la deja lista para migrar a hexagonal/clean si el dominio lo pide
> (ver [§ Camino a hexagonal](#camino-a-hexagonal)).

| Principio | Idea en una línea | Dónde se ve en la plantilla |
|---|---|---|
| **S** — Single Responsibility | Una clase, una razón de cambio | Fachadas `auth-login/`, `auth-register/`, `mfa/`, `admin-user/`, `admin-person/`; servicios compartidos de sesión y política |
| **O** — Open/Closed | Extender sin modificar | Canales de notificación como descriptores |
| **L** — Liskov Substitution | Un hijo sirve donde se espera al padre | `ReadRepository` / `BaseRepository` / `AppendOnlyRepository` (todos los repos) |
| **I** — Interface Segregation | No depender de métodos que no usas | Repos con métodos de negocio; jerarquía de repos |
| **D** — Dependency Inversion | Depender de abstracciones inyectadas | `constructor(deps = {})`, `UnitOfWork`, cero `Op`/modelos/`include` en la capa de aplicación |

Las reglas se **verifican automáticamente** en `tests/unit/guards/solid-architecture.test.ts`
(ver [§ Cómo se verifica](#cómo-se-verifica)).

---

## S — Single Responsibility

**Antes:** `auth-login.service.ts` tenía ~1600 líneas (login, MFA, refresh, logout, dispositivos,
sesiones) y `admin-person.service.ts` ~1000. Cualquier cambio en sesiones obligaba a tocar el archivo del login.

**Ahora:** cada responsabilidad vive en su propio service y el original queda como **fachada**:

```
modules/shared-endpoints/kyc/iam/services/
├── auth-login.service.ts                 ← fachada: flujo de login + delegación
└── auth-login/
    ├── token-refresh.service.ts          ← rotación de refresh / reuse attack
    ├── auth-logout.service.ts            ← logout / logoutAll
    ├── trusted-device-management.service.ts
    ├── session-control.service.ts        ← cierre selectivo y límite de sesiones
    ├── login-device.service.ts           ← dispositivo durante el login
    ├── sms-login-challenge.service.ts    ← MFA por SMS en el login
    ├── login-policy-gate.service.ts      ← política de privacidad al iniciar sesión (también biométrico)
    └── session-issuer.service.ts         ← tokens + JTI + user_session (también biométrico y registro)

modules/shared-endpoints/kyc/iam/services/
├── mfa.service.ts                        ← fachada: estado, método preferido, validar contraseña
└── mfa/
    ├── totp-mfa.service.ts               ← setup / activación / verificación / baja TOTP
    ├── sms-mfa.service.ts                ← código de activación / confirmación / baja SMS
    └── mfa-account.ts                    ← lecturas del usuario + bitácora de cambios de MFA

modules/client/kyc/iam/services/
├── auth-register.service.ts              ← registro (crea persona/contacto/usuario/consentimientos)
├── auth-register/
│   └── credential-reset.service.ts       ← reset de contraseña / MFA por enlace de un solo uso
└── auth-biometric.service.ts             ← enrolamiento + login biométrico (delegando sesión,
                                            política y criptografía en servicios compartidos)

modules/admin/kyc/person/services/
├── admin-person.service.ts               ← fachada: eliminación de cuenta + delegación
└── admin-person/
    ├── person-query.service.ts
    ├── person-creation.service.ts
    ├── person-access.service.ts          ← activar/desactivar, rol
    ├── person-credentials.service.ts     ← contraseña, email, documento, MFA
    └── person-guards.ts                  ← regla "cuenta eliminada es intocable"

modules/admin/kyc/iam/services/
├── admin-user.service.ts                 ← fachada (usuarios internos)
└── admin-user/
    ├── internal-user-query.service.ts    ← listados, detalle, roles, sesiones, bitácora
    ├── internal-user-profile.service.ts  ← alta y edición
    ├── internal-user-access.service.ts   ← rol (doble aprobación), estado, cierre de sesiones
    ├── internal-user-deletion.service.ts ← eliminación (re-auth + doble aprobación + ofuscación)
    └── internal-user-guards.ts           ← interno / superadmin / eliminado / invalidar sesiones

modules/schemas/core/services/
├── dual-approval.service.ts              ← motor: register / gate / resolve
└── dual-approval/
    └── dual-approval-notifier.service.ts ← avisos a aprobadores y al solicitante

shared/utils/es256-signature.util.ts      ← verificación ES256 (pura), extraída de auth-biometric
modules/schemas/kyc/person/helpers/profile.helper.ts ← clase ProfileHelper con constructor(deps)
```

La fachada mantiene **la misma API pública**, así controllers y tests no cambian:

```js
// auth-login.service.ts
refreshToken(refreshTokenStr) {
  return this.tokenRefresh.refreshToken(refreshTokenStr);
}
```

También se eliminó lógica **duplicada** entre los tres flujos de autenticación
(contraseña, biométrico, registro):

| Lógica | Estaba copiada en | Ahora vive en |
|---|---|---|
| Registro de consentimientos | `auth-login`, `auth-register`, `auth-biometric` | `schemas/records/legal/services/consent-recorder.service.ts` |
| Una sesión por dispositivo + límite de sesiones | `auth-login`, `auth-biometric` | `auth-login/session-control.service.ts` |
| Emisión de tokens + sesión | `auth-login`, `auth-biometric`, `auth-register` | `auth-login/session-issuer.service.ts` |
| Compuerta de política de privacidad | `auth-login`, `auth-biometric` | `auth-login/login-policy-gate.service.ts` |

**Regla práctica:** si un service supera ~400 líneas o su nombre necesita un "y" para describirlo
("login **y** sesiones **y** dispositivos"), se divide.

---

## O — Open/Closed

**Antes:** `notification-sending.service.ts` repetía en tres lugares:

```js
if (category?.supports_push ?? true) { ... }
if (category?.supports_email ?? true) { ... }
if (category?.supports_sms ?? false) { ... }
```

Agregar WhatsApp obligaba a modificar los tres bloques.

**Ahora:** cada canal es un **descriptor** y el service los recorre:

```js
{
  key: 'sms',                 // define sms_sent / sms_error, supports_sms, allow_sms
  supportedByDefault: false,
  send: ctx => this.enviarSmsIndividual(ctx.userId, ctx.body, ctx.metadata, ctx.notificationId),
  schedule: ctx => this.schedulerService.programarEnvioSms(ctx.notificationId, ctx.userPreference)
}
```

Agregar un canal = sumar un descriptor en `_defaultChannels()` (o inyectarlo con `deps.channels`).
El envío inicial, el reenvío programado y el cálculo de estado (`completed` / `partial_failure` /
`failed`) no se tocan. Hay un test con un canal WhatsApp de ejemplo.

Otro ejemplo que ya existía: el `ENTITY_REGISTRY` de `admin-session-trace.service.ts`.

---

## L — Liskov Substitution

**Antes:** `AuditLogRepository extends BaseRepository` y sobrescribía `update()` / `delete()` para
**lanzar error** (la tabla es append-only). Si alguien recibía "un BaseRepository" y llamaba
`delete`, explotaba: el hijo no podía reemplazar al padre.

**Ahora** la jerarquía separa capacidades:

```
ReadRepository              → findById, findAll, findByIds, findAllPaginated, count...
├── BaseRepository          → + create, update, delete, bulkCreate/Update/Delete
└── AppendOnlyRepository    → + create, bulkCreate          (audit_logs)
```

`AuditLogRepository extends AppendOnlyRepository`: `update`/`delete` simplemente no existen.

También se corrigieron overrides que **cambiaban la firma** del padre: varios
`delete(id)` y `findById(id)` ignoraban el parámetro `options`, así que una llamada con
`{ transaction }` se ejecutaba **fuera** de la transacción sin avisar. Ahora todos aceptan y
propagan `options`, igual que la clase base.

`RolePermissionOverrideRepository` era el único repositorio fuera de la jerarquía y definía
`exists(roleName, moduleName, action)`, incompatible con `ReadRepository.exists(criteria)`. Ahora
hereda de `BaseRepository` y la verificación de duplicados se llama `existsOverride(...)`.

**Regla práctica:** un override debe aceptar los mismos argumentos que el padre y no lanzar
errores que el padre no lanza. Si un hijo "no puede" hacer algo del padre, la jerarquía está mal.
Si necesitas otra semántica, usa otro nombre en vez de redefinir el método del padre.

---

## I — Interface Segregation

1. **Jerarquía de repositorios** (arriba): un repo de solo inserción no carga con `update`/`delete`.
2. **Métodos con nombre de negocio** en vez de un `findAll(where)` genérico que obliga al service a
   saber de Sequelize:

| Antes (en el service) | Ahora |
|---|---|
| `roleRepository.findAll({ name: { [Op.in]: CLIENT_ROLE_NAMES } })` | `roleRepository.findByNames(CLIENT_ROLE_NAMES)` |
| `{ name: { [Op.in]: A, [Op.notIn]: B } }` | `roleRepository.findByNames(A, { exclude: B })` |
| `repo.findAll({ [pk]: { [Op.in]: ids } })` | `repo.findByIds(ids, pk)` |
| `bulkUpdate(..., { notification_id: { [Op.in]: ids } })` | `notificationRepository.markAsReadByIds(ids)` |
| `_buildWhere(query)` con `Op.gte` / `Op.lte` | `auditLogRepository.searchPaginated(query, ...)` |
| `{ created_at: { [Op.between]: [from, to] } }` | `auditLogRepository.findAuthAttemptsPaginated(criteria, ...)` |
| `include: [{ model: UserTrustedDevice, as: 'device' }, { model: User, ... }]` | `userSessionRepository.findPaginatedWithDeviceAndUser(where, pagination)` |
| `_includeExecutor()` con `model: User` / `model: Person` | inclusión por defecto de `auditLogRepository.searchPaginated` / `findByIdFull` |
| `findByEmail(email, { include: [...] })` en el reset | `personContactRepository.findByEmailWithUser(email)` |

---

## D — Dependency Inversion

### 1. Inyección por constructor

Todos los services de clase reciben sus dependencias volátiles (repositorios, otros services,
storage, transacciones) por constructor, con la implementación real como default:

```js
class PersonReferenceService {
  constructor(deps = {}) {
    this.personReferenceRepository = deps.personReferenceRepository ?? personReferenceRepository;
  }

  async list(personId, userId) {
    const references = await this.personReferenceRepository.findAllByPersonId(personId); // ← this., no el import
    // ...
  }
}

module.exports = new PersonReferenceService();                    // instancia por defecto (controllers)
module.exports.PersonReferenceService = PersonReferenceService;   // clase (tests, composición)
```

Eso permite testear **sin `jest.mock`**:

```js
const { PersonReferenceService } = require('.../person-reference.service');
const service = new PersonReferenceService({ personReferenceRepository: { findAllByPersonId: jest.fn() } });
```

Ejemplos reales: `consent-recorder.service.test.ts`, `unit-of-work.test.ts` y el bloque
"canales extensibles" de `notification-sending.service.test.ts`.

> Nota: los utils puros o transversales (`AppError`, `logger`, `PaginationHelper`, DTOs) se siguen
> importando directo. DIP apunta a las dependencias que **cambian o tocan infraestructura**.

### 2. Unit of Work

Los services ya no llaman `sequelize.transaction()`. Usan el puerto `shared/database/unit-of-work.ts`:

```js
const transaction = await this.unitOfWork.begin();
try {
  await this.userRepository.update(id, data, { transaction });
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}

// o en modo gestionado:
await this.unitOfWork.run(async transaction => { ... });
```

### 3. La capa de aplicación no conoce el ORM

Services, helpers, validators, controllers, middlewares y utils **no** importan `sequelize`, `Op`
ni modelos:

- **Consultas e `include`** → métodos con nombre de negocio en el repositorio (tabla de § I).
- **Enums de dominio** → `shared/constants/domain-enums.ts` (`NOTIFICATION_PROCESSING_STATUS`,
  `APPROVAL_REQUEST_STATUS`, `USER_SESSION_STATUS`, `INTEGRATION_PRODUCTS`, `INTEGRATION_RESULTS`).
  El modelo los usa para su `ENUM`, así que hay una sola fuente de verdad.
- **Código de `shared/`** que consultaba modelos (`auth.middleware`, `rbac.service`,
  `mfa-status.util`, `resilience-config.util`) ahora pasa por repositorios cargados de forma diferida.
  `require` diferido porque esos módulos se cargan al arrancar y un import directo crearía un ciclo.
- **Clientes de infraestructura** (SNS, S3) se inyectan: `new PushNotificationService({ snsClient })`,
  `new SmsService({ snsClient })`, `fileStorage` en banners.

**Excepciones deliberadas** (adaptadores de infraestructura, fuera de la regla):

| Dónde | Por qué |
|---|---|
| `shared/utils/logger.util.ts`, `integration-api-logger.util.ts` | Escriben los logs; todo el sistema depende del logger, así que no pueden depender de repositorios. |
| `audit-archive.worker.ts` | Mueve lotes de `audit_logs` a la tabla de archivo con SQL y una transacción propios (operación de mantenimiento, no lógica de negocio). |
| `shared/base/*`, `servers/*`, `*.bootstrap.ts` | Arranque y composición. |

---

## Checklist para un feature nuevo

- [ ] El service recibe repos/colaboradores por `constructor(deps = {})` y los usa vía `this.`.
- [ ] Exporta la instancia **y** la clase.
- [ ] No importa `sequelize`, `Op` ni modelos: si necesitas un filtro o un `include`, agrega un
      método con nombre de negocio al repositorio.
- [ ] Enums (estados, catálogos) desde `shared/constants/domain-enums.ts`, no desde el modelo.
- [ ] Nada de `instance.update(...)` sobre lo que devolvió un repositorio: `repo.update(id, data, { transaction })`.
- [ ] Transacciones con `this.unitOfWork`.
- [ ] El repositorio hereda de `BaseRepository`, o de `AppendOnlyRepository` / `ReadRepository` si
      la tabla no admite todas las operaciones. Overrides con la misma firma que el padre.
- [ ] Si el service crece y mezcla responsabilidades, se divide y el original queda como fachada.
- [ ] Antes de copiar lógica de otro flujo, revisa si ya hay un servicio compartido
      (`session-issuer`, `session-control`, `login-policy-gate`, `consent-recorder`).
- [ ] Variantes que van a crecer (canales, proveedores, tipos) → registro/estrategia, no `if` encadenados.
- [ ] `npm test` en verde, incluida la guarda `tests/unit/guards/solid-architecture.test.ts`.

Las plantillas de código actualizadas están en [`implementation-patterns.md`](implementation-patterns.md).

---

## Cómo se verifica

`tests/unit/guards/solid-architecture.test.ts` analiza el código fuente (sin cargarlo) y falla si:

| Regla | Principio |
|---|---|
| Un service / helper / validator / controller / middleware / util importa modelos | D |
| La capa de aplicación importa `sequelize` o usa `Op.*` | I / D |
| Un service arma `include` con `model: X` | D |
| Un repositorio no hereda de `ReadRepository` / `BaseRepository` / `AppendOnlyRepository` | L |
| Un service exporta la instancia sin exportar también la clase | D |
| Un service importa repositorios sin recibirlos por `constructor(deps = {})` | D |

Si falla, la corrección casi siempre es mover la consulta, el enum o el `include` a su lugar. No se
arregla ampliando el allowlist del test, que solo contiene las excepciones de la tabla de § D.

Lo que la guarda **no** puede medir (y queda a criterio de revisión): si un service mezcla
responsabilidades. Como referencia, ninguno pasa de ~600 líneas y los que superan 400
(`auth-login`, `auth-biometric`, `dual-approval`, `profile`, `auth-register`, `person-credentials`,
`notification-sending`) tienen una sola razón de cambio.

---

## Camino a hexagonal

Con lo anterior, pasar a hexagonal es sobre todo **mover y renombrar**:

| Hoy (capas + SOLID) | Hexagonal |
|---|---|
| Sub-services de una fachada (`token-refresh.service.ts`) | `application/use-cases/` |
| Contrato implícito del repositorio (`findByNames`, `findActive`) | `domain/ports/*.ts` (interfaces) |
| Repositorios Sequelize | `infrastructure/adapters/sequelize/` |
| `UnitOfWork` | Puerto `UnitOfWork` + adaptador Sequelize (ya está separado) |
| `module.exports = new X()` con defaults | *Composition root* que arma todo en un solo lugar |

Lo que faltaría: definir los puertos de forma explícita (en TypeScript serían `interface`) y
crear el composition root. Los `include` ya viven en los repositorios.
