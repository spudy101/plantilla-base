// Seeder de tipos de consentimiento base del template.
//
// PRIVACY_POLICY es el documento único obligatorio (Política de Privacidad + Términos y
// Condiciones + Tratamiento de Datos). COMUNICACIONES_COMERCIALES es el consentimiento
// opcional de marketing (revocable). Agrega aquí los consentimientos propios de tu dominio.
// Inserta los consentimientos en un solo bulkInsert idempotente (ignoreDuplicates por code unique).

import type { QueryOptions } from 'sequelize';
import type { Migration } from '../shared/types/migration';

// bulkInsert respeta ignoreDuplicates (lo lee el query generator) aunque QueryOptions no lo declare
const IGNORE_DUPLICATES: QueryOptions & { ignoreDuplicates: boolean } = { ignoreDuplicates: true };
import uuidModule = require('uuid');
const { v4: uuidv4 } = uuidModule;
import constantsModule = require('../shared/constants');
const { database } = constantsModule;

const SCHEMA = database.schema;
const TABLE = { tableName: 'consent_types', schema: SCHEMA };

const CONSENT_TYPES = [
  {
    code: 'PRIVACY_POLICY',
    name: 'Política de Privacidad, Términos y Condiciones y Tratamiento de Datos',
    description:
      'Autorización de tratamiento de datos personales (Ley 1581/2012 y Decreto 1377/2013). ' +
      'Este documento único cubre la Política de Privacidad, los Términos y Condiciones de uso ' +
      'del servicio, y el tratamiento de datos personales.',
    scope: 'ONBOARDING',
    is_mandatory: true,
    is_revocable: false
  },
  {
    code: 'COMUNICACIONES_COMERCIALES',
    name: 'Comunicaciones Comerciales y Marketing',
    description:
      'Autorización para recibir comunicaciones comerciales, promociones y notificaciones de ' +
      'marketing por parte de la entidad. Es opcional y puede revocarse en cualquier momento.',
    scope: 'ONBOARDING',
    is_mandatory: false,
    is_revocable: true
  }
];

export default {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert(
      TABLE,
      CONSENT_TYPES.map(c => ({
        consent_type_id: uuidv4(),
        code: c.code,
        name: c.name,
        description: c.description,
        scope: c.scope,
        is_mandatory: c.is_mandatory,
        is_revocable: c.is_revocable,
        is_active: true,
        created_at: now,
        updated_at: now
      })),
      IGNORE_DUPLICATES
    );
  },

  async down(queryInterface, Sequelize) {
    const codes = CONSENT_TYPES.map(c => c.code);
    await queryInterface.bulkDelete(TABLE, { code: { [Sequelize.Op.in]: codes } });
  }
} satisfies Migration;
