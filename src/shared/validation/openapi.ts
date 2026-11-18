// shared/validation/openapi.ts — el mismo esquema Zod que valida, convertido a schema OpenAPI 3.0 para
// Swagger. La documentación ya no se escribe a mano: no se puede desalinear de la validación.
import { z } from './z';

/**
 * `io`: 'input' para lo que recibe la API (request) y 'output' para lo que devuelve (response); importa
 * en campos con default o transformaciones.
 */
export function toOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'input'): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
    // La pista del campo viaja como extensión (x-hint): OpenAPI no admite claves propias sin prefijo
    override: ({ jsonSchema }) => {
      const js = jsonSchema as Record<string, unknown>;
      if ('hint' in js) {
        js['x-hint'] = js.hint;
        delete js.hint;
      }
    }
  }) as Record<string, unknown>;
}

export default { toOpenApi };
