const { ConsentTypeComponent } = require('../../../../../shared/dtos/audit/components-audit.dto');

const ConsentTypeListDTO = record => ConsentTypeComponent.buildList(record);

const ConsentTypeDTO = record => ConsentTypeComponent.buildDetail(record);

module.exports = { ConsentTypeListDTO, ConsentTypeDTO };
