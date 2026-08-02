// modules/schemas/kyc/src/repositories/city.repository.js
const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { City } = require('../../../../../shared/models');

// Rango de diacríticos combinantes — para comparar nombres sin acentos ni mayúsculas
const DIACRITICS = /[̀-ͯ]/g;

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// El bureau manda la ciudad sucia: 'BOGOTA ( BOGOTA DISTRITO CA ) '. Tomamos lo que
// va antes del primer paréntesis y normalizamos → 'BOGOTA'.
function cleanCityName(value) {
  return normalizeName(String(value ?? '').split('(')[0]);
}

// Coincidencia por palabra completa: el nombre del catálogo aparece como token
// dentro del string limpio del bureau (evita falsos positivos por substring).
function containsCityToken(haystack, cityName) {
  if (!cityName) {
    return false;
  }
  return ` ${haystack} `.includes(` ${cityName} `);
}

class CityRepository extends BaseRepository {
  constructor() {
    super(City, {
      searchFields: ['name'],
      filterIdField: 'department_id',
      filterIdKey: 'departmentId',
      defaultInclude: [
        {
          association: 'department',
          attributes: ['department_id', 'name'],
          include: [{ association: 'country', attributes: ['country_id', 'name', 'code'] }]
        }
      ]
    });
  }

  /**
   * Resuelve una ciudad activa a partir del nombre (posiblemente sucio) que manda
   * el bureau, ej: 'BOGOTA ( BOGOTA DISTRITO CA ) '. Limpia el paréntesis, compara
   * sin acentos ni mayúsculas, y si no hay match exacto cae a coincidencia por
   * token. El catálogo es acotado; se compara en memoria (sin depender de unaccent).
   * El department_id se obtiene de la misma fila.
   *
   * @param {string} name - Nombre de ciudad del bureau (ej: 'BOGOTA ( ... )', 'PACORA')
   * @returns {Promise<City|null>}
   */
  async findActiveByNormalizedName(name) {
    const target = cleanCityName(name);
    if (!target) {
      return null;
    }
    const cities = await City.findAll({
      where: { is_active: true },
      attributes: ['city_id', 'name', 'department_id']
    });
    // 1) Match exacto sobre el nombre limpio
    const exact = cities.find(city => normalizeName(city.name) === target);
    if (exact) {
      return exact;
    }
    // 2) Fallback: el nombre del catálogo aparece como token dentro del string del bureau
    return cities.find(city => containsCityToken(target, normalizeName(city.name))) ?? null;
  }
}

module.exports = new CityRepository();
