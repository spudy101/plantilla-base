// shared/services/rbac.service.js
//
// ============================================================================
// RbacService — resolución de permisos del RBAC (RF-ADM-01)
// ============================================================================
//
// Único punto que responde "¿este rol puede hacer esta acción en este módulo?".
// El middleware y los controllers SIEMPRE preguntan aquí; nunca leen la matriz
// directamente.
//
// ─── Dos capas de permisos ────────────────────────────────────────────────────
//   1. MATRIZ BASE (código, inmutable) — ROLE_PERMISSIONS en shared/constants/rbac.js
//      Criterio #2: no editable en runtime. Solo cambia con un deploy.
//
//   2. OVERRIDES en BD (runtime, editables por SUPERADMIN) — tabla role_permission_overrides
//      Criterio #1: el SUPERADMIN define permisos adicionales por módulo (CRUD).
//      Los overrides SOLO AÑADEN permisos sobre la base; nunca la reducen.
//
// ─── Estrategia de caché ─────────────────────────────────────────────────────
//   Los overrides de cada rol se cachean en Redis (TTL 60s, key rbac:overrides:{roleName}).
//   Al otorgar o revocar un override, el servicio que gestiona esa operación
//   (AdminRbacService) invoca `invalidateCache(roleName)` para que el cambio
//   surta efecto de inmediato sin esperar los 60s.
//   Fail-open: si Redis no está disponible, se consulta BD directamente.

const { RBAC_WILDCARD, RBAC_MODULES, RBAC_MODULE_GROUPS, RBAC_ACTIONS, ROLE_PERMISSIONS } = require('../constants');
const redisClient = require('../utils/redis.util');

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = 'rbac:overrides:';

class RbacService {
  // ============================================================
  // RESOLUCIÓN DE PERMISOS
  // ============================================================

  /**
   * ¿El rol puede ejecutar `action` sobre `moduleName`?
   *
   * Primero resuelve la base (código). Si la base concede el permiso, retorna
   * true sin consultar BD. Si no, consulta los overrides (con caché Redis).
   *
   * @param {string} roleName
   * @param {string} moduleName - uno de RBAC_MODULES
   * @param {string} action     - una de RBAC_ACTIONS
   * @returns {Promise<boolean>}
   */
  async can(roleName, moduleName, action) {
    const basePerms = ROLE_PERMISSIONS[roleName];

    if (!basePerms) {
      return false;
    }
    if (basePerms === RBAC_WILDCARD) {
      return true;
    }

    if (this._moduleAllows(basePerms[moduleName], action) || this._moduleAllows(basePerms[RBAC_WILDCARD], action)) {
      return true;
    }

    // La base no concede el permiso → revisar overrides en BD (con caché).
    const overrides = await this._loadOverrides(roleName);
    return overrides.some(o => o.module_name === moduleName && o.action === action);
  }

  /**
   * ¿El rol tiene CUALQUIER acción sobre el módulo?
   * @param {string} roleName
   * @param {string} moduleName
   * @returns {Promise<boolean>}
   */
  async canAccessModule(roleName, moduleName) {
    for (const action of Object.values(RBAC_ACTIONS)) {
      if (await this.can(roleName, moduleName, action)) {
        return true;
      }
    }
    return false;
  }

  // ============================================================
  // CATÁLOGO (para que el front bloquee vistas)
  // ============================================================

  /**
   * Catálogo para que el front pinte el árbol de permisos y bloquee vistas.
   *   groups  — agrupaciones con labels en español: [{ key, label, modules: [{ id, label }] }]
   *   modules — lista plana de ids de módulo (compatibilidad)
   *   actions — acciones CRUD
   * @returns {{ groups: object[], modules: string[], actions: string[] }}
   */
  listCatalog() {
    return {
      groups: RBAC_MODULE_GROUPS,
      modules: Object.values(RBAC_MODULES),
      actions: Object.values(RBAC_ACTIONS)
    };
  }

  /**
   * Permisos efectivos de un rol, normalizados a { [modulo]: [acciones] }.
   * Carga los overrides UNA sola vez y resuelve el resto en memoria.
   *
   * @param {string} roleName
   * @returns {Promise<Object<string, string[]>>}
   */
  async getEffectivePermissions(roleName) {
    const modules = Object.values(RBAC_MODULES);
    const overrides = await this._loadOverrides(roleName);
    const result = {};

    for (const moduleName of modules) {
      const actions = Object.values(RBAC_ACTIONS).filter(action => this._canSync(roleName, moduleName, action, overrides));
      if (actions.length > 0) {
        result[moduleName] = actions;
      }
    }

    return result;
  }

  /**
   * Matriz de permisos para una lista de roles, diferenciando origen.
   *
   * Cada entrada retorna:
   *   base_permissions    — permisos definidos en ROLE_PERMISSIONS (código, inmutables)
   *   added_permissions   — overrides agregados en runtime por SUPERADMIN (BD)
   *
   * El front puede mostrar los base como no editables y los added como revocables.
   *
   * @param {string[]} roleNames
   * @returns {Promise<Array<{ role, base_permissions, added_permissions }>>}
   */
  getRoleMatrix(roleNames = []) {
    return Promise.all(roleNames.map(roleName => this._getRoleMatrixEntry(roleName)));
  }

  /** @private */
  async _getRoleMatrixEntry(roleName) {
    const modules = Object.values(RBAC_MODULES);
    const overrides = await this._loadOverrides(roleName);

    const basePermissions = {};
    const addedPermissions = {};

    for (const moduleName of modules) {
      const baseActions = [];
      const addedActions = [];

      for (const action of Object.values(RBAC_ACTIONS)) {
        const fromBase = this._comesFromBase(roleName, moduleName, action);
        const fromOverride = overrides.some(o => o.module_name === moduleName && o.action === action);

        if (fromBase) {
          baseActions.push(action);
        }
        // Un override que ya está cubierto por la base no se repite en added
        else if (fromOverride) {
          addedActions.push(action);
        }
      }

      if (baseActions.length > 0) {
        basePermissions[moduleName] = baseActions;
      }
      if (addedActions.length > 0) {
        addedPermissions[moduleName] = addedActions;
      }
    }

    return {
      role: roleName,
      base_permissions: basePermissions,
      added_permissions: addedPermissions
    };
  }

  /**
   * Verifica si un permiso viene exclusivamente de la matriz base (código).
   * No consulta overrides — solo la constante ROLE_PERMISSIONS.
   * @private
   */
  _comesFromBase(roleName, moduleName, action) {
    const basePerms = ROLE_PERMISSIONS[roleName];
    if (!basePerms) {
      return false;
    }
    if (basePerms === RBAC_WILDCARD) {
      return true;
    }
    return this._moduleAllows(basePerms[moduleName], action) || this._moduleAllows(basePerms[RBAC_WILDCARD], action);
  }

  // ============================================================
  // GESTIÓN DE CACHÉ (invocada por AdminRbacService)
  // ============================================================

  /** Invalida la caché de overrides de un rol. Llamar tras POST/DELETE de override. */
  async invalidateCache(roleName) {
    await redisClient.del(`${CACHE_KEY_PREFIX}${roleName}`);
  }

  // ============================================================
  // PRIVATE
  // ============================================================

  /**
   * Resolución síncrona cuando los overrides ya están cargados.
   * Evita consultas redundantes dentro de getEffectivePermissions.
   * @private
   */
  _canSync(roleName, moduleName, action, overrides) {
    const basePerms = ROLE_PERMISSIONS[roleName];
    if (!basePerms) {
      return false;
    }
    if (basePerms === RBAC_WILDCARD) {
      return true;
    }
    if (this._moduleAllows(basePerms[moduleName], action) || this._moduleAllows(basePerms[RBAC_WILDCARD], action)) {
      return true;
    }
    return overrides.some(o => o.module_name === moduleName && o.action === action);
  }

  /**
   * Carga los overrides de un rol desde caché Redis o BD.
   * Retorna array de { module_name, action }.
   * @private
   */
  async _loadOverrides(roleName) {
    const cacheKey = `${CACHE_KEY_PREFIX}${roleName}`;

    const cached = await redisClient.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const { RolePermissionOverride } = require('../models');
    const rows = await RolePermissionOverride.findAll({
      where: { role_name: roleName },
      attributes: ['module_name', 'action']
    });
    const overrides = rows.map(r => ({ module_name: r.module_name, action: r.action }));

    await redisClient.set(cacheKey, overrides, CACHE_TTL_SECONDS);

    return overrides;
  }

  /** @private */
  _moduleAllows(actions, action) {
    if (!actions) {
      return false;
    }
    return actions === RBAC_WILDCARD || actions.includes(action);
  }
}

module.exports = new RbacService();
