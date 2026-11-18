import iamModule from '../../iam';
const { authComponentsDto: componentsAuthModule } = iamModule;
const { UserChangeLogComponent } = componentsAuthModule;
import catalogsModule from '../../catalogs';
const { catalogComponentsDto: componentsCatalogDtoModule } = catalogsModule;
const { MetadataDTO } = componentsCatalogDtoModule;

function ListUserChangeLogsResponseDTO(
  rows: Array<Parameters<typeof UserChangeLogComponent.build>[0]>,
  metadata: Parameters<typeof MetadataDTO.build>[0]
) {
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
