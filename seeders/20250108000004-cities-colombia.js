// seeders/20250108000004-cities-colombia.js

const { v4: uuidv4 } = require('uuid');
const { database } = require('../shared/constants');

const SCHEMA = database.schema;

// Ciudades principales por departamento con códigos DANE oficiales (Divipola)
const CITIES = [
  // Amazonas
  { name: 'Leticia', department: 'Amazonas', dane_code: '001' },
  { name: 'Puerto Nariño', department: 'Amazonas', dane_code: '530' },
  // Antioquia
  { name: 'Medellín', department: 'Antioquia', dane_code: '001' },
  { name: 'Bello', department: 'Antioquia', dane_code: '088' },
  { name: 'Itagüí', department: 'Antioquia', dane_code: '360' },
  { name: 'Envigado', department: 'Antioquia', dane_code: '266' },
  { name: 'Rionegro', department: 'Antioquia', dane_code: '615' },
  // Arauca
  { name: 'Arauca', department: 'Arauca', dane_code: '001' },
  { name: 'Saravena', department: 'Arauca', dane_code: '736' },
  // Atlántico
  { name: 'Barranquilla', department: 'Atlántico', dane_code: '001' },
  { name: 'Soledad', department: 'Atlántico', dane_code: '758' },
  { name: 'Malambo', department: 'Atlántico', dane_code: '433' },
  // Bogotá D.C.
  { name: 'Bogotá', department: 'Bogotá D.C.', dane_code: '001' },
  // Bolívar
  { name: 'Cartagena', department: 'Bolívar', dane_code: '001' },
  { name: 'Magangué', department: 'Bolívar', dane_code: '430' },
  // Boyacá
  { name: 'Tunja', department: 'Boyacá', dane_code: '001' },
  { name: 'Duitama', department: 'Boyacá', dane_code: '244' },
  { name: 'Sogamoso', department: 'Boyacá', dane_code: '762' },
  // Caldas
  { name: 'Manizales', department: 'Caldas', dane_code: '001' },
  { name: 'Villamaría', department: 'Caldas', dane_code: '877' },
  // Caquetá
  { name: 'Florencia', department: 'Caquetá', dane_code: '001' },
  // Casanare
  { name: 'Yopal', department: 'Casanare', dane_code: '001' },
  // Cauca
  { name: 'Popayán', department: 'Cauca', dane_code: '001' },
  { name: 'Santander de Quilichao', department: 'Cauca', dane_code: '698' },
  // Cesar
  { name: 'Valledupar', department: 'Cesar', dane_code: '001' },
  { name: 'Aguachica', department: 'Cesar', dane_code: '011' },
  // Chocó
  { name: 'Quibdó', department: 'Chocó', dane_code: '001' },
  // Córdoba
  { name: 'Montería', department: 'Córdoba', dane_code: '001' },
  { name: 'Cereté', department: 'Córdoba', dane_code: '162' },
  // Cundinamarca
  { name: 'Soacha', department: 'Cundinamarca', dane_code: '754' },
  { name: 'Facatativá', department: 'Cundinamarca', dane_code: '269' },
  { name: 'Zipaquirá', department: 'Cundinamarca', dane_code: '899' },
  { name: 'Chía', department: 'Cundinamarca', dane_code: '175' },
  { name: 'Mosquera', department: 'Cundinamarca', dane_code: '473' },
  { name: 'Fusagasugá', department: 'Cundinamarca', dane_code: '307' },
  // Guainía
  { name: 'Inírida', department: 'Guainía', dane_code: '001' },
  // Guaviare
  { name: 'San José del Guaviare', department: 'Guaviare', dane_code: '001' },
  // Huila
  { name: 'Neiva', department: 'Huila', dane_code: '001' },
  { name: 'Pitalito', department: 'Huila', dane_code: '551' },
  // La Guajira
  { name: 'Riohacha', department: 'La Guajira', dane_code: '001' },
  { name: 'Maicao', department: 'La Guajira', dane_code: '430' },
  // Magdalena
  { name: 'Santa Marta', department: 'Magdalena', dane_code: '001' },
  { name: 'Ciénaga', department: 'Magdalena', dane_code: '189' },
  // Meta
  { name: 'Villavicencio', department: 'Meta', dane_code: '001' },
  { name: 'Acacías', department: 'Meta', dane_code: '006' },
  // Nariño
  { name: 'Pasto', department: 'Nariño', dane_code: '001' },
  { name: 'Tumaco', department: 'Nariño', dane_code: '835' },
  { name: 'Ipiales', department: 'Nariño', dane_code: '356' },
  // Norte de Santander
  { name: 'Cúcuta', department: 'Norte de Santander', dane_code: '001' },
  { name: 'Ocaña', department: 'Norte de Santander', dane_code: '498' },
  { name: 'Pamplona', department: 'Norte de Santander', dane_code: '518' },
  // Putumayo
  { name: 'Mocoa', department: 'Putumayo', dane_code: '001' },
  // Quindío
  { name: 'Armenia', department: 'Quindío', dane_code: '001' },
  { name: 'Calarcá', department: 'Quindío', dane_code: '130' },
  // Risaralda
  { name: 'Pereira', department: 'Risaralda', dane_code: '001' },
  { name: 'Dosquebradas', department: 'Risaralda', dane_code: '170' },
  { name: 'Santa Rosa de Cabal', department: 'Risaralda', dane_code: '682' },
  // San Andrés y Providencia
  { name: 'San Andrés', department: 'San Andrés y Providencia', dane_code: '001' },
  // Santander
  { name: 'Bucaramanga', department: 'Santander', dane_code: '001' },
  { name: 'Floridablanca', department: 'Santander', dane_code: '276' },
  { name: 'Girón', department: 'Santander', dane_code: '307' },
  { name: 'Piedecuesta', department: 'Santander', dane_code: '547' },
  { name: 'Barrancabermeja', department: 'Santander', dane_code: '081' },
  // Sucre
  { name: 'Sincelejo', department: 'Sucre', dane_code: '001' },
  // Tolima
  { name: 'Ibagué', department: 'Tolima', dane_code: '001' },
  { name: 'Espinal', department: 'Tolima', dane_code: '268' },
  // Valle del Cauca
  { name: 'Cali', department: 'Valle del Cauca', dane_code: '001' },
  { name: 'Palmira', department: 'Valle del Cauca', dane_code: '520' },
  { name: 'Buenaventura', department: 'Valle del Cauca', dane_code: '109' },
  { name: 'Tuluá', department: 'Valle del Cauca', dane_code: '834' },
  { name: 'Cartago', department: 'Valle del Cauca', dane_code: '147' },
  { name: 'Buga', department: 'Valle del Cauca', dane_code: '111' },
  // Vaupés
  { name: 'Mitú', department: 'Vaupés', dane_code: '001' },
  // Vichada
  { name: 'Puerto Carreño', department: 'Vichada', dane_code: '001' }
];

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const departments = await queryInterface.sequelize.query(
      `SELECT d.department_id, d.name 
       FROM "${SCHEMA}"."departments" d
       INNER JOIN "${SCHEMA}"."countries" c ON d.country_id = c.country_id
       WHERE c.code = 'COL'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (departments.length === 0) {
      console.log('⚠️  Departamentos de Colombia no encontrados, ejecuta primero el seeder de departamentos');
      return;
    }

    const departmentMap = {};
    for (const d of departments) {
      departmentMap[d.name] = d.department_id;
    }

    const existingCities = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM "${SCHEMA}"."cities" WHERE department_id IN (:ids)`,
      {
        replacements: { ids: departments.map(d => d.department_id) },
        type: Sequelize.QueryTypes.SELECT
      }
    );

    if (existingCities[0].count > 0) {
      console.log('⚠️  Las ciudades de Colombia ya existen, saltando seed...');
      return;
    }

    await queryInterface.bulkInsert(
      { tableName: 'cities', schema: SCHEMA },
      CITIES.map(city => ({
        city_id: uuidv4(),
        name: city.name,
        dane_code: city.dane_code,
        department_id: departmentMap[city.department],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })),
      {}
    );

    console.log('✅ Ciudades de Colombia creadas exitosamente (con códigos DANE)');
  },

  down: async (queryInterface, Sequelize) => {
    const departments = await queryInterface.sequelize.query(
      `SELECT d.department_id
       FROM "${SCHEMA}"."departments" d
       INNER JOIN "${SCHEMA}"."countries" c ON d.country_id = c.country_id
       WHERE c.code = 'COL'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (departments.length > 0) {
      await queryInterface.bulkDelete(
        { tableName: 'cities', schema: SCHEMA },
        { department_id: departments.map(d => d.department_id) },
        {}
      );
    }
  }
};
