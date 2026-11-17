// tests/unit/loadability/modules-admin.loadability.test.ts
//
// Load-test de cargabilidad del subárbol `modules/admin/` (core, integration, kyc,
// notification, records). Ver la mecánica en tests/helpers/loadability.js.

import loadabilityModule from 'tests/helpers/loadability';
const { describeLoadability } = loadabilityModule;

describeLoadability('modules/admin');
