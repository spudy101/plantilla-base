// API pública del módulo iam: lo ÚNICO que otros módulos (y src/app.ts) pueden importar.
// Lo que no está acá es interno del módulo (docs/ARCHITECTURE.md, regla 2).
//
// Cada export se carga al usarse (getter): los módulos se usan entre sí y un index que cargara todo
// de una vez crearía ciclos de carga. Uso: import iamModule from '…/iam'; const { X } = iamModule;
import { interopDefault } from '../../shared/utils/interop.util';

export default {
  get adminUserDto() {
    return interopDefault(require('./dtos/admin-user.dto') as typeof import('./dtos/admin-user.dto'));
  },

  get authComponentsDto() {
    return interopDefault(require('./dtos/auth-components.dto') as typeof import('./dtos/auth-components.dto'));
  },

  get AuthMiddleware() {
    return interopDefault(require('./middlewares/auth.middleware') as typeof import('./middlewares/auth.middleware'));
  },

  get RbacMiddleware() {
    return interopDefault(require('./middlewares/rbac.middleware') as typeof import('./middlewares/rbac.middleware'));
  },

  get trustedDeviceRepository() {
    return interopDefault(require('./repositories/auth-trusted-device.repository') as typeof import('./repositories/auth-trusted-device.repository'));
  },

  get biometricRepository() {
    return interopDefault(require('./repositories/biometric.repository') as typeof import('./repositories/biometric.repository'));
  },

  get resetCredentialsRepository() {
    return interopDefault(require('./repositories/reset-credentials.repository') as typeof import('./repositories/reset-credentials.repository'));
  },

  get rolePermissionOverrideRepository() {
    return interopDefault(require('./repositories/role-permission-override.repository') as typeof import('./repositories/role-permission-override.repository'));
  },

  get roleRepository() {
    return interopDefault(require('./repositories/role.repository') as typeof import('./repositories/role.repository'));
  },

  get userSessionRepository() {
    return interopDefault(require('./repositories/user-session.repository') as typeof import('./repositories/user-session.repository'));
  },

  get userRepository() {
    return interopDefault(require('./repositories/user.repository') as typeof import('./repositories/user.repository'));
  },

  get adminAuthSessionRoutes() {
    return interopDefault(require('./routes/admin-auth-session.routes') as typeof import('./routes/admin-auth-session.routes'));
  },

  get adminRbacRoutes() {
    return interopDefault(require('./routes/admin-rbac.routes') as typeof import('./routes/admin-rbac.routes'));
  },

  get adminUserRoutes() {
    return interopDefault(require('./routes/admin-user.routes') as typeof import('./routes/admin-user.routes'));
  },

  get authBiometricRoutes() {
    return interopDefault(require('./routes/auth-biometric.routes') as typeof import('./routes/auth-biometric.routes'));
  },

  get authLoginRoutes() {
    return interopDefault(require('./routes/auth-login.routes') as typeof import('./routes/auth-login.routes'));
  },

  get authRegisterRoutes() {
    return interopDefault(require('./routes/auth-register.routes') as typeof import('./routes/auth-register.routes'));
  },

  get mfaRoutes() {
    return interopDefault(require('./routes/mfa.routes') as typeof import('./routes/mfa.routes'));
  },

  get AdminUserService() {
    return interopDefault(require('./services/admin-user.service') as typeof import('./services/admin-user.service'));
  },

  get SessionExpirationWorker() {
    return interopDefault(require('./workers/session-expiration.worker') as typeof import('./workers/session-expiration.worker'));
  }
};

export type { SessionWithDeviceAndUser } from './repositories/user-session.repository';
export type { UserAdminTargetRow, UserProfileRow } from './repositories/user.repository';
