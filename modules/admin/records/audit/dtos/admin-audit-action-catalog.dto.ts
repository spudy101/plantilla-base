// DTOs del catálogo de acciones de auditoría — todas las keys en camelCase.

type Counted<K extends string> = Record<K, string> & { actionsCount: number };

const CategoryDTO = (item: Counted<'category'>) => ({
  category: item.category,
  actionsCount: item.actionsCount
});

const RiskDTO = (item: Counted<'risk'>) => ({
  risk: item.risk,
  actionsCount: item.actionsCount
});

const ModuleDTO = (item: Counted<'module'>) => ({
  module: item.module,
  actionsCount: item.actionsCount
});

const ActionListDTO = (item: { action: string; description: string; category: string; risk: string; module?: string | null }) => ({
  action: item.action,
  description: item.description,
  category: item.category,
  risk: item.risk,
  module: item.module ?? null
});

export = { CategoryDTO, RiskDTO, ModuleDTO, ActionListDTO };
