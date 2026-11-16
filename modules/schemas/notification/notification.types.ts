// modules/schemas/notification/notification.types.ts
//
// Formas compartidas entre los services de notificación (creación, envío, email, lotes). Solo tipos.
// Los services exportan instancias (`export =`), así que los tipos que cruzan archivos viven aquí.
import type defineNotificationType = require('./models/notification-type.model');
import type defineNotificationCategory = require('./models/notification-category.model');
import type defineUserNotificationPreference = require('../kyc/person/models/user-notification-preference.model');

export type ChannelKey = 'push' | 'email' | 'sms';

/** Flags supports_<canal> de la categoría (fuente de verdad de los canales del tipo). */
export type CategoryChannels = Partial<Record<`supports_${ChannelKey}`, boolean | null>>;

/** Lo que el email lee del notification_type: templates y la categoría (canal + layout). */
export type EmailTemplateSource = Pick<defineNotificationType.Instance, 'code' | 'email_subject_template' | 'email_body_template'> & {
  category?: Pick<defineNotificationCategory.Instance, 'supports_email' | 'email_layout_template'> | null;
};

/** notification_type con su categoría, tal como lo consumen el envío individual y el masivo. */
export type NotificationTypeSource = Omit<EmailTemplateSource, 'category'> & {
  priority?: defineNotificationType.Attributes['priority'];
  category?: (CategoryChannels & NonNullable<EmailTemplateSource['category']>) | null;
};

/** Preferencias del usuario: quiet hours + allow_<canal>. null/undefined → todo permitido. */
export type UserPreference =
  | (Partial<Pick<defineUserNotificationPreference.Attributes, 'quiet_hours_start' | 'quiet_hours_end'>> &
      Partial<Record<`allow_${ChannelKey}`, boolean | null>>)
  | null
  | undefined;
