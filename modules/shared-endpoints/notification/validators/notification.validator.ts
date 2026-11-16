import BaseValidator = require('../../../../shared/validators/base.validator');

class NotificationValidator {
  /** GET / | GET /personal | GET /global */
  static paginationQuery() {
    return [...BaseValidator.pagination(), ...BaseValidator.searchQuery()];
  }
}

export = NotificationValidator;
