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

> ✅ **SOLID** (ver [`solid.md`](solid.md)): repos vía `this.`, transacciones con `this.unitOfWork.run(async transaction => …)`,
> y **nunca** `import … from 'sequelize'` / `Op` en un service — si necesitas un filtro, crea un método con
> nombre de negocio en el repositorio (`findByNames`, `findActive`, `searchPaginated`…).
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
import BaseRepository from '../../../../shared/repositories/base.repository';
import modelsModule from '../../../../shared/models';
const { MyModel } = modelsModule;
import type defineMyModel from '../models/my.model';

class MyRepository extends BaseRepository<defineMyModel.Instance> {
  constructor() {
    super(MyModel, {
      searchFields: ['name', 'description'],
      filterIdField: 'category_id',
      filterIdKey: 'categoryId'
    });
  }

  findActiveByName(name: string) {
    return this.model.findOne({ where: { name, is_active: true } });
  }
}

export default new MyRepository();
```

> ✅ Hereda de `BaseRepository` (CRUD completo), `AppendOnlyRepository` (solo inserción, ej. auditoría)
> o `ReadRepository` (solo lectura), con el genérico del modelo. Si sobrescribes un método, **misma
> firma que el padre** (incluido `options`, para no perder la transacción) — SOLID: L.
> ✅ Repositorio nuevo → `node scripts/ts-migration/gen-repository-ports.js` (agrega su `XRepositoryPort`).
> ✅ Los operadores de Sequelize (`Op.in`, `Op.between`…) viven aquí, detrás de métodos con nombre
> de negocio: `findByNames(names, { exclude })`, `findByIds(ids)`, `markAsReadByIds(ids)`.
> ✅ Los `include` también: el repositorio expone `findPaginatedWithDeviceAndUser(where, pagination)`
> o `findForAccountDeletion(userId, options)` y declara las asociaciones por nombre
> (`{ association: 'executor' }`), nunca con `model: X`.
> ✅ Los enums de dominio (estados, catálogos cerrados) viven en `shared/constants/domain-enums.ts`;
> el modelo los usa para su `ENUM` y el service los importa de ahí, no del modelo.
> ✅ No sobrescribas un método del padre con otra firma: si necesitas otra semántica, otro nombre
> (`existsOverride(role, module, action)` en vez de redefinir `exists(criteria)`).

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

## Model

Se escribe la factory y se registra en `shared/models/index.ts`; los tipos (`defineMyModel.Attributes`,
`CreationAttributes`, `Instance` con asociaciones, `Static`) los **genera**
`npx tsx scripts/ts-migration/gen-model-types.js` desde la definición real, que también reescribe la
factory a su forma tipada. Al cambiar una columna o asociación se vuelve a correr.

```ts
import { DataTypes } from 'sequelize';
import constantsModule from '../../../../shared/constants';
const { database } = constantsModule;

export default sequelize => {
  const MyModel = sequelize.define(
    'MyModel',
    {
      my_id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING(100), allowNull: false }
    },
    { schema: database.schema, tableName: 'my_table', timestamps: true, underscored: true }
  );

  MyModel.associate = models => {
    MyModel.belongsTo(models.OtherModel, { foreignKey: 'other_id', as: 'other' });
  };
  return MyModel;
};
```

Después del generador queda `function defineMyModel(sequelize: Sequelize): defineMyModel.Static { … }`,
`sequelize.define<defineMyModel.Instance>(…)`, el namespace `defineMyModel` y `export default defineMyModel`.
Métodos de instancia o estáticos propios (`STATUS`…) van en un namespace manual antes del bloque generado.

## Migration

```ts
import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'my_table', schema: SCHEMA },
      {
        my_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
        name: { type: Sequelize.STRING(100), allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'my_table', schema: SCHEMA });
  }
} satisfies Migration;
```

> ✅ `satisfies Migration` tipa `queryInterface` y `Sequelize` (el módulo `sequelize` completo) sin anotarlos.
> Los seeders siguen el mismo contrato. Corren con `npm run db:migrate` / `npm run db:seed` (sequelize-cli vía tsx).
