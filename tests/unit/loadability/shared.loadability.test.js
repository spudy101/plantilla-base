// tests/unit/loadability/shared.loadability.test.js
//
// Load-test de cargabilidad del núcleo transversal `shared/` (utils, services,
// middlewares, validators, dtos, repositories, constants, etc.). Ver la mecánica
// y el porqué en tests/helpers/loadability.js.

const { describeLoadability } = require('tests/helpers/loadability');

describeLoadability('shared');
