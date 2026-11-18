import auditModule from '../../audit';
const { auditComponentsDto: componentsAuditDtoModule } = auditModule;
const { ConsentTypeComponent } = componentsAuditDtoModule;

const ConsentTypeListDTO = (record: Parameters<typeof ConsentTypeComponent.buildList>[0]) => ConsentTypeComponent.buildList(record);

const ConsentTypeDTO = (record: Parameters<typeof ConsentTypeComponent.buildDetail>[0]) => ConsentTypeComponent.buildDetail(record);

export default { ConsentTypeListDTO, ConsentTypeDTO };
