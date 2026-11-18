/**
 * ============================================================
 * CORE SCHEMA — Global
 * ============================================================
 * Schemas globales del núcleo:
 *   - PendingApproval    — bloque genérico de doble aprobación pendiente (maker-checker)
 *                          que anota listados/detalles admin sobre cualquier entidad.
 */

import { toOpenApi } from '../../../shared/validation/openapi';
import { PendingApprovalSchema } from '../../../modules/approvals/responses/approval-components.response';

// ============================================================
// PENDING APPROVAL — doble aprobación pendiente sobre una entidad
// ============================================================
// La anotan varios listados/detalles admin (ej. detalle de usuario) vía
// DualApprovalService.annotatePending. null cuando no hay solicitud pendiente.
const PendingApproval = toOpenApi(PendingApprovalSchema, 'output');

export default {
  PendingApproval
};
