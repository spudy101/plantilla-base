# Patrones de implementación — plantillas de código

> Plantillas canónicas por capa. **Leer esta guía antes de crear los archivos de un feature.**

## Controller

```js
const MyService = require('../services/my.service');
const ApiResponse = require('../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../shared/middlewares/error.middleware');

class MyController {
  list = asyncHandler(async (req, res) => {
    const result = await MyService.list(req.query, req.user.userId);
    return ApiResponse.success(res, 'Listado obtenido exitosamente', result);
  });
  getById = asyncHandler(async (req, res) => {
    const result = await MyService.getById(req.params.id, req.user.userId);
    return ApiResponse.success(res, 'Recurso obtenido correctamente', result);
  });
  create = asyncHandler(async (req, res) => {
    const result = await MyService.create(req.body, _auditCtx(req, res));
    return ApiResponse.success(res, 'Recurso creado exitosamente', result, 201);
  });
}

function _auditCtx(req, res) {
  return {
    adminUserId: req.user.userId,
    adminFirstName: req.user.firstName,
    ipAddress: res.locals.auditContext.ip,
    userAgent: res.locals.auditContext.userAgent
  };
}
module.exports = new MyController();
```

> ✅ `ApiResponse.success` detecta automáticamente si el resultado tiene `{ data, metadata }` y lo aplana.
> ❌ No desestructurar `{ data, metadata }` en el controller — pasar el resultado directo.

## Service (con paginación)

```js
const AppError = require('../../../../shared/utils/app-error.util');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const { logAudit } = require('../../../../shared/utils/logger.util');
const myRepository = require('../../../../schemas/kyc/person/repositories/person.repository');
const { MyListResponseDTO } = require('../dtos/my.dto');

class MyService {
  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['status', 'isActive']);
    const searchTerm = query.search || null;

    const { rows, count } = await myRepository.findAllPaginated(filters, paginationParams, searchTerm);

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

  async getById(id, adminUserId) {
    const record = await myRepository.findById(id);
    if (!record) throw AppError.notFound('Recurso no encontrado');
    logAudit('MY_RESOURCE_VIEWED', adminUserId, {}, { entityId: id, entityType: 'MyResource', entityTable: 'my_resources' });
    return MyDetailResponseDTO(record);
  }
}
module.exports = new MyService();
```

> ✅ El objeto `metadata` siempre incluye: `totalItems, page, limit, sortBy, order, filters`.
> ✅ El service retorna directamente el resultado del DTO (que tiene `{ data, metadata }`).
> ❌ No usar `PaginationHelper.buildMetadata()` — armar el objeto metadata manualmente como arriba.

## DTO de lista paginada

```js
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');
const { MyResourceComponent } = require('../../../../shared/dtos/{dominio}/components-myresource.dto');

function MyListResponseDTO(rows, metadata) {
  return {
    data: Array.isArray(rows) ? rows.map(r => MyResourceComponent.build(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}
```

> ✅ Siempre `Array.isArray(rows) ? rows.map(...) : []` — nunca asumir que rows es array.
>
> ✅ **PII:** todo campo PII sale por `EncryptionUtil.safeDecrypt` + `MaskingUtil.maskXxx`, y los JSONB
> propios por `MaskingUtil.redactPayload`. Campo nuevo → declararlo en `shared/constants/pii-fields.js`.
> Ver `docs/pii-masking.md`.
> ✅ Siempre `MetadataDTO.build(metadata)` — nunca construir el objeto de paginación a mano en el DTO.

## Repository

```js
const BaseRepository = require('../../../../shared/repositories/base.repository');
const { MyModel } = require('../../../../shared/models');

class MyRepository extends BaseRepository {
  constructor() {
    super(MyModel, {
      searchFields: ['name', 'description'],
      filterIdField: 'category_id',
      filterIdKey: 'categoryId'
    });
  }
}
module.exports = new MyRepository();
```

## Routes (admin)

```js
const express = require('express');
const router = express.Router();
const MyController = require('../controllers/my.controller');
const MyValidator = require('../validators/my.validator');
const AuthMiddleware = require('../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../shared/middlewares/rate-limit.middleware');
const RequestLockMiddleware = require('../../../../shared/middlewares/request-lock.middleware');
const RbacMiddleware = require('../../../../shared/middlewares/rbac.middleware');
const AuditAction = require('../../../../shared/middlewares/audit-action.middleware');
const ValidatorUtil = require('../../../../shared/utils/validators.util');
const { RBAC_MODULES, RBAC_ACTIONS } = require('../../../../shared/constants/rbac');

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
module.exports = router;
```

> ✅ `AuditAction.declare(...)` va **siempre**, justo antes del controller (incluidos los GET).

> ✅ En rutas admin siempre usar `RbacMiddleware.requirePermission(RBAC_MODULE, RBAC_ACTION)`.
> ✅ El módulo y la acción deben calzar semánticamente con lo que hace el endpoint.
> ❌ No usar `AuthMiddleware.requireRole` en rutas admin nuevas — usar RBAC.

## Validator

```js
const { body, query } = require('express-validator');
const BaseValidator = require('../../../../shared/validators/base.validator');

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
module.exports = MyValidator;
```

## Model

```js
const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

module.exports = sequelize => {
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

## Migration

```js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('schema_name.my_table', {
      my_id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      name: { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
    });
  },
  down: async queryInterface => {
    await queryInterface.dropTable('schema_name.my_table');
  }
};
```
