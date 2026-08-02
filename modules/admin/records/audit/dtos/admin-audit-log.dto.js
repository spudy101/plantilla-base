const { AuditLogComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');

const AuditLogListDTO = record => AuditLogComponent.buildList(record);
const AuditLogDTO = record => AuditLogComponent.buildDetail(record);

module.exports = { AuditLogListDTO, AuditLogDTO };
