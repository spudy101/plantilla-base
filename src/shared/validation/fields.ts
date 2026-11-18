// shared/validation/fields.ts — campos genéricos reutilizables (sin negocio), con los mismos mensajes y
// pistas que tenía BaseValidator. Los campos de un dominio (documento, nombres, contraseña…) viven en su
// módulo. Los de query/params aceptan el valor como texto y lo convierten (número, fecha, booleano).
import { z, withHint } from './z';
import constantsModule from '../constants';
const { REGEX } = constantsModule;

const UUID_HINT = 'El identificador debe ser un UUID válido';

/** UUID requerido. */
export const uuid = (label: string) =>
  withHint(z.uuid({ error: issue => (issue.input === undefined || issue.input === '' ? `${label} es requerido` : `${label} debe ser un UUID válido`) }), {
    hint: UUID_HINT
  });

/** UUID opcional (puede faltar o venir en null). */
export const optionalUuid = (label: string) => withHint(uuid(label).nullish(), { hint: UUID_HINT });

interface TextOptions {
  min?: number;
  max: number;
}

/** Texto obligatorio (recortado), entre `min` (1 por defecto) y `max` caracteres. */
export const text = (label: string, { min = 1, max }: TextOptions) =>
  withHint(
    z
      .string({ error: `${label} es requerido` })
      .trim()
      .min(min, { error: min === 1 ? `${label} es requerido` : `${label} debe tener al menos ${min} caracteres` })
      .max(max, { error: `${label} admite máximo ${max} caracteres` }),
    { hint: min === 1 ? `Escribí hasta ${max} caracteres` : `Escribí entre ${min} y ${max} caracteres` }
  );

/** Texto opcional: puede faltar o venir en null. */
export const optionalText = (label: string, max: number) =>
  withHint(z.string({ error: `${label} debe ser texto` }).trim().max(max, { error: `${label} admite máximo ${max} caracteres` }).nullish(), {
    hint: `Escribí hasta ${max} caracteres u omití el campo`
  });

/** Entero ≥ 1. Acepta el número como texto (query string / multipart). */
export const positiveInt = (label: string) =>
  withHint(
    z.coerce
      .number({ error: `${label} debe ser un número` })
      .int({ error: `${label} debe ser un entero` })
      .min(1, { error: `${label} debe ser mayor a 0` }),
    { hint: 'Usá un entero desde 1' }
  );

/** Booleano estricto (true/false en JSON). */
export const bool = (label: string) => z.boolean({ error: `${label} debe ser true o false` });

const BOOL_STRINGS: Record<string, boolean> = { true: true, false: false, 1: true, 0: false };

/** Booleano que acepta true/false o su texto ('true'/'false'/'1'/'0'): query string y JSON. */
export const flexibleBool = (label = 'El valor') =>
  withHint(
    z.preprocess(
      v => (typeof v === 'string' && v.trim().toLowerCase() in BOOL_STRINGS ? BOOL_STRINGS[v.trim().toLowerCase()] : v),
      z.boolean({ error: `${label} debe ser un valor booleano` })
    ),
    { hint: 'Ingresá true o false' }
  );

/** Booleano opcional (true/false o su texto). */
export const optionalBool = (label = 'El valor') => withHint(flexibleBool(label).nullish(), { hint: 'Ingresá true o false' });

/** Fecha ISO 8601 opcional → Date. */
export const optionalIsoDate = (label = 'La fecha') =>
  withHint(
    z.preprocess(
      v => (v === '' ? undefined : v),
      z
        .string({ error: `${label} debe ser una fecha válida (YYYY-MM-DD)` })
        .refine(s => /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s)), { error: `${label} debe ser una fecha válida (YYYY-MM-DD)` })
        .transform(s => new Date(s))
        .nullish()
    ),
    { hint: 'Ingresá una fecha válida en formato YYYY-MM-DD', format: 'date' }
  );

/** Email. */
export const email = (label = 'El email') =>
  withHint(
    z
      .string({ error: `${label} es requerido` })
      .trim()
      .min(1, { error: `${label} es requerido` })
      .max(255, { error: 'El email no puede superar los 255 caracteres' })
      .regex(REGEX.EMAIL, { error: 'Debe ser un email válido' }),
    { hint: 'Ingresá un correo válido, por ejemplo usuario@dominio.com' }
  );

/** Uno de los valores permitidos. */
export const oneOf = <T extends readonly [string, ...string[]]>(label: string, values: T) =>
  withHint(z.enum(values, { error: `${label} debe ser: ${values.join(', ')}` }), { hint: `Indicá uno de: ${values.join(', ')}` });

/** page/limit/sortBy/order de los listados paginados (query). */
export const paginationQuery = {
  page: withHint(z.coerce.number({ error: 'La página debe ser un número entero mayor a 0' }).int({ error: 'La página debe ser un número entero mayor a 0' }).min(1, { error: 'La página debe ser un número entero mayor a 0' }).optional(), {
    hint: 'Ingresá un número de página mayor a 0'
  }),
  limit: withHint(
    z.coerce.number({ error: 'El límite debe ser un número entre 1 y 100' }).int({ error: 'El límite debe ser un número entre 1 y 100' }).min(1, { error: 'El límite debe ser un número entre 1 y 100' }).max(100, { error: 'El límite debe ser un número entre 1 y 100' }).optional(),
    { hint: 'Ingresá un límite entre 1 y 100' }
  ),
  sortBy: withHint(z.string().trim().max(50, { error: 'El campo de ordenamiento es inválido' }).optional(), {
    hint: 'Indicá un campo de ordenamiento de hasta 50 caracteres'
  }),
  order: withHint(z.enum(['ASC', 'DESC', 'asc', 'desc'], { error: 'El orden debe ser ASC o DESC' }).optional(), { hint: 'Indicá ASC o DESC' })
};

/** Término de búsqueda (query). */
export const searchQuery = {
  search: withHint(z.string({ error: 'search debe ser un string' }).trim().max(100, { error: 'El término de búsqueda no puede superar 100 caracteres' }).optional(), {
    hint: 'Usá hasta 100 caracteres en la búsqueda'
  })
};

/**
 * Objeto de entrada. Durante la migración desde express-validator los esquemas aceptan campos que no
 * declaran (como antes): hay services que leen alguno sin regla. Para código nuevo, preferí z.object
 * (descarta lo que no está declarado).
 */
export const input = <T extends z.core.$ZodLooseShape>(shape: T) => z.looseObject(shape);

/** Archivo de un multipart (req.files[campo][0]): presencia, tipo y tamaño. */
export const fileField = (field: string, { mimeTypes, maxSizeMb = 10 }: { mimeTypes: readonly string[]; maxSizeMb?: number }) => {
  const message = `El archivo debe ser ${mimeTypes.join(', ')} y no superar ${maxSizeMb}MB`;
  const maxBytes = maxSizeMb * 1024 * 1024;
  return withHint(
    z
      .array(
        z.object({ mimetype: z.string(), size: z.number() }).refine(f => mimeTypes.includes(f.mimetype) && f.size <= maxBytes, { error: message }),
        { error: message }
      )
      .min(1, { error: message }),
    { hint: `Adjuntá un archivo ${mimeTypes.join(', ')} de hasta ${maxSizeMb}MB en el campo "${field}"` }
  );
};

/** Texto opcional que debe ser uno de `values` (lista calculada en tiempo de ejecución, p. ej. de un catálogo). */
export const optionalInList = (values: readonly string[], { message, hint }: { message: string; hint: string }) =>
  withHint(
    z
      .string({ error: message })
      .trim()
      .refine(v => values.includes(v), { error: message })
      .optional(),
    { hint }
  );

/** Texto opcional de hasta `max` caracteres (filtros de query). */
export const optionalMax = (field: string, max: number) =>
  withHint(z.string().trim().max(max, { error: `${field} no puede superar ${max} caracteres` }).optional(), { hint: `Escribí hasta ${max} caracteres` });
