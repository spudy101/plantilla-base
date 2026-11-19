// Entrada del monitoreo de proveedores (solo lectura): filtros del historial de caídas.
import { z, withHint } from '../../../shared/validation/z';
import { input, optionalIsoDate, paginationQuery } from '../../../shared/validation/fields';

export const FallbackQuery = input({
  provider: z.string().trim().max(50).optional(),
  // Se deja como texto ('true' / 'false'): el service lo compara así
  activeOnly: withHint(z.enum(['true', 'false', '1', '0'], { error: 'activeOnly debe ser booleano' }).optional(), {
    hint: 'Usá true o false'
  }),
  from: optionalIsoDate('La fecha desde'),
  to: optionalIsoDate('La fecha hasta'),
  ...paginationQuery
});
