// Componentes shared del framework de doble aprobación global (approval_requests).
// Todas las keys de respuesta en camelCase.

import type { DbDate, Maybe, UserRefRow } from '../../types/db-rows';

/** Fila de approval_requests con sus asociaciones (requester / secondApprover). */
interface ApprovalRequestRow {
  approval_request_id: string;
  operation_key: string;
  entity_type?: Maybe<string>;
  entity_id?: Maybe<string>;
  status: string;
  requester?: Maybe<UserRefRow>;
  requested_at?: Maybe<DbDate>;
  secondApprover?: Maybe<UserRefRow>;
  resolved_at?: Maybe<DbDate>;
  resolution_notes?: Maybe<string>;
  expires_at?: Maybe<DbDate>;
  payload?: unknown;
  result?: unknown;
  origin_session_id?: Maybe<string>;
  created_at?: Maybe<DbDate>;
  updated_at?: Maybe<DbDate>;
}

function _userRef(user: Maybe<UserRefRow>) {
  if (!user) {
    return null;
  }
  return {
    userId: user.user_id,
    username: user.username ?? null,
    firstName: user.person?.first_name ?? null,
    lastName: user.person?.last_name ?? null
  };
}

// ============================================================
// APPROVAL REQUEST
// ============================================================

class ApprovalRequestComponent {
  static build(request: Maybe<ApprovalRequestRow>) {
    if (!request) {
      return null;
    }
    return {
      approvalRequestId: request.approval_request_id,
      operationKey: request.operation_key,
      entityType: request.entity_type ?? null,
      entityId: request.entity_id ?? null,
      status: request.status,
      requestedBy: _userRef(request.requester),
      requestedAt: request.requested_at ?? null,
      secondApprover: _userRef(request.secondApprover),
      resolvedAt: request.resolved_at ?? null,
      resolutionNotes: request.resolution_notes ?? null,
      expiresAt: request.expires_at ?? null,
      payload: request.payload ?? null,
      result: request.result ?? null,
      // Sesión del maker que abrió la solicitud. Solo en el detalle (admin); el listado no lo lleva.
      originSessionId: request.origin_session_id ?? null,
      createdAt: request.created_at ?? null,
      updatedAt: request.updated_at ?? null
    };
  }

  // Item de listado — sin payload/result (más liviano).
  static buildList(request: Maybe<ApprovalRequestRow>) {
    if (!request) {
      return null;
    }
    return {
      approvalRequestId: request.approval_request_id,
      operationKey: request.operation_key,
      entityType: request.entity_type ?? null,
      entityId: request.entity_id ?? null,
      status: request.status,
      requestedBy: _userRef(request.requester),
      requestedAt: request.requested_at ?? null,
      secondApprover: _userRef(request.secondApprover),
      resolvedAt: request.resolved_at ?? null,
      expiresAt: request.expires_at ?? null,
      createdAt: request.created_at ?? null
    };
  }
}

// ============================================================
// PENDING APPROVAL — anotación en listados de otros módulos (badge)
// ============================================================

class PendingApprovalComponent {
  static build(request: Maybe<ApprovalRequestRow>) {
    if (!request) {
      return null;
    }
    return {
      approvalRequestId: request.approval_request_id,
      operationKey: request.operation_key,
      status: request.status,
      requestedBy: _userRef(request.requester),
      requestedAt: request.requested_at ?? null,
      expiresAt: request.expires_at ?? null
    };
  }
}

export = {
  ApprovalRequestComponent,
  PendingApprovalComponent
};
