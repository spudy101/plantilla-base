import componentsSystemConfigDtoModule from './system-config-components.response';
const { SystemGlobalConfigComponent } = componentsSystemConfigDtoModule;

const SystemGlobalConfigDTO = (record: Parameters<typeof SystemGlobalConfigComponent.build>[0]) => SystemGlobalConfigComponent.build(record);

export default { SystemGlobalConfigDTO };
