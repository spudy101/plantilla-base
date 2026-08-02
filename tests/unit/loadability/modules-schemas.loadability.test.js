// tests/unit/loadability/modules-schemas.loadability.test.js
//
// Load-test de cargabilidad del subárbol `modules/schemas/` (core, integration,
// kyc, notification, records — modelos Sequelize y definiciones de esquema).
// Ver la mecánica en tests/helpers/loadability.js.

const { describeLoadability } = require('tests/helpers/loadability');

describeLoadability('modules/schemas');
