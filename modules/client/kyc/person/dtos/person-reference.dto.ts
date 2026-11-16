import kycModule = require('../../../../../shared/dtos/kyc');
const { PersonReferenceComponent } = kycModule;

const PersonReferenceDTO = (reference: Parameters<typeof PersonReferenceComponent.build>[0]) => PersonReferenceComponent.build(reference);

const PersonReferenceListDTO = (reference: Parameters<typeof PersonReferenceComponent.build>[0]) => PersonReferenceComponent.build(reference);

export = { PersonReferenceDTO, PersonReferenceListDTO };
