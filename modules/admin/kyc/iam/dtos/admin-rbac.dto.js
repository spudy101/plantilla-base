// modules/admin/rbac/dtos/admin-rbac.dto.js

// Construye el árbol de grupos para el front a partir del array plano de RBAC_MODULE_GROUPS.
// Un grupo con `parent` cuelga como subgrupo de su padre; sin `parent`, es top-level.
// Resultado: [{ key, label, description, modules, subgroups: [ ...misma forma... ] }].
// La jerarquía es solo de presentación (el menú del front); la resolución de permisos sigue leyendo
// los módulos planos, sin importar el anidamiento.
function _buildGroupTree(groups) {
  const nodeByKey = new Map();
  // 1ª pasada: un nodo por grupo (con subgroups vacío), para poder colgar hijos en cualquier orden.
  for (const g of groups) {
    nodeByKey.set(g.key, { key: g.key, label: g.label, description: g.description, modules: g.modules, subgroups: [] });
  }
  // 2ª pasada: cada grupo va bajo su padre (si existe) o queda top-level.
  const roots = [];
  for (const g of groups) {
    const node = nodeByKey.get(g.key);
    const parent = g.parent ? nodeByKey.get(g.parent) : null;
    if (parent) {
      parent.subgroups.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function RbacCatalogDTO(catalog) {
  return {
    // árbol anidado para el front: top-level con `subgroups` (Integraciones→{Proveedores,API Logs},
    // Administración→{Roles,Usuarios,Doble Aprobación}). Cada nodo: { key, label, description, modules, subgroups }.
    groups: _buildGroupTree(catalog.groups),
    modules: catalog.modules,
    actions: catalog.actions
  };
}

function RoleMatrixDTO(matrix) {
  return matrix.map(entry => ({
    role: entry.role,
    basePermissions: entry.base_permissions, // inmutables — solo cambian con deploy
    addedPermissions: entry.added_permissions // agregados en runtime por SUPERADMIN
  }));
}

function EffectivePermissionsDTO(roleName, permissions) {
  return {
    role: roleName,
    permissions
  };
}

function RolePermissionsListDTO(roleName, overrides) {
  return {
    role: roleName,
    overrides: overrides.map(RolePermissionOverrideDTO)
  };
}

function RolePermissionOverrideDTO(override) {
  const gb = override.grantedBy ?? null;
  return {
    rolePermissionId: override.role_permission_id,
    roleName: override.role_name,
    moduleName: override.module_name,
    action: override.action,
    grantedByUserId: override.granted_by_user_id,
    grantedBy: gb
      ? {
          userId: gb.user_id,
          username: gb.username,
          fullName: [gb.person?.first_name, gb.person?.last_name].filter(Boolean).join(' ') || null
        }
      : null,
    createdAt: override.createdAt
  };
}

module.exports = {
  RbacCatalogDTO,
  RoleMatrixDTO,
  EffectivePermissionsDTO,
  RolePermissionsListDTO,
  RolePermissionOverrideDTO
};
