import type * as Feed from '../notification-feed.types';
import componentsNotificationDtoModule from '../../../../shared/dtos/notification/components-notification.dto';
const {
  NotificationComponent,
  GlobalNotificationComponent
} = componentsNotificationDtoModule;
import componentsCatalogDtoModule from '../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

function _buildMixedItem(item: Feed.FeedItem, readIds: string[]) {
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
      isRead: readIds.includes(item.__instance.globalNotificationId)
    })
  };
}

function NotificationsListResponseDTO(result: Feed.MixedListResult) {
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

function PersonalNotificationsResponseDTO(result: Feed.PersonalListResult) {
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

function GlobalNotificationsResponseDTO(result: Feed.GlobalListResult) {
  const { rows, readIds, totalItems, paginationParams } = result;
  return {
    data: Array.isArray(rows)
      ? rows.map(item =>
          GlobalNotificationComponent.build(item.__instance, {
            includeType: true,
            isRead: readIds.includes(item.__instance.globalNotificationId)
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

function UnreadCountResponseDTO(count: number) {
  return { count };
}

export default {
  NotificationsListResponseDTO,
  PersonalNotificationsResponseDTO,
  GlobalNotificationsResponseDTO,
  UnreadCountResponseDTO
};
