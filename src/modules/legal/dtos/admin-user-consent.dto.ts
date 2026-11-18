import componentsAuditDtoModule from '../../audit/dtos/audit-components.dto';
const { UserConsentComponent } = componentsAuditDtoModule;

const UserConsentAuditItemDTO = (record: Parameters<typeof UserConsentComponent.build>[0]) => UserConsentComponent.build(record);

export default { UserConsentAuditItemDTO };
