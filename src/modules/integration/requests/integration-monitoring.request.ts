// Entrada del monitoreo de integraciones (solo lectura): filtros de tableros y bitácora de llamadas.
import { z, withHint } from '../../../shared/validation/z';
import { input, optionalIsoDate, optionalUuid, paginationQuery, uuid } from '../../../shared/validation/fields';
import domainEnumsModule from '../../../shared/constants/domain-enums';
const { INTEGRATION_PRODUCTS: PRODUCTS, INTEGRATION_RESULTS: RESULTS } = domainEnumsModule;

const valueOf = (field: string, values: readonly string[]) =>
  withHint(
    z
      .string()
      .refine(v => values.includes(v), { error: `${field} debe ser uno de: ${values.join(', ')}` })
      .optional(),
    { hint: `Valores válidos: ${values.join(', ')}` }
  );

const range = { from: optionalIsoDate('La fecha desde'), to: optionalIsoDate('La fecha hasta') };

export const DashboardQuery = input(range);

export const LogsQuery = input({
  product: valueOf('product', PRODUCTS),
  result: valueOf('result', RESULTS),
  userId: optionalUuid('El usuario'),
  sessionId: optionalUuid('La sesión'),
  ...range,
  ...paginationQuery
});

export const LogIdParams = input({ apiLogId: uuid('El registro de llamada') });

export const FallbackQuery = input({
  provider: z.string().trim().max(50).optional(),
  // Se deja como texto ('true' / 'false'): el service lo compara así
  activeOnly: withHint(z.enum(['true', 'false', '1', '0'], { error: 'activeOnly debe ser booleano' }).optional(), { hint: 'Usá true o false' }),
  ...range,
  ...paginationQuery
});
