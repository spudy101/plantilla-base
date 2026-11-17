// tests/unit/loadability/modules-shared-endpoints.loadability.test.ts
//
// Load-test de cargabilidad del subárbol `modules/shared-endpoints/` (core, kyc,
// notification — endpoints compartidos entre admin y client).
// Ver la mecánica en tests/helpers/loadability.js.

import loadabilityModule from 'tests/helpers/loadability';
const { describeLoadability } = loadabilityModule;

describeLoadability('modules/shared-endpoints');
