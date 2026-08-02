// Controller del webhook inbound de bounces de SES (vía SNS). Lo llama SNS (no un usuario).
// Responde 200 con un ack. Sin lógica de negocio.

const EmailBounceWebhookService = require('../services/email-bounce-webhook.service');
const { EmailBounceWebhookAckDTO } = require('../dtos/email-bounce-webhook.dto');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class EmailBounceWebhookController {
  /** POST /notification/email-bounces/webhook */
  process = asyncHandler(async (req, res) => {
    const result = await EmailBounceWebhookService.process(req.body);
    return ApiResponse.success(res, 'Webhook de bounces recibido', new EmailBounceWebhookAckDTO(result));
  });
}

module.exports = new EmailBounceWebhookController();
