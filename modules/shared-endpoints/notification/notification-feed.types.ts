// modules/shared-endpoints/notification/notification-feed.types.ts
//
// Feed de notificaciones del usuario: personales + globales mezcladas y ordenadas por fecha.
// Lo arma NotificationService y lo serializan los DTOs. Solo tipos.
import type defineNotification from '../../schemas/notification/models/notification.model';
import type defineGlobalNotification from '../../schemas/notification/models/global-notification.model';
import type PaginationHelper from '../../../shared/utils/pagination.util';

export type PaginationParams = ReturnType<typeof PaginationHelper.getPaginationParams>;

/** Ítem del feed: unión discriminada por __type. */
export type FeedItem =
  | { __type: 'personal'; __instance: defineNotification.Instance; createdAt: Date; is_read: boolean | null }
  | { __type: 'global'; __instance: defineGlobalNotification.Instance; createdAt: Date; is_read: boolean };

export type GlobalFeedItem = Extract<FeedItem, { __type: 'global' }>;

export interface MixedListResult {
  mixed: FeedItem[];
  readIds: string[];
  totalItems: number;
  paginationParams: PaginationParams;
}

export interface PersonalListResult {
  rows: defineNotification.Instance[];
  count: number;
  paginationParams: PaginationParams;
}

export interface GlobalListResult {
  rows: GlobalFeedItem[];
  readIds: string[];
  totalItems: number;
  paginationParams: PaginationParams;
}
