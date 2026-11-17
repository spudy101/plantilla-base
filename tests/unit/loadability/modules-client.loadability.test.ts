// tests/unit/loadability/modules-client.loadability.test.ts
//
// Load-test de cargabilidad del subárbol `modules/client/` (kyc, notification,
// records). Ver la mecánica en tests/helpers/loadability.js.

import loadabilityModule from 'tests/helpers/loadability';
const { describeLoadability } = loadabilityModule;

describeLoadability('modules/client');
