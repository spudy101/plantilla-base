const {
  NotificationComponent,
  GlobalNotificationComponent
} = require('../../../../shared/dtos/notification/components-notification.dto');
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');

function _buildMixedItem(item, readIds) {
  if (item.__type === 'personal') {
    return {
      type: 'personal',
      ...NotificationComponent.build(item.__instance, { includeType: true })
    };
  }
  return {
    type: 'global',
    ...GlobalNotificationComponent.build(item.__instance, {
      includeType: true,
      isRead: readIds.includes(item.__instance.global_notification_id)
    })
  };
}

function NotificationsListResponseDTO(result) {
  const { mixed, readIds, totalItems, paginationParams } = result;
  return {
    data: Array.isArray(mixed) ? mixed.map(item => _buildMixedItem(item, readIds)) : [],
    metadata: MetadataDTO.build({
      totalItems,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: {}
    })
  };
}

function PersonalNotificationsResponseDTO(result) {
  const { rows, count, paginationParams } = result;
  return {
    data: NotificationComponent.buildArray(Array.isArray(rows) ? rows : [], { includeType: true }),
    metadata: MetadataDTO.build({
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: {}
    })
  };
}

function GlobalNotificationsResponseDTO(result) {
  const { rows, readIds, totalItems, paginationParams } = result;
  return {
    data: Array.isArray(rows)
      ? rows.map(item =>
          GlobalNotificationComponent.build(item.__instance, {
            includeType: true,
            isRead: readIds.includes(item.__instance.global_notification_id)
          })
        )
      : [],
    metadata: MetadataDTO.build({
      totalItems,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: {}
    })
  };
}

function UnreadCountResponseDTO(count) {
  return { count };
}

module.exports = {
  NotificationsListResponseDTO,
  PersonalNotificationsResponseDTO,
  GlobalNotificationsResponseDTO,
  UnreadCountResponseDTO
};
