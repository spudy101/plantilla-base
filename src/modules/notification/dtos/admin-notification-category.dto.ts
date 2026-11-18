import type { NotificationCategoryRow } from '../repositories/notification-category.repository';
import componentsNotificationDtoModule from './notification-components.dto';
const { NotificationCategoryComponent } = componentsNotificationDtoModule;
import componentsCatalogDtoModule from '../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

// El admin ve el layout de email completo (includeLayout = true).

function NotificationCategoryAdminDTO(category: NotificationCategoryRow, extra: Record<string, unknown> = {}) {
  return {
    ...NotificationCategoryComponent.build(category, true),
    ...extra,
    updatedAt: category.updatedAt
  };
}

function ListNotificationCategoriesResponseDTO(rows: NotificationCategoryRow[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationCategoryAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

export default {
  NotificationCategoryAdminDTO,
  ListNotificationCategoriesResponseDTO
};
