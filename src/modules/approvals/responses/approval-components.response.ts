// Componentes shared del framework de doble aprobación global (approval_requests).
// Todas las keys de respuesta en camelCase.

import type { DbDate, Maybe } from '../../../shared/types/db-rows';

/** Usuario incluido en la solicitud (Prisma): firstName/lastName viven en Person. */
interface ApprovalUserRow {
  userId: string;
  username?: Maybe<string>;
  person?: Maybe<{ firstName?: Maybe<string>; lastName?: Maybe<string> }>;
}

/** Fila de approval_requests con sus asociaciones (requester / secondApprover). */
interface ApprovalRequestRow {
  approvalRequestId: string;
  operationKey: string;
  entityType?: Maybe<string>;
  entityId?: Maybe<string>;
  status: string;
  requester?: Maybe<ApprovalUserRow>;
  requestedAt?: Maybe<DbDate>;
  secondApprover?: Maybe<ApprovalUserRow>;
  resolvedAt?: Maybe<DbDate>;
  resolutionNotes?: Maybe<string>;
  expiresAt?: Maybe<DbDate>;
  payload?: unknown;
  result?: unknown;
  originSessionId?: Maybe<string>;
  createdAt?: Maybe<DbDate>;
  updatedAt?: Maybe<DbDate>;
}

function _userRef(user: Maybe<ApprovalUserRow>) {
  if (!user) {
    return null;
  }
  return {
    userId: user.userId,
    username: user.username ?? null,
    firstName: user.person?.firstName ?? null,
    lastName: user.person?.lastName ?? null
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
      approvalRequestId: request.approvalRequestId,
      operationKey: request.operationKey,
      entityType: request.entityType ?? null,
      entityId: request.entityId ?? null,
      status: request.status,
      requestedBy: _userRef(request.requester),
      requestedAt: request.requestedAt ?? null,
      secondApprover: _userRef(request.secondApprover),
      resolvedAt: request.resolvedAt ?? null,
      resolutionNotes: request.resolutionNotes ?? null,
      expiresAt: request.expiresAt ?? null,
      payload: request.payload ?? null,
      result: request.result ?? null,
      // Sesión del maker que abrió la solicitud. Solo en el detalle (admin); el listado no lo lleva.
      originSessionId: request.originSessionId ?? null,
      createdAt: request.createdAt ?? null,
      updatedAt: request.updatedAt ?? null
    };
  }

  // Item de listado — sin payload/result (más liviano).
  static buildList(request: Maybe<ApprovalRequestRow>) {
    if (!request) {
      return null;
    }
    return {
      approvalRequestId: request.approvalRequestId,
      operationKey: request.operationKey,
      entityType: request.entityType ?? null,
      entityId: request.entityId ?? null,
      status: request.status,
      requestedBy: _userRef(request.requester),
      requestedAt: request.requestedAt ?? null,
      secondApprover: _userRef(request.secondApprover),
      resolvedAt: request.resolvedAt ?? null,
      expiresAt: request.expiresAt ?? null,
      createdAt: request.createdAt ?? null
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
      approvalRequestId: request.approvalRequestId,
      operationKey: request.operationKey,
      status: request.status,
      requestedBy: _userRef(request.requester),
      requestedAt: request.requestedAt ?? null,
      expiresAt: request.expiresAt ?? null
    };
  }
}

export default {
  ApprovalRequestComponent,
  PendingApprovalComponent
};
