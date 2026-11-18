import type { NotificationTypeWithCategory } from '../repositories/notification-type.repository';
// modules/admin/kyc/dtos/admin-notification-type.dto.ts

import componentsNotificationDtoModule from './notification-components.dto';
const { NotificationTypeComponent } = componentsNotificationDtoModule;

import componentsCatalogDtoModule from '../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

/**
 * ============================================================
 * NOTIFICATION TYPE DTOs — ADMIN
 * ============================================================
 * Admin ve los templates completos — campos que el cliente nunca ve.
 */

function NotificationTypeAdminDTO(nt: NotificationTypeWithCategory) {
  const base = NotificationTypeComponent.build(nt);
  return {
    ...base,
    // Campos adicionales solo para admin
    titleTemplate: nt.titleTemplate,
    bodyTemplate: nt.bodyTemplate,
    emailSubjectTemplate: nt.emailSubjectTemplate,
    emailBodyTemplate: nt.emailBodyTemplate,
    isActive: nt.isActive,
    updatedAt: nt.updatedAt
  };
}

function ListNotificationTypesResponseDTO(rows: NotificationTypeWithCategory[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(r => NotificationTypeAdminDTO(r)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

function UpdateNotificationTypeResponseDTO(nt: NotificationTypeWithCategory) {
  return NotificationTypeAdminDTO(nt);
}

function CreateGlobalNotificationResponseDTO({
  globalNotificationId,
  titulo,
  contenido,
  asunto
}: { globalNotificationId: string; titulo: string; contenido: string; asunto?: string | null }) {
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
  notificationId,
  userId,
  titulo,
  contenido,
  asunto
}: { notificationId: string; userId: string; titulo: string; contenido: string; asunto?: string | null }) {
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
