const { body, query } = require('express-validator');
const BaseValidator = require('../../../../shared/validators/base.validator');
const { DUAL_APPROVAL_OPS } = require('../../../../shared/constants/dual-approval');

const OPERATION_KEYS = Object.keys(DUAL_APPROVAL_OPS);
const STATUS_VALUES = ['pending', 'approved', 'rejected', 'expired'];
const DECISION_VALUES = ['approve', 'reject'];

class ApprovalRequestValidator {
  static listQuery() {
    return [
      ...BaseValidator.pagination(),
      ...BaseValidator.searchQuery(),
      query('operationKey')
        .optional()
        .trim()
        .isIn(OPERATION_KEYS)
        .withMessage({ message: 'operationKey inválido', hint: `Indicá uno de: ${OPERATION_KEYS.join(', ')}` }),
      query('status')
        .optional()
        .trim()
        .isIn(STATUS_VALUES)
        .withMessage({ message: 'status inválido', hint: `Indicá uno de: ${STATUS_VALUES.join(', ')}` }),
      query('entityType')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage({ message: 'entityType inválido', hint: 'Usá hasta 100 caracteres' })
    ];
  }

  static idParam() {
    return [...BaseValidator.uuidParam('id', 'La solicitud de aprobación')];
  }

  static resolve() {
    return [
      ...BaseValidator.uuidParam('id', 'La solicitud de aprobación'),
      body('decision')
        .notEmpty()
        .withMessage({ message: 'La decisión es requerida', hint: `Indicá uno de: ${DECISION_VALUES.join(', ')}` })
        .isIn(DECISION_VALUES)
        .withMessage({
          message: 'La decisión debe ser "approve" o "reject"',
          hint: `Indicá uno de: ${DECISION_VALUES.join(', ')}`
        }),
      body('notes')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 2000 })
        .withMessage({ message: 'Las notas no pueden superar 2000 caracteres', hint: 'Usá hasta 2000 caracteres' })
    ];
  }
}

module.exports = ApprovalRequestValidator;
