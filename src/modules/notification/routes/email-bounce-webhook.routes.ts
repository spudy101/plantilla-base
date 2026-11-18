// Ruta inbound del webhook de bounces de SES (vía SNS).
//
// La llama AWS SNS (no un usuario) → sin AuthMiddleware.authenticate ni RBAC. Se autentica por apikey
// en query (externalWebhookAuthenticate) y, sobre todo, por la FIRMA del mensaje SNS (verificada en el
// service). SNS envía Content-Type text/plain → el express.json global NO lo parsea, por eso se captura
// el body como texto crudo con express.text en la propia ruta.

import express from 'express';

const router = express.Router();
import EmailBounceWebhookController from '../controllers/email-bounce-webhook.controller';
import EmailBounceWebhookValidator from '../validators/email-bounce-webhook.validator';
import AuthMiddleware from '../../iam/middlewares/auth.middleware';
import RateLimitMiddleware from '../../../shared/http/rate-limit.middleware';
import ValidatorUtil from '../../../shared/http/validators.util';
import AuditAction from '../../audit/middlewares/audit-action.middleware';

const WEBHOOK_BODY_LIMIT = '256kb';

// POST /notification/email-bounces/webhook — feed asíncrono de bounces de SES.
router.post(
  '/email-bounces/webhook',
  express.text({ type: '*/*', limit: WEBHOOK_BODY_LIMIT }),
  AuthMiddleware.externalWebhookAuthenticate,
  RateLimitMiddleware.apiLimiter(),
  EmailBounceWebhookValidator.webhook(),
  ValidatorUtil.handleValidationErrors,
  AuditAction.declare('EMAIL_BOUNCE_WEBHOOK_RECEIVED', {
    entityType: 'EmailBounceSuppression',
    entityTable: 'email_bounce_suppressions'
  }),
  EmailBounceWebhookController.process
);

export default router;
