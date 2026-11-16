import BaseRepository = require('../../../../../shared/repositories/base.repository');
import modelsModule = require('../../../../../shared/models');
const { PersonLocation } = modelsModule;
import requestContext = require('../../../../../shared/utils/request-context.util');
import type { CreateOptions } from 'sequelize';
import type definePersonLocation = require('../models/person-location.model');

class PersonLocationRepository extends BaseRepository<definePersonLocation.Instance> {
  constructor() {
    super(PersonLocation);
  }

  /**
   * Busca ubicación por person_id con todas las relaciones
   */
  findByPersonId(personId: string) {
    return this.findOne(
      {
        person_id: personId
      },
      {
        include: [{ association: 'country' }, { association: 'city' }, { association: 'department' }]
      }
    );
  }

  /**
   * Busca ubicación por person_id sin relaciones (para operaciones que no las necesitan)
   */
  findByPersonIdMinimal(personId: string) {
    return this.findOne({ person_id: personId });
  }

  /**
   * Crea o actualiza ubicación de persona
   */
  async upsertByPersonId(
    personId: string,
    locationData: Omit<definePersonLocation.CreationAttributes, 'person_location_id' | 'person_id'>,
    options: CreateOptions<definePersonLocation.Attributes> = {}
  ) {
    const existing = await this.findByPersonIdMinimal(personId);

    if (existing) {
      return existing.update(locationData, options);
    }

    // Solo en la rama de creación: una actualización posterior de la ubicación no debe pisar
    // el origen de la captura original.
    return this.create(
      {
        person_id: personId,
        ...locationData,
        ...requestContext.originFromContext()
      },
      options
    );
  }

  /**
   * Anonimiza la dirección física de una persona (Ley 1581/2012 — eliminación de cuenta).
   * Conserva departamento/ciudad para estadística agregada.
   */
  anonymizeAddressByPersonId(personId: string, options = {}) {
    return this.bulkUpdate({ address: 'ELIMINADO', postal_code: null }, { person_id: personId }, options);
  }

  // Override para usar person_location_id con relaciones
  override findById(personLocationId: string, options = {}) {
    const defaultOptions = {
      include: [{ association: 'country' }, { association: 'city' }, { association: 'department' }]
    };

    return this.model.findByPk(personLocationId, { ...defaultOptions, ...options });
  }

  // Override delete para usar person_location_id
  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  override delete(personLocationId: string, options = {}) {
    return this.model.destroy({ where: { person_location_id: personLocationId }, ...options });
  }
}

export = new PersonLocationRepository();
