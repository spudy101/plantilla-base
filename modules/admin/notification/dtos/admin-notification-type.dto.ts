import type defineNotificationType from '../../../schemas/notification/models/notification-type.model';
// modules/admin/kyc/dtos/admin-notification-type.dto.ts

import componentsNotificationDtoModule from '../../../../shared/dtos/notification/components-notification.dto';
const { NotificationTypeComponent } = componentsNotificationDtoModule;

import componentsCatalogDtoModule from '../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

/**
 * ============================================================
 * NOTIFICATION TYPE DTOs — ADMIN
 * ============================================================
 * Admin ve los templates completos — campos que el cliente nunca ve.
 */

function NotificationTypeAdminDTO(nt: defineNotificationType.Instance) {
  const base = NotificationTypeComponent.build(nt);
  return {
    ...base,
    // Campos adicionales solo para admin
    titleTemplate: nt.title_template,
    bodyTemplate: nt.body_template,
    emailSubjectTemplate: nt.email_subject_template,
    emailBodyTemplate: nt.email_body_template,
    isActive: nt.is_active,
    updatedAt: nt.updatedAt
  };
}

function ListNotificationTypesResponseDTO(rows: defineNotificationType.Instance[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationTypeAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

function UpdateNotificationTypeResponseDTO(nt: defineNotificationType.Instance) {
  return NotificationTypeAdminDTO(nt);
}

function CreateGlobalNotificationResponseDTO({
  global_notification_id: globalNotificationId,
  titulo,
  contenido,
  asunto
}: { global_notification_id: string; titulo: string; contenido: string; asunto?: string | null }) {
  return {
    globalNotificationId,
    titulo,
    contenido,
    asunto,
    processingStatus: 'queued',
    createdAt: new Date()
  };
}

function CreateDirectNotificationResponseDTO({
  notification_id: notificationId,
  userId,
  titulo,
  contenido,
  asunto
}: { notification_id: string; userId: string; titulo: string; contenido: string; asunto?: string | null }) {
  return {
    notificationId,
    userId,
    titulo,
    contenido,
    asunto,
    processingStatus: 'queued',
    createdAt: new Date()
  };
}

export default {
  NotificationTypeAdminDTO,
  ListNotificationTypesResponseDTO,
  UpdateNotificationTypeResponseDTO,
  CreateGlobalNotificationResponseDTO,
  CreateDirectNotificationResponseDTO
};
