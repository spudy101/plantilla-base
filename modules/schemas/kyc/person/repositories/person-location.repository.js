const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { PersonLocation } = require('../../../../../shared/models');
const requestContext = require('../../../../../shared/utils/request-context.util');

class PersonLocationRepository extends BaseRepository {
  constructor() {
    super(PersonLocation);
  }

  /**
   * Busca ubicación por person_id con todas las relaciones
   */
  findByPersonId(personId) {
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
  findByPersonIdMinimal(personId) {
    return this.findOne({ person_id: personId });
  }

  /**
   * Crea o actualiza ubicación de persona
   */
  async upsertByPersonId(personId, locationData, options = {}) {
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

  // Override para usar person_location_id con relaciones
  findById(personLocationId, options = {}) {
    const defaultOptions = {
      include: [{ association: 'country' }, { association: 'city' }, { association: 'department' }]
    };

    return this.model.findByPk(personLocationId, { ...defaultOptions, ...options });
  }

  // Override delete para usar person_location_id
  // Misma firma que BaseRepository.delete(id, options) — SOLID: L (no se pierde la transacción)
  delete(personLocationId, options = {}) {
    return this.model.destroy({ where: { person_location_id: personLocationId }, ...options });
  }
}

module.exports = new PersonLocationRepository();
