// seeders/20260520000001-document-types.ts
//
// Seeder consolidado de tipos de documento. Fusiona y reemplaza a:
//   - 20260520000001-document-types.js (CC, CE, TI, PA, PPT, SYSTEM)
//   - 20260522000001-add-pep-document-type.js (PEP)
//
// Inserta los 7 tipos en un solo bulkInsert idempotente (ignoreDuplicates por code).

import type { QueryOptions } from 'sequelize';
import type { Migration } from '../shared/types/migration';

// bulkInsert respeta ignoreDuplicates (lo lee el query generator) aunque QueryOptions no lo declare
const IGNORE_DUPLICATES: QueryOptions & { ignoreDuplicates: boolean } = { ignoreDuplicates: true };
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;

const DOCUMENT_TYPES = [
  {
    code: 'CC',
    name: 'Cédula de Ciudadanía',
    is_visible_to_client: true
  },
  {
    code: 'CE',
    name: 'Cédula de Extranjería',
    is_visible_to_client: true
  },
  {
    code: 'TI',
    name: 'Tarjeta de Identidad',
    is_visible_to_client: true
  },
  {
    code: 'PA',
    name: 'Pasaporte',
    is_visible_to_client: true
  },
  {
    code: 'PPT',
    name: 'Permiso de Protección Temporal',
    is_visible_to_client: true
  },
  {
    code: 'PEP',
    name: 'Permiso Especial de Permanencia',
    is_visible_to_client: true
  },
  {
    // Tipo interno para usuarios administrativos — no visible en el formulario de registro
    code: 'SYSTEM',
    name: 'Usuario de Sistema',
    is_visible_to_client: false
  }
];

export default {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert(
      { tableName: 'document_types', schema: SCHEMA },
      DOCUMENT_TYPES.map(doc => ({
        document_type_id: uuidv4(),
        code: doc.code,
        name: doc.name,
        is_visible_to_client: doc.is_visible_to_client,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })),
      IGNORE_DUPLICATES
    );

    console.log('✅ Tipos de documento creados exitosamente (CC, CE, TI, PA, PPT, PEP, SYSTEM)');
  },

  down: async (queryInterface, Sequelize) => {
    const codes = DOCUMENT_TYPES.map(d => d.code);
    await queryInterface.bulkDelete({ tableName: 'document_types', schema: SCHEMA }, { code: { [Sequelize.Op.in]: codes } }, {});
  }
} satisfies Migration;
