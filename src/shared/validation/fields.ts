// shared/validation/fields.ts — campos genéricos reutilizables (sin negocio). Los campos de un dominio
// (documento, teléfono…) viven en su módulo.
import { z, withHint } from './z';

/** UUID. */
export const uuid = (label: string) =>
  withHint(z.uuid({ error: `${label} debe ser un UUID válido` }), { hint: 'Usá el id tal como lo devuelve la API' });

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
  withHint(z.string().trim().max(max, { error: `${label} admite máximo ${max} caracteres` }).nullish(), {
    hint: `Escribí hasta ${max} caracteres u omití el campo`
  });

/** Entero ≥ 1. Acepta el número como texto (query string / multipart). */
export const positiveInt = (label: string) =>
  withHint(z.coerce.number({ error: `${label} debe ser un número` }).int({ error: `${label} debe ser un entero` }).min(1, { error: `${label} debe ser mayor a 0` }), {
    hint: 'Usá un entero desde 1'
  });

/** Booleano estricto (true/false en JSON). */
export const bool = (label: string) => z.boolean({ error: `${label} debe ser true o false` });
