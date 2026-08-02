// DTOs del catálogo de acciones de auditoría — todas las keys en camelCase.

const CategoryDTO = item => ({
  category: item.category,
  actionsCount: item.actionsCount
});

const RiskDTO = item => ({
  risk: item.risk,
  actionsCount: item.actionsCount
});

const ModuleDTO = item => ({
  module: item.module,
  actionsCount: item.actionsCount
});

const ActionListDTO = item => ({
  action: item.action,
  description: item.description,
  category: item.category,
  risk: item.risk,
  module: item.module ?? null
});

module.exports = { CategoryDTO, RiskDTO, ModuleDTO, ActionListDTO };
