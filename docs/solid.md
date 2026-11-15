# Principios SOLID en la plantilla

> Qué principio se aplica, **dónde** está en el código y **cómo** seguirlo al crear un feature nuevo.
> La arquitectura sigue siendo **modular por capas** (`routes → controllers → services → repositories → models`).
> SOLID no cambia esa arquitectura: la deja lista para migrar a hexagonal/clean si el dominio lo pide
> (ver [§ Camino a hexagonal](#camino-a-hexagonal)).

| Principio | Idea en una línea | Dónde se ve en la plantilla |
|---|---|---|
| **S** — Single Responsibility | Una clase, una razón de cambio | `auth-login/`, `admin-person/`, `ConsentRecorderService` |
| **O** — Open/Closed | Extender sin modificar | Canales de notificación como descriptores |
| **L** — Liskov Substitution | Un hijo sirve donde se espera al padre | `ReadRepository` / `BaseRepository` / `AppendOnlyRepository` |
| **I** — Interface Segregation | No depender de métodos que no usas | Repos con métodos de negocio; jerarquía de repos |
| **D** — Dependency Inversion | Depender de abstracciones inyectadas | `constructor(deps = {})`, `UnitOfWork`, cero `Op` en services |

---

## S — Single Responsibility

**Antes:** `auth-login.service.js` tenía ~1600 líneas (login, MFA, refresh, logout, dispositivos,
sesiones) y `admin-person.service.js` ~1000. Cualquier cambio en sesiones obligaba a tocar el archivo del login.

**Ahora:** cada responsabilidad vive en su propio service y el original queda como **fachada**:

```
modules/shared-endpoints/kyc/iam/services/
├── auth-login.service.js                 ← fachada: flujo de login + delegación
└── auth-login/
    ├── token-refresh.service.js          ← rotación de refresh / reuse attack
    ├── auth-logout.service.js            ← logout / logoutAll
    ├── trusted-device-management.service.js
    ├── session-control.service.js        ← cierre selectivo y límite de sesiones
    ├── login-device.service.js           ← dispositivo durante el login
    └── sms-login-challenge.service.js    ← MFA por SMS

modules/admin/kyc/person/services/
├── admin-person.service.js               ← fachada: eliminación de cuenta + delegación
└── admin-person/
    ├── person-query.service.js
    ├── person-creation.service.js
    ├── person-access.service.js          ← activar/desactivar, rol
    ├── person-credentials.service.js     ← contraseña, email, documento, MFA
    └── person-guards.js                  ← regla "cuenta eliminada es intocable"
```

La fachada mantiene **la misma API pública**, así controllers y tests no cambian:

```js
// auth-login.service.js
refreshToken(refreshTokenStr) {
  return this.tokenRefresh.refreshToken(refreshTokenStr);
}
```

También se eliminó lógica **duplicada**: el registro de consentimientos estaba copiado en
`auth-login`, `auth-register` y `auth-biometric`. Ahora vive en
`modules/schemas/records/legal/services/consent-recorder.service.js`.

**Regla práctica:** si un service supera ~400 líneas o su nombre necesita un "y" para describirlo
("login **y** sesiones **y** dispositivos"), se divide.

---

## O — Open/Closed

**Antes:** `notification-sending.service.js` repetía en tres lugares:

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

Otro ejemplo que ya existía: el `ENTITY_REGISTRY` de `admin-session-trace.service.js`.

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

**Regla práctica:** un override debe aceptar los mismos argumentos que el padre y no lanzar
errores que el padre no lanza. Si un hijo "no puede" hacer algo del padre, la jerarquía está mal.

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

Ejemplos reales: `consent-recorder.service.test.js`, `unit-of-work.test.js` y el bloque
"canales extensibles" de `notification-sending.service.test.js`.

> Nota: los utils puros o transversales (`AppError`, `logger`, `PaginationHelper`, DTOs) se siguen
> importando directo. DIP apunta a las dependencias que **cambian o tocan infraestructura**.

### 2. Unit of Work

Los services ya no llaman `sequelize.transaction()`. Usan el puerto `shared/database/unit-of-work.js`:

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

### 3. Los services no conocen el ORM

- Ningún `*.service.js` importa `sequelize` ni usa `Op`.
- `SystemGlobalConfig.findOne(...)` (modelo directo desde 4 services) → `SystemGlobalConfigRepository.findActive()`.
- S3 en banners se inyecta como `fileStorage`.

**Pendiente consciente:** algunos services todavía importan modelos para armar `include`
(`{ model: User, as: 'executor' }`) o leer enums (`Notification.PROCESSING_STATUS`). Es el
siguiente paso natural: mover esos `include` a métodos del repositorio y los enums a `shared/constants`.
Los workers (`audit-archive.worker.js`) y bootstraps usan Sequelize a propósito: son adaptadores de infraestructura.

---

## Checklist para un feature nuevo

- [ ] El service recibe repos/colaboradores por `constructor(deps = {})` y los usa vía `this.`.
- [ ] Exporta la instancia **y** la clase.
- [ ] No importa `sequelize`, `Op` ni modelos para consultar: si necesitas un filtro, agrega un
      método con nombre de negocio al repositorio.
- [ ] Transacciones con `this.unitOfWork`.
- [ ] El repositorio hereda de `BaseRepository`, o de `AppendOnlyRepository` / `ReadRepository` si
      la tabla no admite todas las operaciones. Overrides con la misma firma que el padre.
- [ ] Si el service crece y mezcla responsabilidades, se divide y el original queda como fachada.
- [ ] Variantes que van a crecer (canales, proveedores, tipos) → registro/estrategia, no `if` encadenados.

Las plantillas de código actualizadas están en [`implementation-patterns.md`](implementation-patterns.md).

---

## Camino a hexagonal

Con lo anterior, pasar a hexagonal es sobre todo **mover y renombrar**:

| Hoy (capas + SOLID) | Hexagonal |
|---|---|
| Sub-services de una fachada (`token-refresh.service.js`) | `application/use-cases/` |
| Contrato implícito del repositorio (`findByNames`, `findActive`) | `domain/ports/*.js` (interfaces) |
| Repositorios Sequelize | `infrastructure/adapters/sequelize/` |
| `UnitOfWork` | Puerto `UnitOfWork` + adaptador Sequelize (ya está separado) |
| `module.exports = new X()` con defaults | *Composition root* que arma todo en un solo lugar |

Lo que faltaría: definir los puertos de forma explícita (en TypeScript serían `interface`),
sacar los `include` de Sequelize de los services y crear el composition root.
