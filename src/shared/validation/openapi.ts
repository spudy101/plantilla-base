// shared/validation/openapi.ts — los mismos esquemas Zod que validan (requests/) y que describen las
// respuestas (responses/), convertidos a OpenAPI 3.0 para Swagger. La documentación de los datos no se
// escribe a mano: no puede desalinearse de lo que la API valida y devuelve.
import { z } from './z';

/**
 * Schema OpenAPI 3.0 de un esquema Zod. `io`: 'input' para lo que recibe la API (request) y 'output' para
 * lo que devuelve (response); importa en campos con default o transformaciones.
 */
export function toOpenApi(schema: z.ZodType, io: 'input' | 'output' = 'input'): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
    override: ({ jsonSchema }) => {
      const js = jsonSchema as Record<string, unknown>;
      // La pista del campo viaja como extensión (x-hint): OpenAPI no admite claves propias sin prefijo
      if ('hint' in js) {
        js['x-hint'] = js.hint;
        delete js.hint;
      }
      // Ruido de Zod que no aporta a quien lee la documentación
      if (js.format === 'uuid') {
        delete js.pattern;
      }
      if (js.maximum === Number.MAX_SAFE_INTEGER) {
        delete js.maximum;
      }
      if (js.minimum === Number.MIN_SAFE_INTEGER) {
        delete js.minimum;
      }
    }
  }) as Record<string, unknown>;
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'path' | 'header';
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

/**
 * Parámetros OpenAPI (query, path o header) desde el esquema de objeto de un request: uno por campo, con su
 * tipo, si es obligatorio y su descripción/pista. Uso en un *.paths.ts:
 *   parameters: [...toParameters(SessionIdParams, 'path'), ...toParameters(SessionListQuery, 'query')]
 */
export function toParameters(schema: z.ZodType, location: OpenApiParameter['in']): OpenApiParameter[] {
  const json = toOpenApi(schema) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, ...rest } = property;
    return {
      name,
      in: location,
      required: location === 'path' || required.has(name),
      ...(typeof description === 'string' ? { description } : {}),
      schema: rest
    };
  });
}

export default { toOpenApi, toParameters };
