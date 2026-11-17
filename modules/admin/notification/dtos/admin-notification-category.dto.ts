import type defineNotificationCategory from '../../../schemas/notification/models/notification-category.model';
import componentsNotificationDtoModule from '../../../../shared/dtos/notification/components-notification.dto';
const { NotificationCategoryComponent } = componentsNotificationDtoModule;
import componentsCatalogDtoModule from '../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

// El admin ve el layout de email completo (includeLayout = true).

function NotificationCategoryAdminDTO(category: defineNotificationCategory.Instance, extra: Record<string, unknown> = {}) {
  return {
    ...NotificationCategoryComponent.build(category, true),
    ...extra,
    updatedAt: category.updatedAt
  };
}

function ListNotificationCategoriesResponseDTO(rows: defineNotificationCategory.Instance[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationCategoryAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

export default {
  NotificationCategoryAdminDTO,
  ListNotificationCategoriesResponseDTO
};
