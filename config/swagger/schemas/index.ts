/**
 * ============================================================
 * SCHEMAS INDEX
 * ============================================================
 * Punto de entrada único para components.schemas en el documento OpenAPI.
 *
 * Incluye:
 *   - Shared      → Pagination, Sort, Metadata
 *   - KYC         → Country, Department, City, PhonePrefix, Gender,
 *                   Role, AvatarTheme, Avatar, User, Person, PersonContact,
 *                   PersonLocation, VerificationCode, UserLoginAttempt,
 *                   ResetCredentials, UserChangeLog, UserSession, TrustedDevice,
 *                   BasicProfile, ExtendedProfile
 *
 * [RF-USR-01] | CA-06 — Enmascaramiento PII: en los schemas de RESPUESTA, documento, correo,
 * teléfono y TIN salen enmascarados (últimos 4). Los textos compartidos de `description`
 * viven en ./pii-masking.doc.js. Los schemas de REQUEST van siempre completos.
 *   - Core        → SystemGlobalConfig, PendingApproval
 *   - Notification→ NotificationType, Notification, GlobalNotification,
 *                   GlobalNotificationRead, UserPushToken,
 *                   UserNotificationPreference
 *
 * Uso en el ensamblador principal:
 *   const schemas = require('./schemas');
 *   // → swaggerSpec.components.schemas = { ...schemas, ...moduleSchemas }
 */

import kycSchemas = require('./kyc.schema');
import coreSchemas = require('./core.schema');
import notificationSchemas = require('./notification.schema');

// ─── Shared — Pagination / Sort / Metadata ───────────────────

const Pagination = {
  type: 'object',
  properties: {
    currentPage: { type: 'integer', example: 1 },
    pageSize: { type: 'integer', example: 20 },
    totalItems: { type: 'integer', example: 100 },
    totalPages: { type: 'integer', example: 5 },
    hasNextPage: { type: 'boolean', example: true },
    hasPreviousPage: { type: 'boolean', example: false }
  }
};

const Sort = {
  type: 'object',
  properties: {
    field: { type: 'string', example: 'created_at' },
    order: { type: 'string', enum: ['ASC', 'DESC'], example: 'DESC' }
  }
};

const Metadata = {
  type: 'object',
  description: 'Metadata de respuestas paginadas.',
  properties: {
    pagination: { $ref: '#/components/schemas/Pagination' },
    sort: { $ref: '#/components/schemas/Sort' },
    filters: {
      type: 'object',
      nullable: true,
      additionalProperties: true,
      description: 'Filtros activos en la consulta (solo presentes si se aplicaron).'
    }
  }
};

// ─── Shared — Error envelope ──────────────────────────────────
// Estructura estándar de ApiResponse.error / AppError. Referenciable como
// $ref: '#/components/schemas/ErrorResponse' desde cualquier módulo (admin y client).

const ErrorResponse = {
  type: 'object',
  description: 'Estructura estándar de respuesta de error (AppError / ApiResponse.error).',
  properties: {
    success: { type: 'boolean', example: false },
    statusCode: { type: 'integer', example: 400 },
    message: { type: 'string', example: 'Parámetros incorrectos o faltantes.' },
    errorCode: { type: 'string', nullable: true, example: 'BAD_REQUEST' },
    errors: {
      type: 'array',
      nullable: true,
      description: 'Detalle por campo (presente en errores de validación 422).',
      items: { type: 'object' }
    },
    timestamp: { type: 'string', format: 'date-time' }
  }
};

// ─── Merge final ──────────────────────────────────────────────

export = {
  // Shared
  Pagination,
  Sort,
  Metadata,
  ErrorResponse,

  // KYC + Catalog
  ...kycSchemas,

  // Core
  ...coreSchemas,

  // Notifications
  ...notificationSchemas
};
