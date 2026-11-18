import componentsSystemConfigDtoModule from './system-config-components.dto';
const { SystemGlobalConfigComponent } = componentsSystemConfigDtoModule;

const SystemGlobalConfigDTO = (record: Parameters<typeof SystemGlobalConfigComponent.build>[0]) => SystemGlobalConfigComponent.build(record);

export default { SystemGlobalConfigDTO };
