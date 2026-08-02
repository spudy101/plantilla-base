const { query } = require('express-validator');
const BaseValidator = require('../../../../shared/validators/base.validator');

const VALID_STATUSES = ['pending', 'processing', 'completed', 'partial_failure', 'failed'];
const VALID_CHANNELS = ['email', 'push', 'sms', 'all'];

class AdminNotificationDeliveryValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      query('processingStatus')
        .optional()
        .isIn(VALID_STATUSES)
        .withMessage({
          message: `processingStatus debe ser: ${VALID_STATUSES.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_STATUSES.join(', ')}`
        }),
      query('channel')
        .optional()
        .isIn(VALID_CHANNELS)
        .withMessage({
          message: `channel debe ser: ${VALID_CHANNELS.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_CHANNELS.join(', ')}`
        }),
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      ...BaseValidator.optionalIsoDate('from', 'from', 'query'),
      ...BaseValidator.optionalIsoDate('to', 'to', 'query'),
      query('onlyCritical')
        .optional()
        .isBoolean()
        .withMessage({
          message: 'onlyCritical debe ser true o false',
          hint: 'Enviá true para listar solo notificaciones críticas'
        })
        .toBoolean()
    ];
  }

  static metricsQuery() {
    return [
      ...BaseValidator.optionalUuidQuery('userId', 'El ID de usuario'),
      ...BaseValidator.optionalIsoDate('from', 'from', 'query'),
      ...BaseValidator.optionalIsoDate('to', 'to', 'query')
    ];
  }

  static retryBody() {
    return [
      ...BaseValidator.uuidParam('id', 'La notificación'),
      query('channel')
        .optional()
        .isIn(VALID_CHANNELS)
        .withMessage({
          message: `channel debe ser: ${VALID_CHANNELS.join(', ')}`,
          hint: `Indicá uno de los valores: ${VALID_CHANNELS.join(', ')}`
        })
    ];
  }
}

module.exports = AdminNotificationDeliveryValidator;
