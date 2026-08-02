// tests/unit/loadability/modules-client.loadability.test.js
//
// Load-test de cargabilidad del subárbol `modules/client/` (kyc, notification,
// records). Ver la mecánica en tests/helpers/loadability.js.

const { describeLoadability } = require('tests/helpers/loadability');

describeLoadability('modules/client');
