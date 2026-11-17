// seeders/20260418000001-privacy-policy-v1.ts
//
// Inserta la versión inicial (1.0) de la política de privacidad.
// La URL del documento se lee de PRIVACY_POLICY_URL (variable de entorno
// inyectada por Terraform desde el output de CloudFront).
// En local, configurar en .env: PRIVACY_POLICY_URL=http://localhost:3000/legal/privacy-policy-v1.0.pdf

import type { Migration } from '../shared/types/migration';
import { v4 as uuidv4 } from 'uuid';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  up: async (queryInterface, Sequelize) => {
    const existing = await queryInterface.sequelize.query(
      `SELECT version FROM "${SCHEMA}"."privacy_policies" WHERE version = '1.0'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      console.log('⚠️  La política de privacidad v1.0 ya existe, saltando seed...');
      return;
    }

    // La URL viene de la variable de entorno — generada por Terraform desde CloudFront
    const documentUrl = process.env.PRIVACY_POLICY_URL || 'http://localhost:3000/legal/privacy-policy-v1.0.pdf';

    await queryInterface.bulkInsert(
      { tableName: 'privacy_policies', schema: SCHEMA },
      [
        {
          privacy_policy_id: uuidv4(),
          version: '1.0',
          document_url: documentUrl,
          summary: 'Versión inicial de la política de privacidad.',
          is_active: true,
          effective_date: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }
      ],
      {}
    );

    console.log(`✅ Política de privacidad v1.0 creada — URL: ${documentUrl}`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete({ tableName: 'privacy_policies', schema: SCHEMA }, { version: '1.0' }, {});
  }
} satisfies Migration;
