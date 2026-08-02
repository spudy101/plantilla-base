const { NotificationCategoryComponent } = require('../../../../shared/dtos/notification/components-notification.dto');
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');

// El admin ve el layout de email completo (includeLayout = true).

function NotificationCategoryAdminDTO(category, extra = {}) {
  return {
    ...NotificationCategoryComponent.build(category, true),
    ...extra,
    updatedAt: category.updatedAt
  };
}

function ListNotificationCategoriesResponseDTO(rows, metadata) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationCategoryAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

module.exports = {
  NotificationCategoryAdminDTO,
  ListNotificationCategoriesResponseDTO
};
