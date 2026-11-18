import componentsAuditDtoModule from '../../audit/dtos/audit-components.dto';
const { UserConsentComponent } = componentsAuditDtoModule;

const MyConsentDTO = (record: Parameters<typeof UserConsentComponent.buildForClient>[0]) => UserConsentComponent.buildForClient(record);

const MyConsentCatalogDTO = (
  consentType: Parameters<typeof UserConsentComponent.buildClientCatalogItem>[0],
  record: Parameters<typeof UserConsentComponent.buildClientCatalogItem>[1]
) => UserConsentComponent.buildClientCatalogItem(consentType, record);

const ConsentGrantedDTO = (record: Parameters<typeof UserConsentComponent.buildGranted>[0]) => UserConsentComponent.buildGranted(record);

export default { MyConsentDTO, MyConsentCatalogDTO, ConsentGrantedDTO };
