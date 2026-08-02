const BaseValidator = require('../../../../shared/validators/base.validator');

// GET de catálogo de solo lectura sin entrada → validator placeholder (patrón rule-catalog).
class PromotionalBannerPublicValidator extends BaseValidator {
  static list() {
    return [];
  }
}

module.exports = PromotionalBannerPublicValidator;
