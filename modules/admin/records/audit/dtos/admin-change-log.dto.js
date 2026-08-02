const { UserChangeLogComponent } = require('../../../../../shared/dtos/kyc');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');

function ListUserChangeLogsResponseDTO(rows, metadata) {
  return {
    data: Array.isArray(rows) ? rows.map(r => UserChangeLogComponent.build(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

function ListChangeLogsResponseDTO(rows, metadata, buildFn) {
  return {
    data: Array.isArray(rows) ? rows.map(buildFn) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

module.exports = {
  ListUserChangeLogsResponseDTO,
  ListChangeLogsResponseDTO
};
