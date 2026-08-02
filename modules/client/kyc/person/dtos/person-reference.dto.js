const { PersonReferenceComponent } = require('../../../../../shared/dtos/kyc');

const PersonReferenceDTO = reference => PersonReferenceComponent.build(reference);

const PersonReferenceListDTO = reference => PersonReferenceComponent.build(reference);

module.exports = { PersonReferenceDTO, PersonReferenceListDTO };
