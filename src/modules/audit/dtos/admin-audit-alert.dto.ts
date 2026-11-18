import componentsAuditDtoModule from './audit-components.dto';
const { AuditAlertComponent } = componentsAuditDtoModule;

const AuditAlertListDTO = (record: Parameters<typeof AuditAlertComponent.build>[0]) => AuditAlertComponent.build(record);

export default { AuditAlertListDTO };
