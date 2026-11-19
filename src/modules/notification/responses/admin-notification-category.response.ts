import { z } from '../../../shared/validation/z';
import { dateTime } from '../../../shared/validation/output';
import { NotificationCategorySchema } from './notification-components.response';
import type { NotificationCategoryRow } from '../repositories/notification-category.repository';
import componentsNotificationDtoModule from './notification-components.response';
const { NotificationCategoryComponent } = componentsNotificationDtoModule;
import catalogsModule from '../../catalogs';
const { catalogComponentsDto: componentsCatalogDtoModule } = catalogsModule;
const { MetadataDTO } = componentsCatalogDtoModule;

// El admin ve el layout de email completo (includeLayout = true).

function NotificationCategoryAdminDTO(category: NotificationCategoryRow, extra: Record<string, unknown> = {}) {
  return {
    ...NotificationCategoryComponent.build(category, true),
    ...extra,
    updatedAt: category.updatedAt
  };
}

function ListNotificationCategoriesResponseDTO(
  rows: NotificationCategoryRow[],
  metadata: Parameters<typeof MetadataDTO.build>[0]
) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationCategoryAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

export default {
  NotificationCategoryAdminDTO,
  ListNotificationCategoriesResponseDTO
};

// ── Esquemas de salida ──
export const NotificationCategoryAdminSchema = NotificationCategorySchema.extend({
  emailLayoutTemplate: z.string().nullable().meta({ description: 'Layout HTML del email ({{content}} = cuerpo del tipo).' }),
  updatedAt: dateTime()
});

export const NotificationCategoryDeletedSchema = z.object({ notificationCategoryId: z.uuid(), deleted: z.literal(true) });
export type NotificationCategoryDeleted = z.infer<typeof NotificationCategoryDeletedSchema>;
