// API pública del módulo integration: lo ÚNICO que otros módulos (y src/app.ts) pueden importar.
// Lo que no está acá es interno del módulo (docs/ARCHITECTURE.md, regla 2).
//
// Cada export se carga al usarse (getter): los módulos se usan entre sí y un index que cargara todo
// de una vez crearía ciclos de carga. Uso: import integrationModule from '…/integration'; const { X } = integrationModule;
import { interopDefault } from '../../shared/utils/interop.util';

export default {
  get integrationApiLogRepository() {
    return interopDefault(require('./repositories/integration-api-log.repository') as typeof import('./repositories/integration-api-log.repository'));
  },

  get providerFallbackEventRepository() {
    return interopDefault(require('./repositories/provider-fallback-event.repository') as typeof import('./repositories/provider-fallback-event.repository'));
  },

  get adminIntegrationMonitoringRoutes() {
    return interopDefault(require('./routes/integration-monitoring.routes') as typeof import('./routes/integration-monitoring.routes'));
  }
};
