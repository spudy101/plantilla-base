// seeders/20250108000003-departments-colombia.ts

import type { Migration } from '../shared/types/migration';
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

// Departamentos de Colombia con códigos DANE oficiales (Divipola)
const DEPARTMENTS = [
  { name: 'Amazonas', dane_code: '91' },
  { name: 'Antioquia', dane_code: '05' },
  { name: 'Arauca', dane_code: '81' },
  { name: 'Atlántico', dane_code: '08' },
  { name: 'Bogotá D.C.', dane_code: '11' },
  { name: 'Bolívar', dane_code: '13' },
  { name: 'Boyacá', dane_code: '15' },
  { name: 'Caldas', dane_code: '17' },
  { name: 'Caquetá', dane_code: '18' },
  { name: 'Casanare', dane_code: '85' },
  { name: 'Cauca', dane_code: '19' },
  { name: 'Cesar', dane_code: '20' },
  { name: 'Chocó', dane_code: '27' },
  { name: 'Córdoba', dane_code: '23' },
  { name: 'Cundinamarca', dane_code: '25' },
  { name: 'Guainía', dane_code: '94' },
  { name: 'Guaviare', dane_code: '95' },
  { name: 'Huila', dane_code: '41' },
  { name: 'La Guajira', dane_code: '44' },
  { name: 'Magdalena', dane_code: '47' },
  { name: 'Meta', dane_code: '50' },
  { name: 'Nariño', dane_code: '52' },
  { name: 'Norte de Santander', dane_code: '54' },
  { name: 'Putumayo', dane_code: '86' },
  { name: 'Quindío', dane_code: '63' },
  { name: 'Risaralda', dane_code: '66' },
  { name: 'San Andrés y Providencia', dane_code: '88' },
  { name: 'Santander', dane_code: '68' },
  { name: 'Sucre', dane_code: '70' },
  { name: 'Tolima', dane_code: '73' },
  { name: 'Valle del Cauca', dane_code: '76' },
  { name: 'Vaupés', dane_code: '97' },
  { name: 'Vichada', dane_code: '99' }
];

export default {
  up: async (queryInterface, Sequelize) => {
    // Obtener Colombia
    const [colombia] = await queryInterface.sequelize.query<{ country_id: string }>(`SELECT country_id FROM "${SCHEMA}"."countries" WHERE code = 'COL'`, {
      type: Sequelize.QueryTypes.SELECT
    });

    if (!colombia) {
      console.log('⚠️  País Colombia no encontrado, ejecuta primero el seeder de países');
      return;
    }

    const existingDepartments = await queryInterface.sequelize.query(
      `SELECT name FROM "${SCHEMA}"."departments" WHERE country_id = :countryId`,
      {
        replacements: { countryId: colombia.country_id },
        type: Sequelize.QueryTypes.SELECT
      }
    );

    if (existingDepartments.length > 0) {
      console.log('⚠️  Los departamentos de Colombia ya existen, saltando seed...');
      return;
    }

    await queryInterface.bulkInsert(
      { tableName: 'departments', schema: SCHEMA },
      DEPARTMENTS.map(dept => ({
        department_id: uuidv4(),
        name: dept.name,
        dane_code: dept.dane_code,
        country_id: colombia.country_id,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })),
      {}
    );

    console.log('✅ Departamentos de Colombia creados exitosamente (con códigos DANE)');
  },

  down: async (queryInterface, Sequelize) => {
    const [colombia] = await queryInterface.sequelize.query<{ country_id: string }>(`SELECT country_id FROM "${SCHEMA}"."countries" WHERE code = 'COL'`, {
      type: Sequelize.QueryTypes.SELECT
    });

    if (colombia) {
      await queryInterface.bulkDelete({ tableName: 'departments', schema: SCHEMA }, { country_id: colombia.country_id }, {});
    }
  }
} satisfies Migration;
