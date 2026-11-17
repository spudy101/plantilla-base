import componentsSystemConfigDtoModule = require('../../../../shared/dtos/core/components-system-config.dto');
const { SystemGlobalConfigComponent } = componentsSystemConfigDtoModule;

const SystemGlobalConfigDTO = (record: Parameters<typeof SystemGlobalConfigComponent.build>[0]) => SystemGlobalConfigComponent.build(record);

export = { SystemGlobalConfigDTO };
