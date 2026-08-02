// tests/unit/shared/rbac.service.test.js
//
// RbacService resuelve "¿este rol puede esta acción en este módulo?" combinando la matriz BASE
// (código, inmutable) con los overrides en BD (runtime). Mockeamos Redis (caché) y el modelo
// de overrides para probar la lógica de resolución de forma determinística.

jest.mock('shared/utils/redis.util', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn()
}));

jest.mock('shared/models', () => ({
  RolePermissionOverride: { findAll: jest.fn() }
}));

const redisClient = require('shared/utils/redis.util');
const { RolePermissionOverride } = require('shared/models');
const rbacService = require('shared/services/rbac.service');
const { RBAC_ROLES, RBAC_MODULES, RBAC_ACTIONS } = require('shared/constants/rbac');

describe('RbacService', () => {
  beforeEach(() => {
    redisClient.get.mockReset().mockResolvedValue(null); // caché miss por defecto
    redisClient.set.mockReset().mockResolvedValue(undefined);
    redisClient.del.mockReset().mockResolvedValue(undefined);
    RolePermissionOverride.findAll.mockReset().mockResolvedValue([]); // sin overrides por defecto
  });

  describe('can — matriz base', () => {
    it('SUPERADMIN puede cualquier acción sin consultar BD', async () => {
      await expect(rbacService.can(RBAC_ROLES.SUPERADMIN, RBAC_MODULES.INTERNAL_USERS, RBAC_ACTIONS.DELETE)).resolves.toBe(true);
      expect(RolePermissionOverride.findAll).not.toHaveBeenCalled();
    });

    it('ADMIN (wildcard) puede cualquier acción', async () => {
      await expect(rbacService.can(RBAC_ROLES.ADMIN, RBAC_MODULES.SYSTEM_CONFIG, RBAC_ACTIONS.UPDATE)).resolves.toBe(true);
    });

    it('AUDITOR puede leer cualquier módulo', async () => {
      await expect(rbacService.can(RBAC_ROLES.AUDITOR, RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.READ)).resolves.toBe(true);
    });

    it('AUDITOR no puede escribir (y consulta overrides al no hallarlo en base)', async () => {
      await expect(rbacService.can(RBAC_ROLES.AUDITOR, RBAC_MODULES.GLOBAL_LOGS, RBAC_ACTIONS.CREATE)).resolves.toBe(false);
      expect(RolePermissionOverride.findAll).toHaveBeenCalled();
    });

    it('CLIENTE no tiene permisos', async () => {
      await expect(rbacService.can(RBAC_ROLES.CLIENTE, RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.READ)).resolves.toBe(false);
    });

    it('un rol desconocido no tiene permisos', async () => {
      await expect(rbacService.can('ROL_INEXISTENTE', RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.READ)).resolves.toBe(false);
    });
  });

  describe('can — overrides en BD', () => {
    it('un override concede un permiso que la base no da', async () => {
      RolePermissionOverride.findAll.mockResolvedValue([
        { module_name: RBAC_MODULES.CLIENTS_LIST, action: RBAC_ACTIONS.CREATE }
      ]);
      await expect(rbacService.can(RBAC_ROLES.AUDITOR, RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.CREATE)).resolves.toBe(true);
    });

    it('usa la caché de Redis cuando hay hit y no toca BD', async () => {
      redisClient.get.mockResolvedValue([{ module_name: RBAC_MODULES.CLIENTS_LIST, action: RBAC_ACTIONS.CREATE }]);
      await expect(rbacService.can(RBAC_ROLES.AUDITOR, RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.CREATE)).resolves.toBe(true);
      expect(RolePermissionOverride.findAll).not.toHaveBeenCalled();
    });

    it('cachea en Redis el resultado leído de BD', async () => {
      await rbacService.can(RBAC_ROLES.AUDITOR, RBAC_MODULES.CLIENTS_LIST, RBAC_ACTIONS.CREATE);
      expect(redisClient.set).toHaveBeenCalledWith('rbac:overrides:AUDITOR', [], 60);
    });
  });

  describe('canAccessModule', () => {
    it('AUDITOR accede a un módulo (tiene lectura)', async () => {
      await expect(rbacService.canAccessModule(RBAC_ROLES.AUDITOR, RBAC_MODULES.SYSTEM_ALERTS)).resolves.toBe(true);
    });

    it('CLIENTE no accede a módulos del panel admin', async () => {
      await expect(rbacService.canAccessModule(RBAC_ROLES.CLIENTE, RBAC_MODULES.SYSTEM_ALERTS)).resolves.toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    it('AUDITOR obtiene solo lectura en todos los módulos', async () => {
      const perms = await rbacService.getEffectivePermissions(RBAC_ROLES.AUDITOR);
      const modules = Object.keys(perms);
      expect(modules.length).toBeGreaterThan(0);
      for (const mod of modules) {
        expect(perms[mod]).toEqual([RBAC_ACTIONS.READ]);
      }
    });

    it('CLIENTE no obtiene ningún módulo', async () => {
      await expect(rbacService.getEffectivePermissions(RBAC_ROLES.CLIENTE)).resolves.toEqual({});
    });
  });

  describe('getRoleMatrix', () => {
    it('separa permisos base de los agregados por override', async () => {
      RolePermissionOverride.findAll.mockResolvedValue([
        { module_name: RBAC_MODULES.CLIENTS_LIST, action: RBAC_ACTIONS.CREATE }
      ]);
      const [entry] = await rbacService.getRoleMatrix([RBAC_ROLES.AUDITOR]);
      expect(entry.role).toBe(RBAC_ROLES.AUDITOR);
      // La lectura viene de la base.
      expect(entry.base_permissions[RBAC_MODULES.GLOBAL_LOGS]).toContain(RBAC_ACTIONS.READ);
      // El create sobre clientsList vino del override.
      expect(entry.added_permissions[RBAC_MODULES.CLIENTS_LIST]).toContain(RBAC_ACTIONS.CREATE);
    });
  });

  describe('listCatalog', () => {
    it('expone groups, modules y actions', () => {
      const catalog = rbacService.listCatalog();
      expect(Array.isArray(catalog.groups)).toBe(true);
      expect(catalog.modules).toEqual(expect.arrayContaining([RBAC_MODULES.CLIENTS_LIST]));
      expect(catalog.actions).toEqual(expect.arrayContaining(Object.values(RBAC_ACTIONS)));
    });
  });

  describe('invalidateCache', () => {
    it('borra la key de overrides del rol en Redis', async () => {
      await rbacService.invalidateCache(RBAC_ROLES.ADMIN);
      expect(redisClient.del).toHaveBeenCalledWith('rbac:overrides:ADMIN');
    });
  });
});
