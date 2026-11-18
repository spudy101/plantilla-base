import commonResponses from '../../../../responses/common.responses';
import auditactionsModule from '../../../../../../shared/constants/audit-actions';
const { AUDIT_CATEGORIES, AUDIT_RISKS, AUDIT_MODULES } = auditactionsModule;

/**
 * ============================================================
 * AUDIT ACTION CATALOG PATHS — ADMIN  (RF-ADM-03)
 * ============================================================
 * Catálogo de solo lectura de las acciones de auditoría definidas en
 * shared/constants/audit-actions/. Fuente homologada para poblar filtros
 * en el front (categorías, riesgos, módulos, acciones).
 *
 * Módulo: /admin/api/v1/records/audit/audit-action-catalog
 * Roles: SUPERADMIN, ADMIN_PRODUCTOS, AUDITOR_INTERNO, OFICIAL_CUMPLIMIENTO
 *
 * Rutas:
 *   GET /admin/api/v1/records/audit/audit-action-catalog/categories
 *   GET /admin/api/v1/records/audit/audit-action-catalog/risks
 *   GET /admin/api/v1/records/audit/audit-action-catalog/modules
 *   GET /admin/api/v1/records/audit/audit-action-catalog/actions
 */

// Enums derivados del catálogo canónico — nunca se desincronizan del código.
const CATEGORY_VALUES = Object.values(AUDIT_CATEGORIES);
const RISK_VALUES = Object.values(AUDIT_RISKS);
const MODULE_VALUES = Object.values(AUDIT_MODULES);

const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }];

const schemas = {
  AuditActionCategory: {
    type: 'object',
    description: 'Categoría de auditoría y cantidad de acciones que la usan.',
    properties: {
      category: { type: 'string', example: 'KYC', description: 'Nombre canónico de la categoría.' },
      actionsCount: { type: 'integer', example: 51, description: 'Cantidad de acciones en esta categoría.' }
    }
  },

  AuditActionRisk: {
    type: 'object',
    description: 'Nivel de riesgo de auditoría y cantidad de acciones que lo usan.',
    properties: {
      risk: { type: 'string', enum: RISK_VALUES, example: 'high' },
      actionsCount: { type: 'integer', example: 169 }
    }
  },

  AuditActionModule: {
    type: 'object',
    description: 'Módulo (origen de la acción) y cantidad de acciones que lo usan.',
    properties: {
      module: { type: 'string', enum: MODULE_VALUES, example: 'admin' },
      actionsCount: { type: 'integer', example: 122 }
    }
  },

  AuditActionCatalogItem: {
    type: 'object',
    description: 'Acción de auditoría del catálogo.',
    properties: {
      action: { type: 'string', example: 'PERSON_LIST_VIEWED', description: 'Código único de la acción.' },
      description: { type: 'string', example: 'Listado de usuarios consultado por administrador' },
      category: { type: 'string', enum: CATEGORY_VALUES, example: 'Personas' },
      risk: { type: 'string', enum: RISK_VALUES, example: 'medium' },
      module: {
        type: 'string',
        enum: MODULE_VALUES,
        nullable: true,
        description: 'Origen de la acción. Null cuando la acción no declara módulo.'
      }
    }
  }
};

const listActionsParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, default: 10 } },
  {
    name: 'order',
    in: 'query',
    schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' },
    description: 'Orden por código de acción.'
  },
  {
    name: 'category',
    in: 'query',
    schema: { type: 'string', enum: CATEGORY_VALUES },
    description: 'Filtrar por categoría canónica.'
  },
  {
    name: 'risk',
    in: 'query',
    schema: { type: 'string', enum: RISK_VALUES },
    description: 'Filtrar por nivel de riesgo.'
  },
  {
    name: 'module',
    in: 'query',
    schema: { type: 'string', enum: MODULE_VALUES },
    description: 'Filtrar por módulo de origen.'
  },
  {
    name: 'search',
    in: 'query',
    schema: { type: 'string', maxLength: 100 },
    description: 'Búsqueda de texto libre (case-insensitive) sobre el código de la acción y su descripción.'
  }
];

const catalogAccessNote = `**Acceso:** SUPERADMIN, ADMIN_PRODUCTOS, AUDITOR_INTERNO y OFICIAL_CUMPLIMIENTO (solo lectura).

Catálogo homologado: los valores provienen de la fuente de verdad \`shared/constants/audit-actions/audit-catalog.ts\`, los mismos que clasifican los registros en \`audit_logs\`.`;

const paths = {
  '/admin/api/v1/records/audit/audit-action-catalog/categories': {
    get: {
      tags: ['Admin - Auditoría / Catálogo de acciones'],
      summary: 'Listar categorías de auditoría',
      operationId: 'adminListAuditActionCategories',
      description: `Devuelve todas las categorías de auditoría con la cantidad de acciones de cada una.\n\n${catalogAccessNote}`,
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/AuditActionCategory' } },
          'Categorías de auditoría obtenidas exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/audit-action-catalog/risks': {
    get: {
      tags: ['Admin - Auditoría / Catálogo de acciones'],
      summary: 'Listar niveles de riesgo de auditoría',
      operationId: 'adminListAuditActionRisks',
      description: `Devuelve los niveles de riesgo (en orden ascendente de severidad) con la cantidad de acciones de cada uno.\n\n${catalogAccessNote}`,
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/AuditActionRisk' } },
          'Niveles de riesgo de auditoría obtenidos exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/audit-action-catalog/modules': {
    get: {
      tags: ['Admin - Auditoría / Catálogo de acciones'],
      summary: 'Listar módulos de auditoría',
      operationId: 'adminListAuditActionModules',
      description: `Devuelve los módulos de origen (\`admin\`, \`client\`, \`system\`) con la cantidad de acciones de cada uno.\n\n${catalogAccessNote}`,
      security: adminSecurity,
      responses: {
        200: commonResponses.ok(
          { type: 'array', items: { $ref: '#/components/schemas/AuditActionModule' } },
          'Módulos de auditoría obtenidos exitosamente.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  },

  '/admin/api/v1/records/audit/audit-action-catalog/actions': {
    get: {
      tags: ['Admin - Auditoría / Catálogo de acciones'],
      summary: 'Listar acciones del catálogo (paginado)',
      operationId: 'adminListAuditActionCatalog',
      description: `Lista paginada de todas las acciones de auditoría, filtrable por categoría, riesgo, módulo y búsqueda de texto libre (\`search\`, sobre código y descripción).\n\n${catalogAccessNote}`,
      security: adminSecurity,
      parameters: listActionsParams,
      responses: {
        200: commonResponses.paginated(
          { $ref: '#/components/schemas/AuditActionCatalogItem' },
          'Catálogo de acciones de auditoría obtenido exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
