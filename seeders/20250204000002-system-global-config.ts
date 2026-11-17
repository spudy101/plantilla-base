import type { Migration } from '../shared/types/migration';
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  up: async (queryInterface, Sequelize) => {
    // COUNT(*) llega como string en Postgres (bigint)
    const existingConfig = await queryInterface.sequelize.query<{ count: string | number }>(
      `SELECT COUNT(*) as count FROM "${SCHEMA}"."system_global_config" WHERE is_active = true`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (Number(existingConfig[0]?.count) > 0) {
      console.log('⚠️  La configuración global del sistema ya existe, saltando seed...');
      return;
    }

    const globalConfig = {
      config_id: uuidv4(),
      config_version: 1,
      is_active: true,

      currency: 'CLP',

      // Resiliencia homologada de todas las integraciones salientes. Un solo valor para todos.
      integration_resilience: JSON.stringify({
        timeout_ms: 30000,
        manual_review_timeout_ms: 10000,
        max_retries: 3,
        circuit_breaker: { failure_threshold: 5, recovery_time_ms: 60000, failures_ttl_s: 300 }
      }),

      // Banner promocional semilla para que el front tenga qué pintar tras db:reset; el admin lo
      // reemplaza desde el mantenedor de banners (la imagen definitiva sube al bucket público).
      promotional_banners: JSON.stringify([
        {
          id: '9c302288-79e3-4388-9b7c-1e77262c0240',
          title: 'Bienvenido a Base Project',
          text: 'Contenido promocional de ejemplo. Edítalo desde el mantenedor de banners.',
          tag: 'Nuevo',
          button_route: '/',
          button_name: 'Explorar',
          image_url: '',
          is_active: true,
          sort_order: 1
        }
      ]),

      created_at: new Date(),
      updated_at: new Date()
    };

    await queryInterface.bulkInsert({ tableName: 'system_global_config', schema: SCHEMA }, [globalConfig], {});

    console.log('✅ Configuración global del sistema creada exitosamente');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete({ tableName: 'system_global_config', schema: SCHEMA }, {}, {});
  }
} satisfies Migration;
