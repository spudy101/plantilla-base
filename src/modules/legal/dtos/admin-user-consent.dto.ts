import auditModule from '../../audit';
const { auditComponentsDto: componentsAuditDtoModule } = auditModule;
const { UserConsentComponent } = componentsAuditDtoModule;

const UserConsentAuditItemDTO = (record: Parameters<typeof UserConsentComponent.build>[0]) => UserConsentComponent.build(record);

export default { UserConsentAuditItemDTO };
