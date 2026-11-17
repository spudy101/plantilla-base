import componentsAuditDtoModule = require('../../../../../shared/dtos/audit/components-audit.dto');
const { AuditLogComponent } = componentsAuditDtoModule;

const AuditLogListDTO = (record: Parameters<typeof AuditLogComponent.buildList>[0]) => AuditLogComponent.buildList(record);
const AuditLogDTO = (record: Parameters<typeof AuditLogComponent.buildDetail>[0]) => AuditLogComponent.buildDetail(record);

export = { AuditLogListDTO, AuditLogDTO };
