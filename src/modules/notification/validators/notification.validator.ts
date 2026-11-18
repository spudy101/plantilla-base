import BaseValidator from '../../../shared/http/base.validator';

class NotificationValidator {
  /** GET / | GET /personal | GET /global */
  static paginationQuery() {
    return [...BaseValidator.pagination(), ...BaseValidator.searchQuery()];
  }
}

export default NotificationValidator;
