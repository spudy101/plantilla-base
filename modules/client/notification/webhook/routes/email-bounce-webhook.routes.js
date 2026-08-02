// Ruta inbound del webhook de bounces de SES (vía SNS).
//
// La llama AWS SNS (no un usuario) → sin AuthMiddleware.authenticate ni RBAC. Se autentica por apikey
// en query (externalWebhookAuthenticate) y, sobre todo, por la FIRMA del mensaje SNS (verificada en el
// service). SNS envía Content-Type text/plain → el express.json global NO lo parsea, por eso se captura
// el body como texto crudo con express.text en la propia ruta.

const express = require('express');

const router = express.Router();
const EmailBounceWebhookController = require('../controllers/email-bounce-webhook.controller');
const EmailBounceWebhookValidator = require('../validators/email-bounce-webhook.validator');
const AuthMiddleware = require('../../../../../shared/middlewares/auth.middleware');
const RateLimitMiddleware = require('../../../../../shared/middlewares/rate-limit.middleware');
const ValidatorUtil = require('../../../../../shared/utils/validators.util');
const AuditAction = require('../../../../../shared/middlewares/audit-action.middleware');

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

module.exports = router;
