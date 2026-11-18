// Entrada del módulo de notificaciones: bandeja del usuario, preferencias, verificación de contacto y
// administración (categorías, tipos, entregas).
import { z, withHint } from '../../../shared/validation/z';
import {
  input,
  optionalBool,
  optionalInList,
  optionalIsoDate,
  optionalUuid,
  paginationQuery,
  searchQuery,
  uuid
} from '../../../shared/validation/fields';
import DomainEnums from '../../../shared/constants/domain-enums';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

const priority = optionalInList(PRIORITIES, {
  message: 'priority debe ser "low", "normal", "high" o "urgent"',
  hint: 'Indicá uno de: low, normal, high, urgent'
});
const time = (field: string) =>
  withHint(z.string().regex(TIME_REGEX, { error: `${field} debe tener formato HH:MM o HH:MM:SS` }).nullish(), { hint: 'Ingresá la hora en formato HH:MM' });
const bodyBool = (field: string) => optionalBool(field);

// ── Bandeja del usuario ───────────────────────────────────────
export const NotificationListQuery = input({ ...paginationQuery, ...searchQuery });

// ── Preferencias ──────────────────────────────────────────────
const EDITABLE_FIELDS = ['allowPush', 'allowEmail', 'allowSms', 'quietHoursStart', 'quietHoursEnd'] as const;
export const UpdatePreferenceBody = input({
  allowPush: bodyBool('allowPush'),
  allowEmail: bodyBool('allowEmail'),
  allowSms: bodyBool('allowSms'),
  quietHoursStart: time('quietHoursStart'),
  quietHoursEnd: time('quietHoursEnd')
}).refine(v => EDITABLE_FIELDS.some(f => (v as Record<string, unknown>)[f] !== undefined), {
  error: 'Debe enviar al menos un campo para actualizar las preferencias'
});
export const CategoryCodeParams = input({
  categoryCode: withHint(
    z
      .string({ error: 'categoryCode es requerido' })
      .min(1, { error: 'categoryCode es requerido' })
      .regex(/^[A-Z0-9_]{2,100}$/, { error: 'categoryCode inválido' }),
    { hint: 'Ej: SECURITY, ACCOUNT' }
  )
});

// ── Verificación de email / teléfono ──────────────────────────
const verificationType = withHint(
  z
    .string({ error: 'El tipo de verificación es requerido' })
    .trim()
    .min(1, { error: 'El tipo de verificación es requerido' })
    .pipe(z.enum(['email', 'phone'], { error: 'Tipo de verificación inválido. Debe ser email o phone' })),
  { hint: 'Indicá email o phone' }
);
const contact = (max?: number) =>
  withHint(
    max === undefined
      ? z.string({ error: 'El contacto es requerido' }).trim().min(1, { error: 'El contacto es requerido' })
      : z.string({ error: 'El contacto es requerido' }).trim().min(1, { error: 'El contacto es requerido' }).max(max, { error: `El contacto admite máximo ${max} caracteres` }),
    { hint: 'Ingresá el email o teléfono a verificar' }
  );

export const SendVerificationBody = input({
  type: verificationType,
  contact: contact(100),
  phonePrefixId: z.unknown().optional()
}).superRefine((v, ctx) => {
  if (v.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contact)) {
    ctx.addIssue({ code: 'custom', path: ['contact'], message: 'Debe ser un email válido' });
  }
  if (v.type === 'phone') {
    if (!/^\d{7,15}$/.test(v.contact)) {
      ctx.addIssue({ code: 'custom', path: ['contact'], message: 'Debe ser un número de teléfono válido (7-15 dígitos)' });
    }
    const prefix = uuid('phonePrefixId').safeParse(v.phonePrefixId);
    if (!prefix.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['phonePrefixId'],
        message: v.phonePrefixId === undefined || v.phonePrefixId === '' ? 'phonePrefixId es requerido cuando el tipo es phone' : 'phonePrefixId debe ser un UUID válido'
      });
    }
  }
});

export const VerifyCodeBody = input({
  type: verificationType,
  contact: contact(),
  code: withHint(
    z
      .string({ error: 'El código es requerido' })
      .trim()
      .min(1, { error: 'El código es requerido' })
      .min(4, { error: 'El código debe tener entre 4 y 8 caracteres' })
      .max(8, { error: 'El código debe tener entre 4 y 8 caracteres' }),
    { hint: 'Ingresá el código que recibiste, entre 4 y 8 caracteres' }
  )
});

// ── Categorías (admin) ────────────────────────────────────────
export const CategoryListQuery = input({
  ...paginationQuery,
  ...searchQuery,
  isActive: optionalBool('El estado'),
  isCritical: optionalBool('La criticidad'),
  priority
});
export const CategoryIdParams = input({ notificationCategoryId: uuid('La categoría de notificación') });

const editableCategory = {
  description: z.string().trim().max(1000).nullish(),
  supportsPush: bodyBool('supportsPush'),
  supportsEmail: bodyBool('supportsEmail'),
  supportsSms: bodyBool('supportsSms'),
  allowDnd: bodyBool('allowDnd'),
  isCritical: bodyBool('isCritical'),
  defaultQuietHoursStart: time('defaultQuietHoursStart'),
  defaultQuietHoursEnd: time('defaultQuietHoursEnd'),
  priority,
  emailLayoutTemplate: z.string().max(20000).nullish(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: bodyBool('isActive')
};
export const CreateCategoryBody = input({
  code: withHint(
    z
      .string({ error: 'code es requerido' })
      .trim()
      .min(1, { error: 'code es requerido' })
      .regex(/^[A-Z0-9_]{2,100}$/, { error: 'code debe ser MAYÚSCULAS/números/guion bajo (2-100)' }),
    { hint: 'Ej: COMMERCIAL, SECURITY' }
  ),
  name: z.string({ error: 'name es requerido' }).trim().min(2, { error: 'name debe tener entre 2 y 200 caracteres' }).max(200, { error: 'name debe tener entre 2 y 200 caracteres' }),
  ...editableCategory
});
export const UpdateCategoryBody = input({
  name: z.string().trim().min(2, { error: 'name debe tener entre 2 y 200 caracteres' }).max(200, { error: 'name debe tener entre 2 y 200 caracteres' }).optional(),
  ...editableCategory
});

// ── Tipos de notificación (admin) ─────────────────────────────
export const TypeListQuery = input({
  ...paginationQuery,
  ...searchQuery,
  isActive: optionalBool('El estado'),
  notificationCategoryId: optionalUuid('notificationCategoryId'),
  priority
});
export const TypeIdParams = input({ notificationTypeId: uuid('El tipo de notificación') });
export const UpdateTypeBody = input({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  priority,
  notificationCategoryId: withHint(z.uuid({ error: 'notificationCategoryId debe ser un UUID válido' }).nullish(), {
    hint: 'Usá el identificador de la categoría (formato UUID)'
  })
});

const lengthBetween = (field: string, min: number, max?: number) => {
  const range = max === undefined ? `al menos ${min} caracteres` : `entre ${min} y ${max} caracteres`;
  let schema = z
    .string({ error: `${field} es requerido` })
    .trim()
    .min(1, { error: `${field} es requerido` })
    .min(min, { error: `${field} debe tener ${range}` });
  if (max !== undefined) {
    schema = schema.max(max, { error: `${field} debe tener ${range}` });
  }
  return withHint(schema, { hint: max === undefined ? `Usá al menos ${min} caracteres` : `Usá entre ${min} y ${max} caracteres` });
};
const globalNotification = {
  titulo: lengthBetween('titulo', 3, 255),
  contenido: lengthBetween('contenido', 3),
  asunto: lengthBetween('asunto', 3, 255)
};
export const GlobalNotificationBody = input(globalNotification);
export const DirectNotificationBody = input({
  userId: withHint(
    z.uuid({ error: issue => (issue.input === undefined || issue.input === '' ? 'userId es requerido' : 'userId debe ser un UUID válido') }),
    { hint: 'Indicá el UUID del usuario destinatario' }
  ),
  ...globalNotification
});

// ── Entregas (admin) ──────────────────────────────────────────
const VALID_STATUSES: string[] = Object.values(DomainEnums.NOTIFICATION_PROCESSING_STATUS);
const VALID_CHANNELS = ['email', 'push', 'sms', 'all'];
const deliveryRange = { userId: optionalUuid('El ID de usuario'), from: optionalIsoDate('from'), to: optionalIsoDate('to') };
export const DeliveryListQuery = input({
  ...paginationQuery,
  processingStatus: optionalInList(VALID_STATUSES, {
    message: `processingStatus debe ser: ${VALID_STATUSES.join(', ')}`,
    hint: `Indicá uno de los valores: ${VALID_STATUSES.join(', ')}`
  }),
  channel: optionalInList(VALID_CHANNELS, { message: `channel debe ser: ${VALID_CHANNELS.join(', ')}`, hint: `Indicá uno de los valores: ${VALID_CHANNELS.join(', ')}` }),
  ...deliveryRange,
  onlyCritical: withHint(optionalBool('onlyCritical'), { hint: 'Enviá true para listar solo notificaciones críticas' })
});
export const DeliveryMetricsQuery = input(deliveryRange);
export const DeliveryIdParams = input({ id: uuid('La notificación') });
