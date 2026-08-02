// Ack del webhook de bounces (respuesta a SNS). No expone datos del rebote.
class EmailBounceWebhookAckDTO {
  constructor(result) {
    this.type = result.type;
    this.confirmed = result.confirmed ?? false;
    this.processed = result.processed ?? 0;
    this.suppressed = result.suppressed ?? 0;
  }
}

module.exports = { EmailBounceWebhookAckDTO };
