// Validator placeholder del webhook de bounces. El cuerpo llega como texto crudo (SNS manda
// Content-Type text/plain) y su integridad se valida por FIRMA SNS en el service, no por
// express-validator. Se mantiene el archivo por el patrón de 5 capas.
class EmailBounceWebhookValidator {
  static webhook() {
    return [];
  }
}

module.exports = EmailBounceWebhookValidator;
