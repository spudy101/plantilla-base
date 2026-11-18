// modules/admin/privacy-policy/routes/privacy-policy-admin.routes.ts

import express from 'express';
const router = express.Router();
import PrivacyPolicyAdminController from '../controllers/privacy-policy-admin.controller';
import PrivacyPolicyAdminValidator from '../validators/privacy-policy-admin.validator';
import BaseValidator from '../../../shared/http/base.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import RequestLockMiddleware from '../../../shared/http/request-lock.middleware';
import RbacMiddleware from '../../iam/middlewares/rbac.middleware';
import UploadMiddleware from '../../../shared/http/upload.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import rbacModule from '../../../shared/constants/rbac';
const { RBAC_MODULES, RBAC_ACTIONS } = rbacModule;

/**
 * GET /admin/api/privacy-policies
 * Lista paginada de versiones de política de privacidad.
 */
router.get(
  '/legal/privacy-policies',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PRIVACY_POLICIES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  PrivacyPolicyAdminValidator.listQuery(),
  ValidatorUtil.handleValidationErrors,
  PrivacyPolicyAdminController.listVersions
);

/**
 * GET /admin/api/privacy-policies/:privacyPolicyId
 * Detalle de una versión — incluye document_url (URL pública del PDF en CloudFront).
 */
router.get(
  '/legal/privacy-policies/:privacyPolicyId',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PRIVACY_POLICIES, RBAC_ACTIONS.READ),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  BaseValidator.uuidParam('privacyPolicyId', 'La política de privacidad'),
  ValidatorUtil.handleValidationErrors,
  PrivacyPolicyAdminController.getVersionDetail
);

/**
 * POST /admin/api/privacy-policies
 * Publica una nueva versión de la política.
 * Content-Type: multipart/form-data
 *
 * Body:
 *   policyDocument  (PDF, requerido)    — campo del archivo
 *   version         (string, requerido) — ej: "1.1", "2.0"
 *   summary         (string, opcional)  — resumen de cambios
 *   effectiveDate   (ISO 8601, opcional) — fecha de vigencia (default: ahora)
 */
router.post(
  '/legal/privacy-policies',
  AuthMiddleware.authenticate,
  RbacMiddleware.requirePermission(RBAC_MODULES.PRIVACY_POLICIES, RBAC_ACTIONS.CREATE),
  RateLimitMiddleware.apiLimiter(),
  RequestLockMiddleware.forAuthenticatedUsers(),
  UploadMiddleware.uploadFields([{ name: 'policyDocument', maxCount: 1 }], {
    maxFileSize: UploadMiddleware.MAX_DOCUMENT_SIZE
  }),
  UploadMiddleware.handleMulterError,
  PrivacyPolicyAdminValidator.createVersion(),
  ValidatorUtil.handleValidationErrors,
  PrivacyPolicyAdminController.createVersion
);

export default router;
