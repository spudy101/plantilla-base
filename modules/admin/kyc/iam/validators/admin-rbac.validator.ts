// modules/admin/rbac/validators/admin-rbac.validator.ts

import expressValidatorModule = require('express-validator');
const { param, body } = expressValidatorModule;
import constantsModule = require('../../../../../shared/constants');
const { RBAC_ROLES, RBAC_MODULES, RBAC_ACTIONS } = constantsModule;
import BaseValidator = require('../../../../../shared/validators/base.validator');

const validRoleNames = Object.values(RBAC_ROLES);
const validModuleNames = Object.values(RBAC_MODULES);
const validActions = Object.values(RBAC_ACTIONS);

class AdminRbacValidator {
  static noop() {
    return [];
  }

  /** Valida :roleName en rutas de gestión de overrides. */
  static roleNameParam() {
    return [
      param('roleName')
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El nombre del rol es requerido',
          hint: `Indicá uno de: ${validRoleNames.join(', ')}`
        })
        .isIn(validRoleNames)
        .withMessage({
          message: `El rol debe ser uno de: ${validRoleNames.join(', ')}`,
          hint: `Indicá uno de: ${validRoleNames.join(', ')}`
        })
    ];
  }

  /** Valida :permissionId (UUID) para el DELETE. */
  static permissionIdParam() {
    return [...BaseValidator.uuidParam('permissionId', 'El ID del permiso')];
  }

  /** Body de POST /roles/:roleName/permissions. */
  static grantPermission() {
    return [
      ...AdminRbacValidator.roleNameParam(),
      body('moduleName')
        .trim()
        .notEmpty()
        .withMessage({
          message: 'El módulo es requerido',
          hint: `Indicá uno de: ${validModuleNames.join(', ')}`
        })
        .isIn(validModuleNames)
        .withMessage({
          message: `El módulo debe ser uno de: ${validModuleNames.join(', ')}`,
          hint: `Indicá uno de: ${validModuleNames.join(', ')}`
        }),
      body('action')
        .trim()
        .notEmpty()
        .withMessage({
          message: 'La acción es requerida',
          hint: `Indicá una de: ${validActions.join(', ')}`
        })
        .isIn(validActions)
        .withMessage({
          message: `La acción debe ser una de: ${validActions.join(', ')}`,
          hint: `Indicá una de: ${validActions.join(', ')}`
        })
    ];
  }
}

export = AdminRbacValidator;
