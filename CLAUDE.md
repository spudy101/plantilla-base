# plantilla-base

Plantilla de backend: **Node 24 + TypeScript estricto + Express + Prisma (Postgres)**, con monolito modular por
capas. El criterio general está en `.claude/CLAUDE.md` y en el skill `layered-backend`. Este archivo cubre
solo lo propio de este repositorio.

## Comandos

| Qué | Comando |
|---|---|
| Desarrollo | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Tests unitarios (incluye las guardas de arquitectura) | `npm run test:unit` |
| Tests de integración (necesitan Postgres: `npm run db:test:prepare`) | `npm run test:integration` |
| Lint | `npm run lint` |
| Migración nueva | `npm run db:migrate:dev -- --name <nombre>` (revisar el `migration.sql` generado) |

El cliente de Prisma se genera solo antes de `dev`, `build`, `typecheck` y `test`.

## Dónde mirar antes de cambiar algo

- `docs/ARCHITECTURE.md`: estructura, capas, fronteras entre módulos, "¿dónde va esto?". Si el código lo
  contradice, uno de los dos está mal y se arregla.
- `docs/implementation-patterns.md`: plantillas de controller, service, repositorio, rutas, request y response.
- `docs/solid.md`: cómo se aplica cada principio aquí y qué verifica la guarda.
- Temas puntuales: `docs/notifications.md`, `docs/idempotency.md`, `docs/errors-and-retries.md`,
  `docs/pii-masking.md`, `docs/dtos.md`, `docs/database.md`, `docs/rbac/`.
- `docs/prisma-migration.md` y `docs/typescript-migration.md` son **históricos**: sus rutas pueden no existir.

## Reglas de este repo (verificadas por `tests/unit/guards/`)

- El cliente de Prisma solo en repositorios y `src/shared/database/`. Los services pueden importar **tipos** del
  cliente generado (`import type`).
- `src/shared/` no importa nada de `src/modules/`; lo que necesita se le registra desde `src/app.ts`.
- Entre módulos solo se usa el `index.ts` del otro.
- Los enums de dominio se leen de `src/shared/constants/domain-enums.ts`.
- Todo repositorio extiende `PrismaRepository` y expone solo lo que su tabla admite.
- Los services con repositorios los reciben por `constructor(deps = {})` y exportan instancia + clase:
  `export default Object.assign(new XService(), { XService })`.
- Las llamadas a proveedores externos pasan por `callProvider` (`src/shared/infra/provider-call.util.ts`).

## Convenciones

- Transacciones con `this.unitOfWork.run(async () => …)`; auditoría y notificaciones después del commit.
- Entrada y salida con Zod: `requests/` (esquema en la ruta con `validate`) y `responses/` (DTO campo a campo
  más su esquema y un test de conformidad).
- Listados: `pageQuery` / `pageRequest` / `pageMetadata` (`src/shared/http/pagination.ts`).
- Rutas admin: `RbacMiddleware.requirePermission(módulo, acción)`, no `requireRole`.
- PII: campos cifrados declarados en `src/shared/constants/pii-fields.ts`; los DTOs enmascaran.
- Documentación, comentarios y mensajes de commit en español. Commits tipo `tipo(área): descripción`.
- Desplegado como un solo servidor: no se agregan servidores separados ni configuraciones para despliegues
  que no existen.
