// shared/validation/output.ts — piezas para los esquemas de SALIDA (responses/): describen lo que devuelve la
// API para tipar y documentar (no validan la entrada).
import { z } from './z';

/** Fecha que sale serializada como ISO 8601 (Date en el código, string en el JSON). */
export const dateTime = () => z.custom<Date | string>(v => v instanceof Date || typeof v === 'string').meta({ type: 'string', format: 'date-time' });

/** Metadata de un listado paginado (MetadataDTO / PaginationHelper.buildMetadata). */
export const PaginationMetadata = z
  .object({
    pagination: z.object({
      currentPage: z.number().int(),
      pageSize: z.number().int(),
      totalItems: z.number().int(),
      totalPages: z.number().int(),
      hasNextPage: z.boolean(),
      hasPreviousPage: z.boolean()
    }),
    sort: z.object({ field: z.string(), order: z.string() }).optional(),
    filters: z.record(z.string(), z.unknown()).optional()
  })
  .meta({ description: 'Paginación, orden y filtros aplicados.' });

/** Respuesta de listado: { data: Item[], metadata }. */
export const listOf = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item), metadata: PaginationMetadata });
