// Entrada de los catálogos (solo lectura): filtros de los listados.
import { z } from '../../../shared/validation/z';
import { input, optionalBool, optionalUuid, paginationQuery, searchQuery } from '../../../shared/validation/fields';

export const CatalogListQuery = input({
  ...paginationQuery,
  ...searchQuery,
  isActive: optionalBool('isActive'),
  countryId: optionalUuid('countryId'),
  themeId: optionalUuid('themeId'),
  departmentId: optionalUuid('departmentId'),
  priority: z.string({ error: 'priority debe ser un string' }).optional()
});
export type CatalogListQuery = z.infer<typeof CatalogListQuery>;
