// tests/unit/loadability/modules-admin.loadability.test.js
//
// Load-test de cargabilidad del subárbol `modules/admin/` (core, integration, kyc,
// notification, records). Ver la mecánica en tests/helpers/loadability.js.

const { describeLoadability } = require('tests/helpers/loadability');

describeLoadability('modules/admin');
