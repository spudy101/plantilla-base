import type { NextFunction, Request, Response } from 'express';
// === RF-OPS-01: Observabilidad — Declaración de acción de auditoría por route ===
//
// Permite que cada route declare QUÉ acción de auditoría representa, para que el
// middleware global de errores (error.middleware.js) audite ESA acción de dominio
// con outcome 'failure' cuando el handler explota — en vez de una acción genérica.
//
// El éxito se sigue auditando en el service (logAudit al final del flujo). Esto
// solo cubre el camino de error: si el controller/service lanza, queda un logAudit
// coherente con la misma acción que el éxito.
//
// Ubicación en la cadena: DESPUÉS de Auth/RBAC/RateLimit/Validator y JUSTO antes
// del Controller. Así los fallos pre-handler (401/403 auth/rbac, 429 rate-limit,
// 422 validación) conservan su acción genérica del mapeo de error.middleware.
//
//   router.post('/x',
//     AuthMiddleware.authenticate,
//     RbacMiddleware.requirePermission(...),
//     RateLimitMiddleware.apiLimiter(),
//     XValidator.create(),
//     ValidatorUtil.handleValidationErrors,
//     AuditAction.declare('X_CREATED', { entityType: 'X', entityTable: 'xs' }),
//     XController.create
//   );

class AuditAction {
  /**
   * Middleware declarativo: marca en res.locals la acción de auditoría que esta
   * route representa, para que el error middleware la use ante un fallo.
   *
   * @param {string} action                 - clave de AUDIT_ACTIONS (ej: 'PERSON_UPDATED')
   * @param {Object} [opts]
   * @param {string} [opts.entityType=null]  - modelo afectado (ej: 'Person')
   * @param {string} [opts.entityTable=null] - tabla en BD (ej: 'persons')
   * @returns {import('express').RequestHandler}
   */
  static declare(
    action: string,
    { entityType = null, entityTable = null }: { entityType?: string | null; entityTable?: string | null } = {}
  ) {
    return (req: Request, res: Response, next: NextFunction) => {
      res.locals.auditAction = { action, entityType, entityTable };
      next();
    };
  }
}

export = AuditAction;
