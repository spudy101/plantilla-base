import componentsAuditDtoModule from '../../../../../shared/dtos/audit/components-audit.dto';
const { UserConsentComponent } = componentsAuditDtoModule;

const UserConsentAuditItemDTO = (record: Parameters<typeof UserConsentComponent.build>[0]) => UserConsentComponent.build(record);

export default { UserConsentAuditItemDTO };
