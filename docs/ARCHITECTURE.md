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
    infra/             redis, s3, circuit breaker, retry, bus de eventos
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
  validators/          validación de la entrada
  dtos/                forma de la salida (lista blanca, enmascarado de PII)
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

## ¿Dónde va esto?

| Quiero… | Va en |
|---|---|
| Un endpoint nuevo | `modules/<dominio>/routes/` + controller + service |
| Una regla de negocio | `modules/<dominio>/services/` |
| Una consulta a la BD | `modules/<dominio>/repositories/` |
| Usar algo de otro módulo | `import … from '../<otro>'` (su `index.ts`) |
| Mandar una notificación | la API pública de `modules/notification` |
| Registrar un hecho de negocio | la API pública de `modules/audit` |
| Un job periódico | `modules/<dominio>/workers/` |
| Integrar un proveedor externo | `modules/<dominio>/providers/` |
| Algo técnico sin negocio (cifrado, Redis, paginación) | `shared/<área>/` |
| Un dominio nuevo | copiar el molde de un módulo existente |

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

## Servidor

Hay un único servidor. Los prefijos `/admin` y `/client` separan las audiencias a nivel de rutas
(cada una con sus políticas de autenticación), no de despliegue.
