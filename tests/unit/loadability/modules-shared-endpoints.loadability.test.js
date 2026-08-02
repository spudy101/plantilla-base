// tests/unit/loadability/modules-shared-endpoints.loadability.test.js
//
// Load-test de cargabilidad del subárbol `modules/shared-endpoints/` (core, kyc,
// notification — endpoints compartidos entre admin y client).
// Ver la mecánica en tests/helpers/loadability.js.

const { describeLoadability } = require('tests/helpers/loadability');

describeLoadability('modules/shared-endpoints');
