# Patrones de implementación — plantillas de código

> Plantillas canónicas por capa. **Leer esta guía antes de crear los archivos de un feature.**
> Todo es TypeScript estricto con imports/exports nativos (ver [`typescript-migration.md`](typescript-migration.md)):
> los módulos del proyecto exportan por defecto (`export default`) y se importan con `import X from '…'`.

## Controller

```ts
import MyService from '../services/my.service';
import ApiResponse from '../../../../shared/utils/app-response.util';
import errorMiddlewareModule from '../../../../shared/middlewares/error.middleware';
const { asyncHandler } = errorMiddlewareModule;
import routeParamUtilModule from '../../../../shared/utils/route-param.util';
const { routeParam } = routeParamUtilModule;
import authUserUtilModule from '../../../../shared/utils/auth-user.util';
const { requireAuthUser } = authUserUtilModule;
import adminAuditContextUtilModule from '../../../../shared/utils/admin-audit-context.util';
const { adminAuditContext } = adminAuditContextUtilModule;

class MyController {
  list = asyncHandler(async (req, res) => {
    const result = await MyService.list(req.query, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Listado obtenido exitosamente', result);
  });

  getById = asyncHandler(async (req, res) => {
    const result = await MyService.getById(routeParam(req, 'id'), requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Recurso obtenido correctamente', result);
  });

  create = asyncHandler(async (req, res) => {
    const result = await MyService.create(req.body, adminAuditContext(req, res));
    return ApiResponse.success(res, 'Recurso creado exitosamente', result, 201);
  });
}

export default new MyController();
```

> ✅ `ApiResponse.success` detecta automáticamente si el resultado tiene `{ data, metadata }` y lo aplana.
> ❌ No desestructurar `{ data, metadata }` en el controller — pasar el resultado directo.
> ✅ `requireAuthUser(req)` (usuario autenticado tipado, o 401), `routeParam(req, 'id')` (string o 400) y
> `adminAuditContext(req, res)` (quién hace la acción admin): no leer `req.user` / `req.params` a mano.

## Service (con paginación)

```ts
import type { AdminAuditContext } from '../../../../shared/types/audit-context';
import AppError from '../../../../shared/utils/app-error.util';
import PaginationHelper from '../../../../shared/utils/pagination.util';
import loggerUtilModule from '../../../../shared/utils/logger.util';
const { logAudit } = loggerUtilModule;
import unitOfWork from '../../../../shared/database/unit-of-work';
import myRepository from '../../../schemas/{dominio}/repositories/my.repository';
import myDtoModule from '../dtos/my.dto';
const { MyListResponseDTO, MyDetailResponseDTO } = myDtoModule;

class MyService {
  unitOfWork: typeof unitOfWork;
  myRepository: typeof myRepository;

  // SOLID (D): dependencias por constructor, con la implementación real como default.
  constructor(deps: MyService.Deps = {}) {
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
    this.myRepository = deps.myRepository ?? myRepository;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['status', 'isActive']);
    const searchTerm = PaginationHelper.stringParam(query, 'search');

    const { rows, count } = await this.myRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...filters } : filters
    };

    logAudit(
      'MY_RESOURCE_LIST_VIEWED',
      adminUserId,
      { totalItems: count, page: paginationParams.page },
      { entityType: 'MyResource', entityTable: 'my_resources' }
    );

    return MyListResponseDTO(rows, metadata);
  }

  async getById(id: string, adminUserId: string) {
    const record = await this.myRepository.findById(id);
    if (!record) {
      throw AppError.notFound('Recurso no encontrado');
    }
    logAudit('MY_RESOURCE_VIEWED', adminUserId, {}, { entityId: id, entityType: 'MyResource', entityTable: 'my_resources' });
    return MyDetailResponseDTO(record);
  }

  async create(payload: MyService.CreateInput, auditContext: AdminAuditContext) {
    // …
  }
}

// Tipos asociados: namespace con el mismo nombre que la clase (fusión de declaraciones)
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MyService {
  export interface Deps {
    unitOfWork?: typeof unitOfWork;
    myRepository?: typeof myRepository;
  }
  export interface CreateInput {
    name: string;
  }
}

// Instancia por defecto (controllers) + la clase (tests con fakes, composición)
export default Object.assign(new MyService(), { MyService });
```

> ✅ **SOLID** (ver [`solid.md`](solid.md)): repos vía `this.`, transacciones con `this.unitOfWork.run(async () => …)`
> (los repositorios toman la transacción solos), y **nunca** el cliente de Prisma en un service — si necesitas
> un filtro, crea un método con nombre de negocio en el repositorio (`findByNames`, `findActive`,
> `searchPaginated`…). Los tipos de las filas sí: `import type { User } from '…/generated/prisma/client'`.
> ✅ Si el service usa pocos métodos de un repositorio, declara el puerto con `Pick<XRepositoryPort, 'a' | 'b'>`
> (`modules/schemas/repository-ports.ts`).
> ✅ El objeto `metadata` siempre incluye: `totalItems, page, limit, sortBy, order, filters`.
> ✅ El service retorna directamente el resultado del DTO (que tiene `{ data, metadata }`).
> ❌ No usar `PaginationHelper.buildMetadata()` — armar el objeto metadata manualmente como arriba.
> ❌ `export default new MyService()` sin la clase: la guarda de arquitectura lo rechaza (los tests no
> podrían inyectar dependencias).

## DTO de lista paginada

```ts
import componentsCatalogDtoModule from '../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import componentsMyResourceDtoModule from '../../../../shared/dtos/{dominio}/components-myresource.dto';
const { MyResourceComponent } = componentsMyResourceDtoModule;
import type defineMyModel from '../../../schemas/{dominio}/models/my.model';

function MyListResponseDTO(rows: defineMyModel.Instance[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(r => MyResourceComponent.build(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

export default { MyListResponseDTO };
```

> ✅ Siempre `Array.isArray(rows) ? rows.map(...) : []` — nunca asumir que rows es array.
>
> ✅ **PII:** todo campo PII sale por `EncryptionUtil.safeDecrypt` + `MaskingUtil.maskXxx`, y los JSONB
> propios por `MaskingUtil.redactPayload`. Campo nuevo → declararlo en `shared/constants/pii-fields.ts`.
> Ver `docs/pii-masking.md`.
> ✅ Siempre `MetadataDTO.build(metadata)` — nunca construir el objeto de paginación a mano en el DTO.

## Repository

```ts
import PrismaRepository from '../../../../shared/repositories/prisma.repository';
import { Prisma } from '../../../../shared/database/generated/prisma/client';
import type { MyEntity } from '../../../../shared/database/generated/prisma/client';

const SORTABLE = Object.values(Prisma.MyEntityScalarFieldEnum);
const SEARCH_FIELDS = ['name', 'description'] as const;

class MyRepository extends PrismaRepository {
  // `await this.db()`: el cliente de la transacción si hay un unitOfWork.run() activo, si no el único
  async findActiveByName(name: string): Promise<MyEntity | null> {
    return (await this.db()).myEntity.findFirst({ where: { name, isActive: true } });
  }

  async findAllPaginated(
    filters: PrismaRepository.Filters = {},
    pagination: PrismaRepository.PaginationParams = {},
    searchTerm: string | null = null
  ): Promise<{ rows: MyEntity[]; count: number }> {
    const where: Prisma.MyEntityWhereInput = {
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...this.searchWhere(searchTerm, SEARCH_FIELDS)
    };
    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.myEntity.findMany({ where, ...this.paginationArgs(SORTABLE, pagination) }),
      db.myEntity.count({ where })
    ]);
    return { rows, count };
  }
}

export default new MyRepository();
```

> ✅ Extiende `PrismaRepository` y expone **solo** las operaciones que su tabla admite (una bitácora
> append-only no tiene `update`/`delete`) — SOLID: L/I.
> ✅ Repositorio nuevo → `node scripts/ts-migration/gen-repository-ports.js` (agrega su `XRepositoryPort`).
> ✅ Filtros, `include` y `select` viven aquí, detrás de métodos con nombre de negocio:
> `findByNames(names, { exclude })`, `findPaginatedWithDeviceAndUser(where, pagination)`. El service no
> arma `where` de Prisma.
> ✅ PII: se lee y escribe en claro (la extensión de `shared/database/prisma.ts` cifra y hashea); para buscar
> por un campo cifrado se filtra por su hash (`hashValue()` de `shared/database/pii-fields`).
> ✅ Escrituras que deben quedar aunque el flujo se revierta (bitácoras) → `this.independentDb()`.
> ✅ `sortBy` llega en camelCase (`createdAt`; acepta `created_at`) y `paginationArgs` solo ordena por
> campos del modelo.
> ✅ Los enums de dominio (estados, catálogos cerrados) se leen de `shared/constants/domain-enums.ts`.

## Routes (admin)

```ts
import express from 'express';
const router = express.Router();
import MyController from '../controllers/my.controller';
import MyValidator from '../validators/my.validator';
import AuthMiddleware from '../../../../shared/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../shared/middlewares/request-lock.middleware';
import RbacMiddleware from '../../../../shared/middlewares/rbac.middleware';
import AuditAction from '../../../../shared/middlewares/audit-action.middleware';
import ValidatorUtil from '../../../../shared/utils/validators.util';
import rbacModule from '../../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

router.get(
  '/',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.ADMIN, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  // DualApprovalMiddleware.require('OP_KEY', {...}),  ← SOLO en operaciones sensibles (write)
  MyValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('MY_RESOURCE_LIST', { entityType: 'MyResource', entityTable: 'my_resources' }),
  MyController.list
);

export default router;
```

> ✅ `AuditAction.declare(...)` va **siempre**, justo antes del controller (incluidos los GET).

> ✅ En rutas admin siempre usar `RbacMiddleware.requirePermission(RBAC_MODULE, RBAC_ACTION)`.
> ✅ El módulo y la acción deben calzar semánticamente con lo que hace el endpoint.
> ❌ No usar `AuthMiddleware.requireRole` en rutas admin nuevas — usar RBAC.

## Validator

```ts
import { body, query } from 'express-validator';
import BaseValidator from '../../../../shared/validators/base.validator';

class MyValidator {
  static listQuery() {
    return [...BaseValidator.pagination(), ...BaseValidator.searchQuery(), query('isActive').optional().isBoolean().toBoolean()];
  }

  static create() {
    return [
      body('name').notEmpty().withMessage('El nombre es requerido').trim(),
      ...BaseValidator.uuidParam('categoryId', 'La categoría')
    ];
  }
}

export default MyValidator;
```

## Modelo y migración

No hay modelos en el código: la tabla se declara en `prisma/schema.prisma` (el cliente y sus tipos se
generan con `npm run prisma:generate`, que corre solo antes de `dev`, `build`, `typecheck` y `test`) y la
migración la genera Prisma (detalle en
[`database.md`](database.md#cambiar-el-esquema)):

```prisma
model MyEntity {
  myId      String   @id(map: "pk_my_table") @default(uuid()) @map("my_id") @db.Uuid
  name      String   @db.VarChar(100)
  otherId   String   @map("other_id") @db.Uuid
  other     Other    @relation(fields: [otherId], references: [otherId], map: "fk_my_table_other_id")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([otherId], map: "idx_my_table_other_id")
  @@map("my_table")
}
```

```bash
npm run db:migrate:dev -- --name create-my-table   # genera prisma/migrations/<ts>_create-my-table/migration.sql
```

> ✅ Revisá el `migration.sql` generado antes de commitearlo; triggers, CHECK y comentarios se agregan a mano
> en ese archivo. Los datos base van en el seed (`prisma/seeds/`, `npm run db:seed`).
