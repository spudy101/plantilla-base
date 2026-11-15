// Core del framework de doble aprobación global (maker-checker / cuatro ojos).
//
// Tres responsabilidades:
//   1. register(opKey, handler) — cada módulo registra su "reanudación" (IoC). Al aprobar,
//      resolve() invoca ese handler con el payload guardado. NO se re-ejecutan requests HTTP.
//   2. gate(opKey, {...}) — decide si una operación requiere segunda aprobación; si la requiere
//      crea el approval_request (status=pending) y notifica a los aprobadores.
//   3. resolve(requestId, decision, ctx) — el segundo funcionario aprueba/rechaza; al aprobar
//      invoca el handler registrado y persiste el resultado.
//
// El "estado doble aprobación" de cualquier módulo vive en `approval_requests` — no se duplican
// columnas ni máquina de estados por tabla.

const AppError = require('../../../../shared/utils/app-error.util');
const { logAudit, logger } = require('../../../../shared/utils/logger.util');
const { addBusinessHours } = require('../../../../shared/utils/business-hours.util');
const PaginationHelper = require('../../../../shared/utils/pagination.util');
const requestContext = require('../../../../shared/utils/request-context.util');
const approvalRequestRepository = require('../repositories/approval-request.repository');
const userRepository = require('../../kyc/iam/repositories/user.repository');
const NotificationCreationService = require('../../../schemas/notification/services/notification-creation.service');
const { ApprovalRequest } = require('../../../../shared/models');
const { notifications } = require('../../../../shared/constants');
const { WILDCARD_ROLES, CONDITION, DEFAULT_TTL_HOURS, DUAL_APPROVAL_OPS } = require('../../../../shared/constants/dual-approval');
const { SUPERADMIN_ROLE_NAMES } = require('../../../../shared/constants/rbac');
const { ApprovalRequestComponent, PendingApprovalComponent } = require('../../../../shared/dtos/core/components-approval.dto');
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');

const DECISION = { APPROVE: 'approve', REJECT: 'reject' };
const NOTIF_DUAL_APPROVAL_RESOLVED = 'DUAL_APPROVAL_RESOLVED';
const AUTO_APPROVE_NOTE = 'Auto-aprobado por super_admin (cuatro ojos omitido por rol)';

// Registro de handlers (IoC). Cada módulo registra su reanudación en el bootstrap.
const HANDLERS = new Map();

class DualApprovalService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new DualApprovalService({ approvalRequestRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.approvalRequestRepository = deps.approvalRequestRepository ?? approvalRequestRepository;
    this.userRepository = deps.userRepository ?? userRepository;
    this.NotificationCreationService = deps.NotificationCreationService ?? NotificationCreationService;
  }

  // ── Registro de handlers ──────────────────────────────────────────────────

  /**
   * @param {string} opKey
   * @param {(payload, ctx)=>Promise<any>} onApprove — ejecuta la acción real al aprobar.
   * @param {(payload, ctx)=>Promise<any>} [onReject] — opcional: reacción al rechazo (ej: revertir
   *        un estado provisional). Si se omite, el rechazo solo marca el approval_request.
   */
  // eslint-disable-next-line class-methods-use-this
  register(opKey, onApprove, onReject = null) {
    if (!DUAL_APPROVAL_OPS[opKey]) {
      throw new Error(`[DualApproval] Operación desconocida al registrar handler: ${opKey}`);
    }
    if (typeof onApprove !== 'function') {
      throw new Error(`[DualApproval] Handler inválido para ${opKey}`);
    }
    if (onReject !== null && typeof onReject !== 'function') {
      throw new Error(`[DualApproval] onReject inválido para ${opKey}`);
    }
    HANDLERS.set(opKey, { onApprove, onReject });
  }

  // ── Condición de gate ───────────────────────────────────────────────────────

  async requiresApproval(opKey, payload) {
    // El maker-checker es incondicional: no hay interruptor global que lo apague. Cada operación
    // decide por su `condition` (ALWAYS o THRESHOLD sobre un campo del payload).
    const op = _getOp(opKey);
    if (op.condition === CONDITION.ALWAYS) {
      return true;
    }
    if (op.condition === CONDITION.THRESHOLD) {
      const value = Number(payload?.[op.thresholdField] ?? 0);
      const threshold = await _resolveThreshold(op);
      return value > threshold;
    }
    return false;
  }

  // ── Gate ─────────────────────────────────────────────────────────────────────

  /**
   * @param {string} opKey
   * @param {Object} args — { entityType?, entityId?, payload, ctx }
   * @returns {Promise<{pending:boolean, request?:Object}>}
   */
  async gate(opKey, { entityType, entityId, payload, ctx }) {
    const op = _getOp(opKey);

    const requires = await this.requiresApproval(opKey, payload);
    if (!requires) {
      return { pending: false };
    }

    const resolvedEntityType = entityType ?? op.entityType ?? null;

    // Una sola pendiente por (operación, entidad) — refuerza el índice único parcial.
    if (resolvedEntityType && entityId) {
      const existing = await this.approvalRequestRepository.findPendingByEntityOperation(opKey, resolvedEntityType, entityId);
      if (existing) {
        throw AppError.conflict('Ya hay una solicitud de aprobación pendiente para esta operación sobre esta entidad', {
          code: 'DUAL_APPROVAL_ALREADY_PENDING',
          approvalRequestId: existing.approval_request_id
        });
      }
    }

    // super_admin: cuatro ojos omitido por rol. Se crea la solicitud pero queda aprobada por
    // él mismo (traza completa: requested_by === second_approver_id) y NO se bloquea — la acción
    // real la ejecuta el flujo normal (controller tras next(), o el service inline). No se invoca
    // el handler IoC aquí para no duplicar la ejecución.
    if (this.isSuperAdmin(ctx?.adminRoleName)) {
      return this._gateAutoApprove(opKey, { resolvedEntityType, entityId, payload, ctx });
    }

    const ttlHours = op.ttlHours ?? DEFAULT_TTL_HOURS;
    const expiresAt = addBusinessHours(new Date(), ttlHours);

    const request = await this.approvalRequestRepository.create({
      operation_key: opKey,
      entity_type: resolvedEntityType,
      entity_id: entityId ?? null,
      payload: payload ?? {},
      requested_by: ctx.adminUserId,
      requested_at: new Date(),
      status: ApprovalRequest.STATUS.PENDING,
      expires_at: expiresAt,
      // Sesión del MAKER. El approver resuelve en otra sesión — esa queda en audit_logs, no acá.
      ...requestContext.originFromContext()
    });

    this._notifyApprovers(op, request, ctx);

    logAudit(
      'DUAL_APPROVAL_REQUESTED',
      ctx.adminUserId,
      {
        approvalRequestId: request.approval_request_id,
        operationKey: opKey,
        entityType: resolvedEntityType,
        entityId: entityId ?? null,
        expiresAt
      },
      { entityId: request.approval_request_id, entityType: 'ApprovalRequest', entityTable: 'approval_requests' }
    );

    return { pending: true, request: ApprovalRequestComponent.build(request) };
  }

  // ── Auto-aprobación por super_admin (cuatro ojos omitido por rol) ──────────────

  /**
   * @param {string} roleName
   * @returns {boolean} true si el rol es superadministrador (legacy o RBAC).
   */
  // eslint-disable-next-line class-methods-use-this
  isSuperAdmin(roleName) {
    return !!roleName && SUPERADMIN_ROLE_NAMES.includes(roleName);
  }

  /**
   * Crea la approval_request ya resuelta (approved) por el propio maker super_admin y deja la
   * traza de auditoría (REQUESTED + AUTO_APPROVED). Devuelve { pending:false } para que el flujo
   * normal ejecute la acción real una sola vez. No invoca el handler IoC.
   */
  // eslint-disable-next-line class-methods-use-this
  async _gateAutoApprove(opKey, { resolvedEntityType, entityId, payload, ctx }) {
    const now = new Date();
    const request = await this.approvalRequestRepository.create({
      operation_key: opKey,
      entity_type: resolvedEntityType,
      entity_id: entityId ?? null,
      payload: payload ?? {},
      requested_by: ctx.adminUserId,
      requested_at: now,
      status: ApprovalRequest.STATUS.APPROVED,
      second_approver_id: ctx.adminUserId,
      resolved_at: now,
      resolution_notes: AUTO_APPROVE_NOTE,
      expires_at: null,
      // Auto-aprobación de super_admin: maker y approver son el mismo, así que esta única sesión cubre ambos.
      ...requestContext.originFromContext()
    });

    const auditDetails = {
      approvalRequestId: request.approval_request_id,
      operationKey: opKey,
      entityType: resolvedEntityType,
      entityId: entityId ?? null
    };
    const auditMeta = {
      entityId: request.approval_request_id,
      entityType: 'ApprovalRequest',
      entityTable: 'approval_requests'
    };
    logAudit('DUAL_APPROVAL_REQUESTED', ctx.adminUserId, auditDetails, auditMeta);
    logAudit('DUAL_APPROVAL_AUTO_APPROVED', ctx.adminUserId, auditDetails, auditMeta);

    return { pending: false, autoApproved: true, request: ApprovalRequestComponent.build(request) };
  }

  // ── Resolución (aprobar / rechazar) ───────────────────────────────────────────

  /**
   * @param {string} requestId
   * @param {Object} body — { decision: 'approve'|'reject', notes? }
   * @param {Object} approverCtx — { adminUserId, adminRoleName?, adminFirstName?, ... }
   */
  async resolve(requestId, body, approverCtx) {
    const request = await this.approvalRequestRepository.findByIdWithUsers(requestId);
    if (!request) {
      throw AppError.notFound('Solicitud de aprobación no encontrada', { code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }

    if (request.status !== ApprovalRequest.STATUS.PENDING) {
      throw AppError.conflict(`La solicitud ya está en estado "${request.status}" y no puede re-resolverse`, {
        code: 'APPROVAL_REQUEST_NOT_PENDING'
      });
    }

    const op = _getOp(request.operation_key);
    _assertApproverRole(op, approverCtx.adminRoleName);
    _assertSegregation(request, approverCtx.adminUserId);

    const { decision } = body;
    if (decision === DECISION.APPROVE) {
      return this._approve(request, op, body, approverCtx);
    }
    if (decision === DECISION.REJECT) {
      return this._reject(request, op, body, approverCtx);
    }
    throw AppError.badRequest('Decisión no reconocida', { code: 'INVALID_RESOLUTION_DECISION' });
  }

  async _approve(request, op, body, approverCtx) {
    const entry = HANDLERS.get(request.operation_key);
    if (!entry || typeof entry.onApprove !== 'function') {
      throw AppError.badRequest(`No hay handler registrado para la operación "${request.operation_key}"`, {
        code: 'DUAL_APPROVAL_NO_HANDLER'
      });
    }

    // El handler es idempotente (RF — §11): si falla la persistencia posterior, la
    // solicitud queda pendiente y puede reintentarse sin doble ejecución.
    const result = await entry.onApprove(request.payload, approverCtx);

    await request.update({
      status: ApprovalRequest.STATUS.APPROVED,
      second_approver_id: approverCtx.adminUserId,
      resolved_at: new Date(),
      resolution_notes: body.notes ?? null,
      result: _sanitizeResult(result)
    });

    this._notifyMaker(request, op, DECISION.APPROVE);

    logAudit(
      'DUAL_APPROVAL_APPROVED',
      approverCtx.adminUserId,
      {
        approvalRequestId: request.approval_request_id,
        operationKey: request.operation_key,
        entityType: request.entity_type,
        entityId: request.entity_id
      },
      { entityId: request.approval_request_id, entityType: 'ApprovalRequest', entityTable: 'approval_requests' }
    );

    await request.reload();
    return ApprovalRequestComponent.build(request);
  }

  async _reject(request, op, body, approverCtx) {
    // Reacción opcional del módulo al rechazo (ej: revertir un estado provisional).
    const entry = HANDLERS.get(request.operation_key);
    if (entry && typeof entry.onReject === 'function') {
      await entry.onReject(request.payload, approverCtx);
    }

    await request.update({
      status: ApprovalRequest.STATUS.REJECTED,
      second_approver_id: approverCtx.adminUserId,
      resolved_at: new Date(),
      resolution_notes: body.notes ?? null
    });

    this._notifyMaker(request, op, DECISION.REJECT);

    logAudit(
      'DUAL_APPROVAL_REJECTED',
      approverCtx.adminUserId,
      {
        approvalRequestId: request.approval_request_id,
        operationKey: request.operation_key,
        entityType: request.entity_type,
        entityId: request.entity_id
      },
      { entityId: request.approval_request_id, entityType: 'ApprovalRequest', entityTable: 'approval_requests' }
    );

    await request.reload();
    return ApprovalRequestComponent.build(request);
  }

  // ── Annotate de pendientes en listados ────────────────────────────────────────

  /**
   * Anota cada instancia de `rows` con `pendingApproval` (objeto | null) en una sola query batch.
   * Detecta el id de cada fila por su PK de Sequelize (override con `idField`).
   * Devuelve las mismas `rows` (mutadas) para encadenar.
   */
  // eslint-disable-next-line class-methods-use-this
  async annotatePending(entityType, rows, idField = null) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows;
    }

    const pkField = idField ?? rows[0]?.constructor?.primaryKeyAttribute ?? null;
    if (!pkField) {
      return rows;
    }

    const ids = rows.map(r => r[pkField]).filter(Boolean);
    const pendings = await this.approvalRequestRepository.findPendingByEntityIds(entityType, ids);

    const byEntityId = new Map();
    for (const p of pendings) {
      byEntityId.set(p.entity_id, p);
    }

    for (const row of rows) {
      const pending = byEntityId.get(row[pkField]);
      row.pendingApproval = pending ? PendingApprovalComponent.build(pending) : null;
    }

    return rows;
  }

  // ── Política para el front ────────────────────────────────────────────────────

  async getPolicy() {
    const entries = await Promise.all(
      Object.entries(DUAL_APPROVAL_OPS).map(async ([opKey, op]) => {
        const base = {
          operationKey: opKey,
          label: op.label,
          condition: op.condition,
          approverRoles: op.approverRoles,
          entityType: op.entityType,
          ttlHours: op.ttlHours ?? DEFAULT_TTL_HOURS
        };
        if (op.condition === CONDITION.THRESHOLD) {
          base.thresholdField = op.thresholdField;
          base.threshold = await _resolveThreshold(op);
        }
        return base;
      })
    );
    // `enabled` se conserva en el contrato (el front lo lee) pero ya no es configurable: el
    // maker-checker está siempre activo.
    return { enabled: true, operations: entries };
  }

  // ── List / getById para endpoints admin ───────────────────────────────────────

  // eslint-disable-next-line class-methods-use-this
  async list(query) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['operationKey', 'status', 'entityType']);
    const searchTerm = query.search || null;

    const { rows, count } = await this.approvalRequestRepository.findAllPaginatedWithUsers(filters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...filters } : filters
    };

    return {
      data: Array.isArray(rows) ? rows.map(r => ApprovalRequestComponent.buildList(r)) : [],
      metadata: MetadataDTO.build(metadata)
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async getById(id) {
    const request = await this.approvalRequestRepository.findByIdWithUsers(id);
    if (!request) {
      throw AppError.notFound('Solicitud de aprobación no encontrada', { code: 'APPROVAL_REQUEST_NOT_FOUND' });
    }
    return ApprovalRequestComponent.build(request);
  }

  // ── Notificaciones (privadas) ─────────────────────────────────────────────────

  // eslint-disable-next-line class-methods-use-this
  async _notifyApprovers(op, request, ctx) {
    let approvers = [];
    try {
      approvers = await this.userRepository.findActiveUsersByRoleNames(op.approverRoles, {
        attributes: ['user_id'],
        includePerson: false
      });
    } catch (err) {
      logger.warn('[DualApproval] Error buscando aprobadores', { error: err.message, operationKey: request.operation_key });
      return;
    }

    for (const approver of approvers ?? []) {
      setImmediate(() => {
        this.NotificationCreationService.crearNotificacion({
          tipoNotificacion: op.notificationType,
          userId: approver.user_id,
          relatedEntity: { type: 'ApprovalRequest', id: request.approval_request_id },
          metadata: {
            approvalRequestId: request.approval_request_id,
            operationLabel: op.label,
            entityType: request.entity_type,
            entityId: request.entity_id,
            firstName: ctx.adminFirstName ?? '',
            logoUrl: notifications?.ses?.logoUrl ?? ''
          }
        }).catch(err =>
          logger.warn('[DualApproval] Error notificando aprobador', {
            error: err.message,
            approvalRequestId: request.approval_request_id
          })
        );
      });
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _notifyMaker(request, op, decision) {
    if (!request.requested_by) {
      return;
    }
    setImmediate(() => {
      this.NotificationCreationService.crearNotificacion({
        tipoNotificacion: NOTIF_DUAL_APPROVAL_RESOLVED,
        userId: request.requested_by,
        relatedEntity: { type: 'ApprovalRequest', id: request.approval_request_id },
        metadata: {
          approvalRequestId: request.approval_request_id,
          operationLabel: op.label,
          decision,
          logoUrl: notifications?.ses?.logoUrl ?? ''
        }
      }).catch(err =>
        logger.warn('[DualApproval] Error notificando al maker', {
          error: err.message,
          approvalRequestId: request.approval_request_id
        })
      );
    });
  }
}

// ── Helpers privados ────────────────────────────────────────────────────────────

function _getOp(opKey) {
  const op = DUAL_APPROVAL_OPS[opKey];
  if (!op) {
    throw AppError.badRequest(`Operación de doble aprobación desconocida: ${opKey}`, { code: 'UNKNOWN_DUAL_APPROVAL_OP' });
  }
  return op;
}

async function _resolveThreshold(op) {
  if (!op.thresholdConfigKey) {
    return op.thresholdDefault ?? 0;
  }
  try {
    // require perezoso: evita un ciclo de carga con los módulos que dependen de dual-approval
    const systemGlobalConfigRepository = require('../repositories/system-global-config.repository');
    const cfg = await systemGlobalConfigRepository.findActive();
    const raw = cfg ? cfg[op.thresholdConfigKey] : null;
    if (raw === null || raw === undefined) {
      return op.thresholdDefault ?? 0;
    }
    return Number(raw);
  } catch (err) {
    logger.warn('[DualApproval] No se pudo leer umbral de SystemGlobalConfig — usando default', {
      error: err.message,
      configKey: op.thresholdConfigKey
    });
    return op.thresholdDefault ?? 0;
  }
}

function _assertApproverRole(op, roleName) {
  // Si no se conoce el rol (ctx incompleto) no se bloquea por rol; el RBAC de ruta ya filtró.
  if (!roleName) {
    return;
  }
  const allowed = new Set([...(op.approverRoles ?? []), ...WILDCARD_ROLES]);
  if (!allowed.has(roleName)) {
    throw AppError.forbidden('Tu rol no está autorizado a resolver esta operación', { code: 'DUAL_APPROVAL_ROLE_NOT_ALLOWED' });
  }
}

function _assertSegregation(request, approverUserId) {
  if (request.requested_by === approverUserId) {
    throw AppError.forbidden('El segundo aprobador no puede ser el mismo que originó la operación (segregación de funciones)', {
      code: 'DUAL_APPROVAL_SAME_AS_MAKER'
    });
  }
}

// Guarda en `result` solo datos serializables y acotados (evita persistir instancias Sequelize).
function _sanitizeResult(result) {
  if (result === null || result === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(result));
  } catch (_err) {
    return null;
  }
}

module.exports = new DualApprovalService();
module.exports.DualApprovalService = DualApprovalService;
