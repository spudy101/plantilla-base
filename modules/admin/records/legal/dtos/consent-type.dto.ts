import componentsAuditDtoModule = require('../../../../../shared/dtos/audit/components-audit.dto');
const { ConsentTypeComponent } = componentsAuditDtoModule;

const ConsentTypeListDTO = (record: Parameters<typeof ConsentTypeComponent.buildList>[0]) => ConsentTypeComponent.buildList(record);

const ConsentTypeDTO = (record: Parameters<typeof ConsentTypeComponent.buildDetail>[0]) => ConsentTypeComponent.buildDetail(record);

export = { ConsentTypeListDTO, ConsentTypeDTO };
