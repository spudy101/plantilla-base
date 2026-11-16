// shared/types/audit-context.ts
//
// Contexto de auditoría de una acción administrativa: quién la hace y desde dónde. Lo arman los
// controllers admin a partir de req.user + res.locals.auditContext y viaja hasta los services
// (logAudit, user_change_logs, doble aprobación).

export interface AdminAuditContext {
  adminUserId: string;
  adminRoleName?: string | null;
  adminFirstName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}
