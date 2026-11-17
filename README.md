# Base Project — API REST (plantilla base)

> Plantilla base de API REST en Node.js para arrancar proyectos nuevos con el núcleo transversal ya
> resuelto y endurecido: **autenticación propia (JWT RS256 + sesiones), MFA, RBAC, doble aprobación
> (maker-checker), auditoría con trazabilidad por sesión, notificaciones multicanal y cifrado de PII**.
>
> Es una base **agnóstica de dominio y endurecida a nivel productivo**: trae solo la infraestructura
> transversal reutilizable, sin lógica de negocio acoplada. Al derivar un proyecto real, agregás tus
> propios módulos de dominio sobre esta base.

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v4-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-opcional-red.svg)](https://redis.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 📋 Tabla de contenidos

- [Qué incluye la base](#-qué-incluye-la-base)
- [Stack tecnológico](#️-stack-tecnológico)
- [Arquitectura](#️-arquitectura)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Modos de ejecución](#-modos-de-ejecución)
- [Requisitos previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración (.env)](#️-configuración-env)
- [Base de datos](#️-base-de-datos)
- [Uso](#-uso)
- [Flujo de un request](#-flujo-de-un-request)
- [Seguridad](#-seguridad)
- [Testing](#-testing)
- [Documentación](#-documentación)
- [Convenciones](#-convenciones)
- [Licencia](#-licencia)

---

## ✨ Qué incluye la base

Todo lo transversal que un proyecto necesita el día 1, ya construido y probado:

### 🔐 Autenticación e identidad — [`docs/auth-sessions.md`](docs/auth-sessions.md)

- **Autenticación 100% propia** (sin proveedor externo): password validado contra hash en BD +
  **JWT RS256** propios (access 15 min / refresh 24 h, rotativo con detección de _reuse attack_).
- **Sesiones** con inactividad de 15 min (deslizante) y tope absoluto de 8 h; revocación quirúrgica por
  sesión o global; fallback a BD (`user_sessions`) si Redis no está.
- **MFA propio**: TOTP (RFC 6238, `otplib`) y SMS; método preferido configurable; **opt-in**.
- **Login biométrico** challenge-response ES256 (esquema propio, no WebAuthn/FIDO2).
- **Dispositivos de confianza**, reset de credenciales por email, blocklist de dispositivos.

### 🛡️ Autorización y control — RBAC + doble aprobación

- **RBAC** por módulo/acción (`create|read|update|delete`) con matriz base + overrides en runtime.
  Detalle: [`docs/rbac/rbac.md`](docs/rbac/rbac.md).
- **Doble aprobación (maker-checker)** genérica y declarativa para acciones sensibles: la operación
  queda `202 Accepted` hasta que un segundo funcionario la aprueba.
  Detalle: [`docs/dual-approval-global.md`](docs/dual-approval-global.md).

### 📝 Auditoría, alertas y trazabilidad — [`docs/audit-and-alerts.md`](docs/audit-and-alerts.md)

- `logAudit` → rastro de auditoría append-only en BD (`audit_logs`) + S3, con `correlationId` propagado
  vía `AsyncLocalStorage`. Dispara **alertas** para acciones marcadas.
- **Trazabilidad por sesión**: cada fila de dominio se ata a su sesión de origen (`origin_session_id`,
  automático). Timeline forense de "qué hizo el usuario en la sesión".
  Detalle: [`docs/origin-session-tracking.md`](docs/origin-session-tracking.md).

### 🔔 Notificaciones multicanal — [`docs/notifications.md`](docs/notifications.md)

- Canales: **email (SES)**, **push (SNS)**, **SMS (SNS)** e **in-app**. Punto de entrada único
  (`NotificationCreationService`), templates por tipo, categorías como fuente de verdad (canales, DND,
  layout de email), preferencias por usuario, quiet hours, rate limiting y **reintentos automáticos**
  por worker (con detección de hard-bounce). Bandeja in-app con contador en vivo por **SSE**.

### 🔒 Cifrado y PII

- PII **cifrada at-rest** con AES-256-GCM + hash determinístico (HMAC) para búsqueda por igualdad.
  Detalle: [`docs/encryption-pii.md`](docs/encryption-pii.md).
- **Enmascaramiento automático** de identificadores en las respuestas de la API.
  Detalle: [`docs/pii-masking.md`](docs/pii-masking.md).

### 🏗️ Infraestructura transversal

- **Rate limiting** y **request locking** (store híbrido Redis + memoria, con fallback).
- **Idempotencia** de operaciones, **correlationId** por request de punta a punta.
- Manejo de errores centralizado (`AppError` + handler global), respuestas uniformes (`ApiResponse`).
- **Swagger/OpenAPI** autogenerado por servidor. Detalle: [`docs/swagger.md`](docs/swagger.md).
- **Workers** (cron) para expiración de sesiones, reintentos de notificación, expiración de doble
  aprobación y archivado de auditoría.
- Consentimientos / política de privacidad, configuración global del sistema, banners promocionales.

---

## 🛠️ Stack tecnológico

| Área            | Tecnologías                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| **Runtime/Web** | Node.js 24+, TypeScript (estricto), Express 4                                     |
| **Datos**       | PostgreSQL 14+, Sequelize 6, `pg`                                                 |
| **Cache/estado**| Redis (`ioredis`) — **opcional**, con fallback a memoria/BD                       |
| **Auth**        | `jose` (JWT RS256), `bcryptjs`, `otplib` (TOTP)                                   |
| **AWS**         | SES (email), SNS (push/SMS), S3 (archivos), CloudFront                            |
| **Seguridad**   | `helmet`, `cors`, `express-rate-limit`                                            |
| **Validación**  | `express-validator`                                                              |
| **Docs API**    | `swagger-ui-express`                                                              |
| **Jobs**        | `node-cron`                                                                       |
| **Media/otros** | `sharp`, `multer`, `geoip-lite`, `ua-parser-js`                                   |
| **Logging**     | `winston` + `winston-daily-rotate-file`                                           |
| **Dev/Test**    | `jest`, `supertest`, `nodemon`, `eslint`, `prettier`, `sequelize-cli`, `prisma` |

---

## 🏛️ Arquitectura

Es un **monolito modular**. La misma base de código se puede levantar como un solo proceso o partida en
servidores admin/cliente. El código se organiza en cuatro grandes zonas:

```
servers/     → entrypoints (monolith | admin | client). Todos extienden BaseServer.
modules/     → el dominio, partido por audiencia y por capa (ver abajo).
shared/      → infraestructura transversal (middlewares, utils, base classes, constantes, DTOs).
config/      → configuración de Sequelize y ensamblado de Swagger.
```

### Cómo se parten los módulos

```
modules/
  schemas/            ← CAPA DE DATOS compartida: models, repositories, workers, services de dominio.
                        No sabe de HTTP. La consumen las tres audiencias.
  admin/              ← endpoints del panel ADMIN (controllers/services/routes/dtos/validators).
  client/             ← endpoints de la app CLIENTE.
  shared-endpoints/   ← endpoints comunes a ambos (login, MFA, perfil, preferencias, campana).
```

Cada audiencia (`admin`, `client`, `shared-endpoints`) se subdivide por **dominio funcional**:
`core`, `kyc` (iam / person / maintainers), `notification`, `records` (audit / legal), `integration`.

### Flujo por capas (dentro de un request)

```
Request
  → [middlewares globales]   Correlation → Security(helmet/cors) → body-parse → auditContext → compression → httpLogger
  → [middlewares de ruta]    Auth → RBAC → RateLimit → RequestLock → Validator → AuditAction.declare
  → Controller → Service → Repository → Model → PostgreSQL
  → ApiResponse   (o AppError → handler global)
```

| Capa           | Responsabilidad                                                                  |
| -------------- | -------------------------------------------------------------------------------- |
| **Controller** | recibe `req`, llama service, devuelve `ApiResponse`. Sin lógica de negocio.       |
| **Service**    | toda la lógica; lanza `AppError`; llama `logAudit`. No accede a la BD directo.     |
| **Repository** | solo Sequelize; extiende `BaseRepository`.                                        |
| **Model**      | tabla, tipos, hooks (`afterFind` descifra PII), asociaciones.                     |
| **Validator**  | cadenas `express-validator`; extiende `BaseValidator`.                            |
| **DTO**        | transforma la respuesta a camelCase y enmascara PII. Nunca hace spread de instancias. |

Detalle del pipeline, errores y contexto: [`docs/request-flow.md`](docs/request-flow.md) ·
plantillas de código por capa: [`docs/implementation-patterns.md`](docs/implementation-patterns.md) ·
DTOs: [`docs/dtos.md`](docs/dtos.md).

---

## 📁 Estructura del proyecto

```
.
├── servers/                    # Entrypoints
│   ├── monolith.ts            # admin + client en un proceso (default)
│   ├── admin.ts               # solo admin
│   └── client.ts              # solo client
│
├── modules/
│   ├── schemas/                # Capa de datos compartida (models / repositories / workers)
│   │   ├── core/              # config global, doble aprobación, banners
│   │   ├── kyc/               # iam (auth/sesiones/mfa/rbac), person, maintainers
│   │   ├── notification/      # motor de notificaciones + workers
│   │   ├── records/           # audit, legal
│   │   └── integration/       # logs de integraciones externas
│   ├── admin/                  # Endpoints del panel admin (por dominio)
│   ├── client/                 # Endpoints de la app cliente
│   ├── shared-endpoints/       # Endpoints comunes (login, MFA, perfil, campana)
│   └── {admin,client}/app.ts   # ensamblan sus routers bajo /api/v1/{dominio}
│
├── shared/
│   ├── base/                   # BaseServer, BaseApp, BaseRepository, BaseValidator
│   ├── middlewares/            # auth, rbac, dual-approval, security, rate-limit, request-lock, audit, error…
│   ├── utils/                  # jwt, encryption, hash, redis, logger, masking, pagination, s3…
│   ├── services/               # rbac, hmac
│   ├── models/                 # index (asociaciones) + mixins (origin-session)
│   ├── constants/              # config, rbac, dual-approval, pii-fields, auditActions…
│   ├── dtos/                   # componentes DTO compartidos (audit/core/kyc/notification)
│   ├── repositories/ · validators/
│
├── config/
│   ├── config.ts · database.ts # Sequelize (aislamiento por esquema)
│   ├── swagger.admin.ts · swagger.client.ts
│   └── swagger/                # paths + schemas por módulo
│
├── migrations/                 # 45 migraciones (esquema completo)
├── seeders/                    # 20 seeders (catálogos + admin inicial)
├── scripts/                    # db-reset.ts, db-tracking-ts.ts, generate-keys.util.ts
├── tests/                      # unit / integration (jest)
├── docs/                       # documentación técnica (ver §Documentación)
├── Dockerfile · entrypoint.sh
└── package.json
```

> Los **workers** no viven en una carpeta `workers/` raíz: están junto a su dominio en
> `modules/schemas/**/workers/` (notificaciones, expiración de sesiones, doble aprobación, archivado de auditoría).

---

## 🚀 Modos de ejecución

Hay **tres entrypoints** en `servers/`; todos montan la misma infraestructura (Redis, DB, workers). El
modo lo elige el **comando que levantás**, no puertos distintos: los tres usan el mismo `PORT` y **solo
corre uno a la vez**.

| Modo               | Qué expone                                                              | Dev (hot-reload)      | Producción             |
| ------------------ | ---------------------------------------------------------------------- | --------------------- | ---------------------- |
| **Monolito** (def) | admin **y** client (`/admin/...` + `/client/...`) en un proceso        | `npm run dev`         | `npm start`            |
| Solo admin         | únicamente `adminApp`                                                   | `npm run dev:admin`   | `npm run start:admin`  |
| Solo client        | únicamente `clientApp`                                                  | `npm run dev:client`  | `npm run start:client` |

Producción corre el build compilado: `npm run build` antes de `npm start` (ver
[`docs/typescript-migration.md`](docs/typescript-migration.md)).

Prefijos de ruta reales (bajo cada app): `/api/v1/auth`, `/api/v1/kyc`, `/api/v1/notification`,
`/api/v1/records`, `/api/v1/core`, `/api/v1/integration`. En modo monolito se antepone `/admin` o
`/client` al mount. Detalle: [`docs/run-modes.md`](docs/run-modes.md).

---

## 📦 Requisitos previos

- **Node.ts** v18+
- **PostgreSQL** v14+
- **Redis** v7+ — _opcional_ (sin él, cache/rate-limit/locks caen a memoria/BD)
- Credenciales **AWS** (SES/SNS/S3) — opcionales en desarrollo (ver `MOCK_EXTERNAL_PROVIDERS`)

---

## 🚀 Instalación

```bash
# 1. Dependencias
npm install

# 2. Variables de entorno
cp .env.example .env        # y editar (ver §Configuración)

# 3. Generar las claves requeridas (JWT RS256 + AES) y pegarlas en el .env
npm run keys:generate

# 4. Crear el esquema, migrar y sembrar (ver §Base de datos)
npm run db:reset

# 5. Levantar
npm run dev
```

---

## ⚙️ Configuración (.env)

`.env.example` está documentado campo por campo. Lo mínimo para arrancar:

| Variable                              | Requerido | Notas                                                           |
| ------------------------------------- | :-------: | --------------------------------------------------------------- |
| `NODE_ENV`, `PORT` (def 4000), `HOST` |    —      | `PORT` lo usan los tres modos.                                  |
| `DB_HOST/PORT/NAME/USER/PASSWORD`     |    ✅     | PostgreSQL.                                                     |
| `DB_SCHEMA`                           |    ✅     | Esquema activo. **No usar `public`** (ver Base de datos).       |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`  |    ✅     | Par RS256 (PEM con `\n` literales). Sin ellas el arranque falla.|
| `AES_KEY` (+ `AES_IV`)                |    ✅     | Cifrado de PII. Generar con `npm run keys:generate`.            |
| `REDIS_*`                             |    —      | Opcional; sin config usa memoria local.                        |
| `AWS_*`, `SES_FROM_EMAIL`, `SNS_*`    |  parcial  | Requerido para notificar; en dev se puede mockear.             |
| `MOCK_EXTERNAL_PROVIDERS`             |    —      | Simula SMS/biométrico en dev (OTP fijo `123456`). Apagar en prod.|
| `ENABLE_WORKERS`                      |    —      | Habilita los cron workers.                                     |
| `SEED_ADMIN_*`                        |    —      | Datos del usuario admin inicial que siembra el seeder.         |

> **En producción** cargá las variables desde el entorno/gestor de secretos, no desde un `.env` en disco;
> usá HTTPS (la app respeta `trust proxy`); poné `CORS_ORIGIN` con dominios reales y
> `MOCK_EXTERNAL_PROVIDERS=false`.

---

## 🗄️ Base de datos

PostgreSQL + Sequelize, con **aislamiento por esquema** (`DB_SCHEMA`): una misma instancia puede alojar
varios proyectos en esquemas distintos, y el tracking de migraciones/seeders vive dentro del esquema.

| Comando               | Qué hace                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| `npm run db:migrate`  | Aplica migraciones pendientes.                                              |
| `npm run db:seed`     | Aplica seeders pendientes.                                                  |
| `npm run db:reset`    | **Dropea y recrea el esquema**, luego migra + seedea desde cero.            |
| `npm run db:fresh`    | Alias de `db:reset`.                                                        |

> ⚠️ `db:reset` es destructivo: dropea el esquema apuntado por `DB_SCHEMA`. Tiene una guarda que **aborta
> si `DB_SCHEMA` está vacío o es `public`**. Verificá siempre `DB_SCHEMA` antes de correrlo.

**Convención del repo:** no se acumulan migraciones `ALTER TABLE`. Para cambiar una tabla se **edita su
migración `create-*` original** (y el modelo/seeder) y se corre `db:reset`. Es viable porque `db:reset`
reconstruye el esquema entero. Detalle y gotchas de Postgres: [`docs/database.md`](docs/database.md).

---

## 💻 Uso

```bash
# Desarrollo (hot-reload)     Producción              Otros modos
npm run dev                   npm start               npm run dev:admin  / npm run dev:client

# Calidad
npm run lint        # eslint .
npm run lint:fix    # eslint . --fix
npm run format      # prettier --write .
```

- **Health check**: `GET /health` (en monolito reporta ambos sub-servicios).
- **Docs Swagger**: `GET /{servicio}/docs` y el JSON en `GET /{servicio}/docs.json`.

---

## 🔀 Flujo de un request

Middlewares globales (orden crítico, en `shared/base/base.app.ts`): `correlationId` → `helmet` → `cors` →
headers de seguridad → `express.json` (10 MB) → captura de JSON inválido → `auditContext`
(+ `AsyncLocalStorage`) → `compression` → `httpLogger`.

Middlewares de ruta (orden recomendado): `Auth` → `RBAC` → `RateLimit` → `RequestLock` → `Validator` →
`handleValidationErrors` → `AuditAction.declare` → controller.

> `cookieParser()` lo monta **solo el monolito**. En standalone (`dev:admin`/`dev:client`) no hay cookies:
> el canal se resuelve por `Authorization: Bearer`.

Errores: lanzar siempre `AppError` (nunca `throw 'string'`) desde el service; el `asyncHandler` reenvía al
handler global, que loguea, **audita el fallo** y responde con estructura uniforme. Detalle completo:
[`docs/request-flow.md`](docs/request-flow.md).

---

## 🔒 Seguridad

- **Headers** con Helmet (CSP, HSTS, `X-Frame-Options`, `nosniff`), CORS con whitelist.
- **Auth propia** JWT RS256; blacklist de tokens y umbrales de invalidación por sesión/usuario en Redis
  (fallback a BD). MFA TOTP/SMS opt-in. Inactividad 15 min + tope absoluto 8 h.
- **RBAC** por módulo/acción + doble aprobación (maker-checker) en acciones sensibles.
- **Input sanitization** (SQL/NoSQL injection, HPP), **rate limiting** y **request locking**.
- **PII**: cifrada at-rest (AES-256-GCM) y enmascarada en las respuestas por defecto.
- **Auditoría** append-only + alertas; logs nunca exponen password/token/PII.

Checklist de producción: rotar `JWT_*`/`AES_*`, `CORS_ORIGIN` real, HTTPS, `MOCK_EXTERNAL_PROVIDERS=false`,
Redis para rate-limit distribuido, backups de PostgreSQL, `ENABLE_WORKERS=true`.

---

## 🧪 Testing

```bash
npm run db:test:prepare  # una vez (y al cambiar migraciones): esquema `test` + migraciones
npm test                 # todos (jest, NODE_ENV=test)
npm run test:unit        # solo unit
npm run test:integration # solo integration
npm run test:coverage    # con cobertura
npm run test:watch       # watch
```

Tests en `tests/unit/**` y `tests/integration/**`. La suite corre con `--passWithNoTests` (la base trae un
smoke test del catálogo de modelos core; agregá los tuyos por feature).

Los **unitarios** mockean los repositorios y no necesitan base. Los de **integración** usan Postgres real
(la misma base de `.env`, pero en un esquema aislado: `TEST_DB_SCHEMA`, por defecto `test`, nunca `public`;
ver `tests/test-env.ts`). En CI corre un service container de Postgres (`.github/workflows/ci.yml`).

---

## 📚 Documentación

Toda la documentación técnica vive en [`docs/`](docs/). El README es el mapa; el detalle vive en cada guía:

| Doc | Qué cubre |
| --- | --------- |
| [`getting-started.md`](docs/getting-started.md) | **Empieza aquí:** setup local, correr la app y checklist de rebranding para hacer tuya la plantilla. |
| [`request-flow.md`](docs/request-flow.md) | Pipeline de un request, middlewares, `AppError`/`ApiResponse`, contexto de auditoría. |
| [`run-modes.md`](docs/run-modes.md) | Los tres modos de ejecución, comandos y variables. |
| [`auth-sessions.md`](docs/auth-sessions.md) | Login, tokens JWT RS256, rotación de refresh, sesiones, inactividad/tope, códigos 401. |
| [`rbac/rbac.md`](docs/rbac/rbac.md) | Roles, módulos, matriz de permisos, overrides, middleware RBAC. |
| [`rbac/modulos/`](docs/rbac/modulos/) | Binding módulo ↔ routes ↔ roles (autoritativo para el front). |
| [`dual-approval-global.md`](docs/dual-approval-global.md) | Framework maker-checker: cómo funciona y cómo agregar operaciones. |
| [`audit-and-alerts.md`](docs/audit-and-alerts.md) | `logAudit` vs `logger`, `audit_logs`, alertas, timeline forense. |
| [`origin-session-tracking.md`](docs/origin-session-tracking.md) | `origin_session_id` y cómo extenderlo en tablas nuevas. |
| [`notifications.md`](docs/notifications.md) | Motor de notificaciones: categorías/tipos, canales, workers, preferencias, adjuntos. |
| [`encryption-pii.md`](docs/encryption-pii.md) | Cifrado at-rest (AES-256-GCM) + hash de búsqueda. |
| [`pii-masking.md`](docs/pii-masking.md) | Enmascaramiento de PII en las respuestas de la API. |
| [`dtos.md`](docs/dtos.md) | Capa DTO, camelCase, componentes compartidos. |
| [`solid.md`](docs/solid.md) | Principios SOLID aplicados: dónde está cada uno, checklist para features nuevos y camino a hexagonal. |
| [`implementation-patterns.md`](docs/implementation-patterns.md) | Plantillas canónicas de código por capa. |
| [`database.md`](docs/database.md) | Migraciones, seeders, aislamiento por esquema, `db:reset`. |
| [`swagger.md`](docs/swagger.md) | Estructura del OpenAPI y cómo documentar un módulo. |
| [`features-overview.md`](docs/features-overview.md) | Mapa de capacidades cliente vs admin y dónde vive cada una. |

---

## 📐 Convenciones

- **Capas estrictas**: controller → service → repository → model. La lógica vive en el service.
- **Errores**: siempre `AppError`; sin try/catch en controllers (usar `asyncHandler`).
- **Respuestas**: `ApiResponse` (camelCase, PII enmascarada, aplanado automático de listados).
- **Auditoría**: `logAudit` en todo punto de entrada con `entityType`/`entityTable`.
- **BD**: editar la migración original + `db:reset` (no acumular `ALTER TABLE`).
- **Swagger** en el mismo pase que el código.
- Estilo: **ES6+**, ESLint + Prettier, Conventional Commits.

---

## 📄 Licencia

MIT. Ver [LICENSE](LICENSE).
