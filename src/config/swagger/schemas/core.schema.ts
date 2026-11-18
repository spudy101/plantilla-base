/**
 * ============================================================
 * CORE SCHEMA — Global
 * ============================================================
 * Schemas globales del núcleo:
 *   - SystemGlobalConfig — configuración global del sistema (SystemGlobalConfigComponent).
 *   - PendingApproval    — bloque genérico de doble aprobación pendiente (maker-checker)
 *                          que anota listados/detalles admin sobre cualquier entidad.
 */

// ============================================================
// SYSTEM GLOBAL CONFIG (SystemGlobalConfigComponent)
// ============================================================
const SystemGlobalConfig = {
  type: 'object',
  properties: {
    configId: { type: 'string', format: 'uuid' },
    configVersion: { type: 'integer' },
    isActive: { type: 'boolean' },
    currency: { type: 'string', example: 'CLP' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

// ============================================================
// PENDING APPROVAL — doble aprobación pendiente sobre una entidad
// ============================================================
// La anotan varios listados/detalles admin (ej. detalle de usuario) vía
// DualApprovalService.annotatePending. null cuando no hay solicitud pendiente.
const PendingApproval = {
  type: 'object',
  nullable: true,
  description: 'Solicitud de doble aprobación pendiente sobre esta entidad. null cuando no hay ninguna.',
  properties: {
    approvalRequestId: { type: 'string', format: 'uuid' },
    operationKey: { type: 'string', example: 'RBAC_ROLE_CHANGE' },
    status: { type: 'string', example: 'pending' },
    requestedBy: {
      type: 'object',
      nullable: true,
      properties: {
        userId: { type: 'string', format: 'uuid' },
        username: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true }
      }
    },
    requestedAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true }
  }
};

export default {
  SystemGlobalConfig,
  PendingApproval
};
