import kycModule from '../../../../../shared/dtos/kyc';
const { UserChangeLogComponent } = kycModule;
import componentsCatalogDtoModule from '../../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

function ListUserChangeLogsResponseDTO(rows: Array<Parameters<typeof UserChangeLogComponent.build>[0]>, metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(r => UserChangeLogComponent.build(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

function ListChangeLogsResponseDTO<T, R>(rows: T[], metadata: Parameters<typeof MetadataDTO.build>[0], buildFn: (row: T) => R) {
  return {
    data: Array.isArray(rows) ? rows.map(buildFn) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

export default {
  ListUserChangeLogsResponseDTO,
  ListChangeLogsResponseDTO
};
