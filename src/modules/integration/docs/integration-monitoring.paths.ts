import commonResponses from '../../../config/swagger/responses/common.responses';
import { toOpenApi, toParameters } from '../../../shared/validation/openapi';
import { DashboardQuery, FallbackQuery, LogIdParams, LogsQuery } from '../requests/integration-monitoring.request';
import {
  FallbackEventSchema,
  IntegrationDashboardSchema,
  IntegrationLogDetailSchema,
  IntegrationLogItemSchema,
  ProvidersHealthSchema
} from '../responses/integration-monitoring.response';

/**
 * INTEGRATION MONITORING PATHS — ADMIN
 * Monitoreo de las integraciones externas (AWS: SES, S3, SNS, SMS): tablero, salud de proveedores, bitácora
 * de llamadas y fallbacks del circuit breaker. Solo lectura.
 *
 *   GET /admin/api/v1/integration/dashboard          (integrationDashboard:READ)
 *   GET /admin/api/v1/integration/providers/health   (providers:READ)
 *   GET /admin/api/v1/integration/logs               (apiLogs:READ)
 *   GET /admin/api/v1/integration/logs/{apiLogId}    (apiLogs:READ)
 *   GET /admin/api/v1/integration/fallbacks          (apiLogs:READ)
 */

// Generados desde los esquemas Zod de requests/ y responses/.
const schemas = {
  IntegrationDashboard: toOpenApi(IntegrationDashboardSchema, 'output'),
  ProvidersHealth: toOpenApi(ProvidersHealthSchema, 'output'),
  IntegrationLogItem: toOpenApi(IntegrationLogItemSchema, 'output'),
  IntegrationLogDetail: toOpenApi(IntegrationLogDetailSchema, 'output'),
  ProviderFallbackEvent: toOpenApi(FallbackEventSchema, 'output')
};

const TAG = 'Admin - Integraciones externas';
const errors = { ...commonResponses.Unauthorized, ...commonResponses.Forbidden, ...commonResponses.InternalServerError };

const paths = {
  '/admin/api/v1/integration/dashboard': {
    get: {
      tags: [TAG],
      summary: 'Tablero de integraciones',
      operationId: 'adminIntegrationDashboard',
      description: 'Totales, tasa de éxito y estado del circuit breaker por proveedor en el rango, más los fallbacks recientes.',
      parameters: toParameters(DashboardQuery, 'query'),
      responses: { 200: commonResponses.ok({ $ref: '#/components/schemas/IntegrationDashboard' }), ...commonResponses.ValidationError, ...errors }
    }
  },
  '/admin/api/v1/integration/providers/health': {
    get: {
      tags: [TAG],
      summary: 'Salud de los proveedores',
      operationId: 'adminProvidersHealth',
      description: 'Disponibilidad actual de cada proveedor (circuit breaker + tasa de éxito reciente).',
      responses: { 200: commonResponses.ok({ $ref: '#/components/schemas/ProvidersHealth' }), ...errors }
    }
  },
  '/admin/api/v1/integration/logs': {
    get: {
      tags: [TAG],
      summary: 'Bitácora de llamadas a proveedores (paginada)',
      operationId: 'adminIntegrationLogs',
      description: 'Cada llamada con su resultado, tiempo de respuesta, y el usuario y la sesión que la originaron.',
      parameters: toParameters(LogsQuery, 'query'),
      responses: { 200: commonResponses.paginated({ $ref: '#/components/schemas/IntegrationLogItem' }), ...commonResponses.ValidationError, ...errors }
    }
  },
  '/admin/api/v1/integration/logs/{apiLogId}': {
    get: {
      tags: [TAG],
      summary: 'Detalle de una llamada',
      operationId: 'adminIntegrationLogDetail',
      description: 'Incluye el mensaje de error y los payloads (sanitizados) de la llamada.',
      parameters: toParameters(LogIdParams, 'path'),
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/IntegrationLogDetail' }),
        ...commonResponses.ValidationError,
        ...commonResponses.NotFound,
        ...errors
      }
    }
  },
  '/admin/api/v1/integration/fallbacks': {
    get: {
      tags: [TAG],
      summary: 'Historial de fallbacks de proveedores (paginado)',
      operationId: 'adminProviderFallbacks',
      description: 'Ventanas en que el circuit breaker de un proveedor estuvo abierto, con su duración e impacto.',
      parameters: toParameters(FallbackQuery, 'query'),
      responses: { 200: commonResponses.paginated({ $ref: '#/components/schemas/ProviderFallbackEvent' }), ...commonResponses.ValidationError, ...errors }
    }
  }
};

export default { paths, schemas };
