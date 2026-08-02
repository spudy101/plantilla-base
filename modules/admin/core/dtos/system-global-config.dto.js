const { SystemGlobalConfigComponent } = require('../../../../shared/dtos/core/components-system-config.dto');

const SystemGlobalConfigDTO = record => SystemGlobalConfigComponent.build(record);

module.exports = { SystemGlobalConfigDTO };
