import componentsAuditDtoModule = require('../../../../../shared/dtos/audit/components-audit.dto');
const { AuditAlertComponent } = componentsAuditDtoModule;

const AuditAlertListDTO = (record: Parameters<typeof AuditAlertComponent.build>[0]) => AuditAlertComponent.build(record);

export = { AuditAlertListDTO };
