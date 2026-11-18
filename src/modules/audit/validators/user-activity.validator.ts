import BaseValidator from '../../../shared/http/base.validator';

class UserActivityValidator extends BaseValidator {
  /** GET /audit/recent-activity — solo paginación; sin filtros de entrada. */
  static list() {
    return [...BaseValidator.pagination()];
  }
}

export default UserActivityValidator;
