import type definePersonReference = require('../../../../schemas/kyc/person/models/person-reference.model');
// modules/client/kyc/services/person-reference.service.ts

import AppError = require('../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logAudit } = loggerUtilModule;
import requestContext = require('../../../../../shared/utils/request-context.util');
import personReferenceRepository = require('../../../../schemas/kyc/person/repositories/person-reference.repository');
import personReferenceDtoModule = require('../dtos/person-reference.dto');
const { PersonReferenceDTO, PersonReferenceListDTO } = personReferenceDtoModule;

const MAX_REFERENCES_PER_PERSON = 5;

class PersonReferenceService {
  personReferenceRepository: typeof personReferenceRepository;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new PersonReferenceService({ personReferenceRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: PersonReferenceService.Deps = {}) {
    this.personReferenceRepository = deps.personReferenceRepository ?? personReferenceRepository;
  }

  async list(personId: string, userId: string) {
    const references = await this.personReferenceRepository.findAllByPersonId(personId);
    logAudit(
      'PROFILE_REFERENCES_VIEWED',
      userId,
      { count: references.length },
      { entityType: 'PersonReference', entityTable: 'person_references' }
    );
    return references.map(r => PersonReferenceListDTO(r));
  }

  async create(data: PersonReferenceService.ReferenceInput, personId: string, userId: string) {
    const existing = await this.personReferenceRepository.findAllByPersonId(personId);
    if (existing.length >= MAX_REFERENCES_PER_PERSON) {
      throw AppError.badRequest(`No puede agregar más de ${MAX_REFERENCES_PER_PERSON} referencias`);
    }

    const reference = await this.personReferenceRepository.create({
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

  async update(referenceId: string, data: Partial<PersonReferenceService.ReferenceInput>, personId: string, userId: string) {
    const reference = await this.personReferenceRepository.findActiveById(referenceId, personId);
    if (!reference) {
      throw AppError.notFound('Referencia no encontrada');
    }

    const updated = await this.personReferenceRepository.update(referenceId, {
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

  async remove(referenceId: string, personId: string, userId: string) {
    const reference = await this.personReferenceRepository.findActiveById(referenceId, personId);
    if (!reference) {
      throw AppError.notFound('Referencia no encontrada');
    }

    await this.personReferenceRepository.update(referenceId, { is_active: false });
    logAudit(
      'PROFILE_REFERENCE_DELETED',
      userId,
      {},
      { entityId: referenceId, entityType: 'PersonReference', entityTable: 'person_references' }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace PersonReferenceService {
  export interface ReferenceInput {
    referenceName: string;
    referencePhone: string;
    referenceType: definePersonReference.Attributes['reference_type'];
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    personReferenceRepository?: typeof personReferenceRepository;
  }
}

export = Object.assign(new PersonReferenceService(), { PersonReferenceService });
