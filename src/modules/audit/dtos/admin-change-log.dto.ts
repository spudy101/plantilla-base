import componentsAuthModule from '../../iam/dtos/auth-components.dto';
const { UserChangeLogComponent } = componentsAuthModule;
import componentsCatalogDtoModule from '../../catalogs/dtos/catalog-components.dto';
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
