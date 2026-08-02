/**
 * Calcula el diff entre el estado actual de una entidad y los datos entrantes.
 *
 * @param {Object} entity   - Instancia Sequelize o POJO con los valores actuales (snake_case)
 * @param {Object} data     - Datos entrantes del request (camelCase)
 * @param {Object} fieldMap - Mapeo { camelCaseKey: 'snake_case_column' }
 * @returns {{ before: Object, after: Object }} Solo los campos que efectivamente cambian.
 *
 * @example
 * const { before, after } = buildAuditDiff(role, data, {
 *   name: 'name',
 *   description: 'description',
 *   isActive: 'is_active'
 * });
 */
function buildAuditDiff(entity, data, fieldMap) {
  const before = {};
  const after = {};

  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
    if (data[camelKey] === undefined) {
      continue;
    }
    const currentValue = entity[snakeKey];
    const newValue = data[camelKey];
    if (currentValue !== newValue) {
      before[camelKey] = currentValue ?? null;
      after[camelKey] = newValue ?? null;
    }
  }

  return { before, after };
}

module.exports = { buildAuditDiff };
