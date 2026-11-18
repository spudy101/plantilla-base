import { query } from 'express-validator';
import BaseValidator from '../../../shared/http/base.validator';
import domainEnumsModule from '../../../shared/constants/domain-enums';
const {
  INTEGRATION_PRODUCTS: PRODUCTS,
  INTEGRATION_RESULTS: RESULTS
} = domainEnumsModule;

class IntegrationMonitoringValidator {
  static dashboardQuery() {
    return [
      ...BaseValidator.optionalIsoDate('from', 'La fecha desde'),
      ...BaseValidator.optionalIsoDate('to', 'La fecha hasta')
    ];
  }

  static logsQuery() {
    return [
      query('product').optional().isIn(PRODUCTS).withMessage({
        message: `product debe ser uno de: ${PRODUCTS.join(', ')}`,
        hint: `Valores válidos: ${PRODUCTS.join(', ')}`
      }),
      query('result').optional().isIn(RESULTS).withMessage({
        message: `result debe ser uno de: ${RESULTS.join(', ')}`,
        hint: `Valores válidos: ${RESULTS.join(', ')}`
      }),
      ...BaseValidator.optionalUuidQuery('userId', 'El usuario'),
      ...BaseValidator.optionalUuidQuery('sessionId', 'La sesión'),
      ...BaseValidator.optionalIsoDate('from', 'La fecha desde'),
      ...BaseValidator.optionalIsoDate('to', 'La fecha hasta'),
      ...BaseValidator.pagination()
    ];
  }

  static logIdParam() {
    return [...BaseValidator.uuidParam('apiLogId', 'El registro de llamada')];
  }

  static fallbackQuery() {
    return [
      query('provider').optional().isString().trim().isLength({ max: 50 }),
      query('activeOnly').optional().isBoolean().withMessage({
        message: 'activeOnly debe ser booleano',
        hint: 'Usá true o false'
      }),
      ...BaseValidator.optionalIsoDate('from', 'La fecha desde'),
      ...BaseValidator.optionalIsoDate('to', 'La fecha hasta'),
      ...BaseValidator.pagination()
    ];
  }
}

export default IntegrationMonitoringValidator;
