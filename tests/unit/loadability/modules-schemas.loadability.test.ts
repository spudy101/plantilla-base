// tests/unit/loadability/modules-schemas.loadability.test.ts
//
// Load-test de cargabilidad del subárbol `modules/schemas/` (core, integration,
// kyc, notification, records — modelos Sequelize y definiciones de esquema).
// Ver la mecánica en tests/helpers/loadability.js.

import loadabilityModule from 'tests/helpers/loadability';
const { describeLoadability } = loadabilityModule;

describeLoadability('modules/schemas');
