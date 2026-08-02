// modules/admin/kyc/dtos/admin-notification-type.dto.js

const { NotificationTypeComponent } = require('../../../../shared/dtos/notification/components-notification.dto');

const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');

/**
 * ============================================================
 * NOTIFICATION TYPE DTOs — ADMIN
 * ============================================================
 * Admin ve los templates completos — campos que el cliente nunca ve.
 */

function NotificationTypeAdminDTO(nt) {
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

function ListNotificationTypesResponseDTO(rows, metadata) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationTypeAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

function UpdateNotificationTypeResponseDTO(nt) {
  return NotificationTypeAdminDTO(nt);
}

function CreateGlobalNotificationResponseDTO({ global_notification_id: globalNotificationId, titulo, contenido, asunto }) {
  return {
    globalNotificationId,
    titulo,
    contenido,
    asunto,
    processingStatus: 'queued',
    createdAt: new Date()
  };
}

function CreateDirectNotificationResponseDTO({ notification_id: notificationId, userId, titulo, contenido, asunto }) {
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

module.exports = {
  NotificationTypeAdminDTO,
  ListNotificationTypesResponseDTO,
  UpdateNotificationTypeResponseDTO,
  CreateGlobalNotificationResponseDTO,
  CreateDirectNotificationResponseDTO
};
