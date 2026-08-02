const { AuditAlertComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');

const AuditAlertListDTO = record => AuditAlertComponent.build(record);

module.exports = { AuditAlertListDTO };
