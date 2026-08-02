const { UserConsentComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');

const UserConsentAuditItemDTO = record => UserConsentComponent.build(record);

module.exports = { UserConsentAuditItemDTO };
