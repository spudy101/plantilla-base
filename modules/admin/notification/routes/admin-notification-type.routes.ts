// modules/admin/kyc/routes/admin-notification-type.routes.ts

import express from 'express';
const router = express.Router();
import NotificationTypeController from '../controllers/admin-notification-type.controller';
import NotificationTypeValidator from '../validators/admin-notification-type.validator';
import BaseValidator from '../../../../shared/validators/base.validator';
import AuthMiddleware from '../../../../shared/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../../shared/middlewares/rate-limit.middleware';
import RequestLockMiddleware from '../../../../shared/middlewares/request-lock.middleware';
import RbacMiddleware from '../../../../shared/middlewares/rbac.middleware';
import ValidatorUtil from '../../../../shared/utils/validators.util';
import AuditAction from '../../../../shared/middlewares/audit-action.middleware';
import rbacModule from '../../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

/**
 * GET /admin/api/kyc/notification-types
 * Lista paginada de tipos de notificación con templates completos
 * (titleTemplate, bodyTemplate, emailSubjectTemplate, emailBodyTemplate).
 * Filtros: isActive, notificationCategoryId, priority.
 */
router.get(
  '/notification-types',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationTypeValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_TYPE_LIST_VIEWED', { entityType: 'NotificationType', entityTable: 'notification_types' }),
  NotificationTypeController.list
);

/**
 * POST /admin/api/kyc/notification-types/global
 * Envía una notificación global a todos los usuarios del sistema.
 * La notificación se encola (processingStatus: 'queued') y se procesa en background.
 * Nota: va antes de /:notificationTypeId para que Express no lo interprete como ID.
 *
 * Body: { titulo, contenido, asunto }
 */
router.post(
  '/notification-types/global',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationTypeValidator.createGlobalNotification(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('GLOBAL_NOTIFICATION_SENT', { entityType: 'GlobalNotification', entityTable: 'global_notifications' }),
  NotificationTypeController.createGlobalNotification
);

/**
 * POST /admin/api/kyc/notification-types/direct
 * Envía una notificación a un usuario específico (no global).
 * La notificación se encola (processingStatus: 'queued') y se procesa en background.
 * Nota: va antes de /:notificationTypeId para que Express no lo interprete como ID.
 *
 * Body: { userId, titulo, contenido, asunto }
 */
router.post(
  '/notification-types/direct',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  NotificationTypeValidator.createDirectNotification(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('DIRECT_NOTIFICATION_SENT', { entityType: 'Notification', entityTable: 'notifications' }),
  NotificationTypeController.createDirectNotification
);

/**
 * PATCH /admin/api/kyc/notification-types/:notificationTypeId
 * Actualiza los templates de un tipo de notificación existente.
 * Campos editables: name, description, priority, notificationCategoryId,
 * title_template, body_template, email_subject_template, email_body_template.
 * (Los canales — push/email/sms — y la criticidad viven en la categoría, no en el tipo.)
 *
 * Body: { [campo]: valor, ... } (todos opcionales — solo se actualizan los enviados)
 */
router.patch(
  '/notification-types/:notificationTypeId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.NOTIFICATION_MANAGEMENT, RBAC_ACTIONS.UPDATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('notificationTypeId', 'El tipo de notificación'),
  NotificationTypeValidator.update(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('NOTIFICATION_TYPE_UPDATED', { entityType: 'NotificationType', entityTable: 'notification_types' }),
  NotificationTypeController.update
);

export default router;
