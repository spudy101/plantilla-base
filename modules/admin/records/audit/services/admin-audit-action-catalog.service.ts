import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logAudit } = loggerUtilModule;
import PaginationHelper = require('../../../../../shared/utils/pagination.util');
import componentsCatalogDtoModule = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const { MetadataDTO } = componentsCatalogDtoModule;
import auditactionsModule = require('../../../../../shared/constants/auditActions');
const {
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_RISK_ORDER,
  AUDIT_MODULES
} = auditactionsModule;
import adminAuditActionCatalogDtoModule = require('../dtos/admin-audit-action-catalog.dto');
const { CategoryDTO, RiskDTO, ModuleDTO, ActionListDTO } = adminAuditActionCatalogDtoModule;

/** Acción del catálogo de auditoría (clave + definición). */
interface CatalogAction {
  action: string;
  description: string;
  category: string;
  risk: string;
  module?: string | null;
}

// Entidad lógica (catálogo en memoria, sin tabla) — para trazabilidad de auditoría.
const AUDIT_ENTITY = { entityType: 'AuditActionCatalog', entityTable: null };

class AdminAuditActionCatalogService {
  // GET /api/audit-action-catalog/categories
  getCategories(adminUserId: string) {
    const counts = _countBy('category');
    const data = Object.values(AUDIT_CATEGORIES)
      .map(category => ({ category, actionsCount: counts[category] ?? 0 }))
      .sort((a, b) => a.category.localeCompare(b.category, 'es'));

    logAudit('AUDIT_ACTION_CATALOG_CATEGORIES_VIEWED', adminUserId, { totalCategories: data.length }, AUDIT_ENTITY);

    return { data: data.map(CategoryDTO) };
  }

  // GET /api/audit-action-catalog/risks
  getRisks(adminUserId: string) {
    const counts = _countBy('risk');
    const data = AUDIT_RISK_ORDER.map(risk => ({ risk, actionsCount: counts[risk] ?? 0 }));

    logAudit('AUDIT_ACTION_CATALOG_RISKS_VIEWED', adminUserId, { totalRisks: data.length }, AUDIT_ENTITY);

    return { data: data.map(RiskDTO) };
  }

  // GET /api/audit-action-catalog/modules
  getModules(adminUserId: string) {
    const counts = _countBy('module');
    const data = Object.values(AUDIT_MODULES).map(module => ({ module, actionsCount: counts[module] ?? 0 }));

    logAudit('AUDIT_ACTION_CATALOG_MODULES_VIEWED', adminUserId, { totalModules: data.length }, AUDIT_ENTITY);

    return { data: data.map(ModuleDTO) };
  }

  // GET /api/audit-action-catalog/actions?category=&risk=&module=&search=&page=&limit=&order=
  listActions(query: Record<string, unknown>, adminUserId: string) {
    const { page, limit, offset, order } = PaginationHelper.getPaginationParams(query);

    const all = _filterActions(_allActions(), query);
    all.sort((a, b) => (order === 'ASC' ? a.action.localeCompare(b.action) : b.action.localeCompare(a.action)));

    const totalItems = all.length;
    const pageItems = all.slice(offset, offset + limit);

    const activeFilters = PaginationHelper.buildFilters(query, ['category', 'risk', 'module', 'search']);

    logAudit(
      'AUDIT_ACTION_CATALOG_ACTIONS_LISTED',
      adminUserId,
      { totalItems, filters: Object.keys(activeFilters) },
      AUDIT_ENTITY
    );

    return {
      data: pageItems.map(ActionListDTO),
      metadata: MetadataDTO.build({
        totalItems,
        page,
        limit,
        sortBy: 'action',
        order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }
}

function _allActions() {
  return Object.entries(AUDIT_ACTIONS).map(([action, def]) => ({ action, ...def }));
}

function _filterActions(actions: CatalogAction[], query: Record<string, unknown>) {
  const { category, risk, module: moduleFilter, search } = query;
  const term = typeof search === 'string' ? search.trim().toLowerCase() : '';
  return actions.filter(a => {
    if (category && a.category !== category) {
      return false;
    }
    if (risk && a.risk !== risk) {
      return false;
    }
    if (moduleFilter && a.module !== moduleFilter) {
      return false;
    }
    if (term && !_matchesSearch(a, term)) {
      return false;
    }
    return true;
  });
}

function _matchesSearch(action: CatalogAction, term: string) {
  const actionName = action.action?.toLowerCase() ?? '';
  const description = action.description?.toLowerCase() ?? '';
  return actionName.includes(term) || description.includes(term);
}

function _countBy(field: 'category' | 'risk' | 'module'): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const def of Object.values(AUDIT_ACTIONS)) {
    const value = (def as Partial<Record<typeof field, string>>)[field];
    if (value === undefined) {
      continue;
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export = Object.assign(new AdminAuditActionCatalogService(), { AdminAuditActionCatalogService });
