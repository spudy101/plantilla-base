// shared/middlewares/rbac.middleware.js
//
// ============================================================================
// RbacMiddleware — control de acceso por módulo/acción (RF-ADM-01)
// ============================================================================
//
// Devuelve HTTP 403 ante acceso no autorizado (criterio de aceptación #3).
//
// IMPORTANTE — orden en la cadena de rutas:
//   Este middleware asume que el request YA está autenticado, es decir, que
//   `AuthMiddleware.authenticate` (o `requireRole`) corrió antes y dejó
//   `req.user` con `roleName`. Uso típico:
//
//     router.post('/recurso',
//       AuthMiddleware.authenticate,
//       RbacMiddleware.requirePermission(RBAC_MODULES.INTERNAL_USERS, RBAC_ACTIONS.CREATE),
//       ...validator, handleValidationErrors, Controller.create
//     );
//
// La autorización REAL vive aquí (servidor). Los endpoints de catálogo que
// consume el front son solo para ocultar vistas, nunca la barrera de seguridad.

const RbacService = require('../services/rbac.service');
const AppError = require('../utils/app-error.util');
const { logger } = require('../utils/logger.util');
const { MFA_REQUIRED_ROLES, MFA_NOT_ACTIVE_LOG_MSG } = require('../constants');
const { isMfaActive } = require('../utils/mfa-status.util');

class RbacMiddleware {
  /**
   * Exige que el rol del usuario autenticado tenga `action` sobre `moduleName`.
   * Además aplica el gate de 2FA (RF-ADM-01 #6): si el rol requiere MFA y el
   * usuario no lo tiene activo, devuelve 403 con código MFA_REQUIRED.
   *
   * @param {string} moduleName - uno de RBAC_MODULES
   * @param {string} action     - una de RBAC_ACTIONS
   * @returns {Function} middleware express
   */
  static requirePermission(moduleName, action) {
    return async (req, res, next) => {
      try {
        const roleName = req.user?.roleName;

        if (!roleName) {
          // Sin rol no se puede autorizar. Que authenticate haya corrido antes.
          return next(AppError.unauthorized('Token sin rol asignado'));
        }

        if (!(await RbacService.can(roleName, moduleName, action))) {
          logger.info('RBAC — acceso denegado', {
            userId: req.user.userId,
            roleName,
            module: moduleName,
            action,
            path: req.originalUrl
          });
          return next(AppError.forbidden('No tienes permisos para realizar esta acción'));
        }

        // Gate de 2FA para roles privilegiados.
        if (MFA_REQUIRED_ROLES.includes(roleName) && !(await isMfaActive(req.user.userId))) {
          logger.info(MFA_NOT_ACTIVE_LOG_MSG, {
            userId: req.user.userId,
            roleName,
            path: req.originalUrl
          });
          return next(
            AppError.forbidden('Debes activar la autenticación de dos factores (2FA) para realizar esta acción', {
              code: 'MFA_REQUIRED'
            })
          );
        }

        return next();
      } catch (error) {
        return next(error);
      }
    };
  }
}

module.exports = RbacMiddleware;
