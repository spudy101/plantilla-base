const { UserConsentComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');

const MyConsentDTO = record => UserConsentComponent.buildForClient(record);

const MyConsentCatalogDTO = (consentType, record) => UserConsentComponent.buildClientCatalogItem(consentType, record);

const ConsentGrantedDTO = record => UserConsentComponent.buildGranted(record);

module.exports = { MyConsentDTO, MyConsentCatalogDTO, ConsentGrantedDTO };
