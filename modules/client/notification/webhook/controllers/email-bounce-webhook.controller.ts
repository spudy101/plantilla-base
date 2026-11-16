// Controller del webhook inbound de bounces de SES (vía SNS). Lo llama SNS (no un usuario).
// Responde 200 con un ack. Sin lógica de negocio.

import EmailBounceWebhookService = require('../services/email-bounce-webhook.service');
import emailBounceWebhookDtoModule = require('../dtos/email-bounce-webhook.dto');
const { EmailBounceWebhookAckDTO } = emailBounceWebhookDtoModule;
import ApiResponse = require('../../../../../shared/utils/app-response.util');
import errorMiddlewareModule = require('../../../../../shared/middlewares/error.middleware');
const { asyncHandler } = errorMiddlewareModule;

class EmailBounceWebhookController {
  /** POST /notification/email-bounces/webhook */
  process = asyncHandler(async (req, res) => {
    const result = await EmailBounceWebhookService.process(req.body);
    return ApiResponse.success(res, 'Webhook de bounces recibido', new EmailBounceWebhookAckDTO(result));
  });
}

export = new EmailBounceWebhookController();
