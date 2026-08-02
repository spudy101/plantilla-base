// modules/client/kyc/services/person-reference.service.js

const AppError = require('../../../../../shared/utils/app-error.util');
const { logAudit } = require('../../../../../shared/utils/logger.util');
const requestContext = require('../../../../../shared/utils/request-context.util');
const personReferenceRepository = require('../../../../schemas/kyc/person/repositories/person-reference.repository');
const { PersonReferenceDTO, PersonReferenceListDTO } = require('../dtos/person-reference.dto');

const MAX_REFERENCES_PER_PERSON = 5;

class PersonReferenceService {
  async list(personId, userId) {
    const references = await personReferenceRepository.findAllByPersonId(personId);
    logAudit(
      'PROFILE_REFERENCES_VIEWED',
      userId,
      { count: references.length },
      { entityType: 'PersonReference', entityTable: 'person_references' }
    );
    return references.map(r => PersonReferenceListDTO(r));
  }

  async create(data, personId, userId) {
    const existing = await personReferenceRepository.findAllByPersonId(personId);
    if (existing.length >= MAX_REFERENCES_PER_PERSON) {
      throw AppError.badRequest(`No puede agregar más de ${MAX_REFERENCES_PER_PERSON} referencias`);
    }

    const reference = await personReferenceRepository.create({
      person_id: personId,
      reference_name: data.referenceName,
      reference_phone: data.referencePhone,
      reference_type: data.referenceType,
      ...requestContext.originFromContext()
    });

    logAudit(
      'PROFILE_REFERENCE_CREATED',
      userId,
      {},
      { entityId: reference.person_reference_id, entityType: 'PersonReference', entityTable: 'person_references' }
    );
    return PersonReferenceDTO(reference);
  }

  async update(referenceId, data, personId, userId) {
    const reference = await personReferenceRepository.findActiveById(referenceId, personId);
    if (!reference) {
      throw AppError.notFound('Referencia no encontrada');
    }

    const updated = await personReferenceRepository.update(referenceId, {
      reference_name: data.referenceName,
      reference_phone: data.referencePhone,
      reference_type: data.referenceType
    });

    logAudit(
      'PROFILE_REFERENCE_UPDATED',
      userId,
      {
        before: {
          referenceName: reference.reference_name,
          referencePhone: reference.reference_phone,
          referenceType: reference.reference_type
        },
        after: {
          referenceName: data.referenceName ?? reference.reference_name,
          referencePhone: data.referencePhone ?? reference.reference_phone,
          referenceType: data.referenceType ?? reference.reference_type
        }
      },
      { entityId: referenceId, entityType: 'PersonReference', entityTable: 'person_references' }
    );
    return PersonReferenceDTO(updated);
  }

  async remove(referenceId, personId, userId) {
    const reference = await personReferenceRepository.findActiveById(referenceId, personId);
    if (!reference) {
      throw AppError.notFound('Referencia no encontrada');
    }

    await personReferenceRepository.update(referenceId, { is_active: false });
    logAudit(
      'PROFILE_REFERENCE_DELETED',
      userId,
      {},
      { entityId: referenceId, entityType: 'PersonReference', entityTable: 'person_references' }
    );
  }
}

module.exports = new PersonReferenceService();
