import type { NotificationCategoryRow } from '../../../schemas/notification/repositories/notification-category.repository';
import componentsNotificationDtoModule from '../../../../shared/dtos/notification/components-notification.dto';
const { NotificationCategoryComponent } = componentsNotificationDtoModule;
import componentsCatalogDtoModule from '../../../../shared/dtos/kyc/components-catalog.dto';
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
