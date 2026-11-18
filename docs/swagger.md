# Swagger / OpenAPI — guía de onboarding

> Detalle aquí. El Swagger es el **paso 5 del cierre de un cambio**
> y va en el mismo pase que el código — no se aplaza a "cuando esté probado".

## Estructura

```
config/
  swagger.admin.ts     ← ensambla el spec del servidor ADMIN (requiere + spread de paths/schemas)
  swagger.client.ts    ← idem para CLIENT
  swagger/
    schemas/           ← schemas globales compartidos (index.ts los re-exporta). Ej: core.schema.ts
    responses/common.responses.ts  ← helpers de respuestas estándar (ok, paginated, created, accepted, errores)
src/modules/<dominio>/docs/<recurso>.paths.ts
                       ← paths + schemas de cada recurso, junto a su módulo
```

Cada `*.paths.ts` exporta `{ paths, schemas, tags? }`. `swagger.admin.ts`/`swagger.client.ts` hacen
`require(...)` y spread: `allPaths = { ...modPaths.paths }`, `allModuleSchemas = { ...modPaths.schemas }`,
y `components.schemas = { ...getAllSchemas, ...allModuleSchemas }` (los globales + los de módulo conviven en
el mismo namespace, así que un `$ref` resuelve entre módulos).

## `common.responses.ts` (helpers)

- Éxitos (funciones): `ok(dataSchema, desc)` (200), `paginated(itemSchema, desc)` (200 con `Metadata`),
  `created(dataSchema, desc)` (201), `accepted(dataSchema, desc)` (202) y `noContent` (objeto para spread, 204).
- Errores (objetos para spread): `BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`,
  `ValidationError` (422), `RateLimitExceeded` (429), `InternalServerError` (500), `ServiceUnavailable` (503).

```ts
import commonResponses from '../../../responses/common.responses';
responses: {
  200: commonResponses.ok({ $ref: '#/components/schemas/MiRecurso' }, 'Obtenido exitosamente'),
  ...commonResponses.Unauthorized,
  ...commonResponses.NotFound,
  ...commonResponses.InternalServerError
}
```

## Anatomía de un `*.paths.ts`

```ts
import commonResponses from '../../../responses/common.responses';
const adminSecurity = [{ bearerAuth: [], idTokenAuth: [] }]; // security schemes definidos en el ensamblador

const schemas = {
  MiRecursoListItem: {
    type: 'object',
    properties: {
      /* camelCase, igual que el DTO */
    }
  },
  MiRecursoCreateRequest: {
    type: 'object',
    required: ['x'],
    properties: {
      /* igual que el validator */
    }
  }
};

const paths = {
  '/admin/api/v1/{dominio}/{subdominio}/mi-recurso': {
    get: {
      tags: ['Admin — Mi Recurso'],
      summary: '...',
      description: '...',
      security: adminSecurity,
      parameters: [
        /* page, limit, filtros */
      ],
      responses: {
        200: commonResponses.paginated({ $ref: '#/components/schemas/MiRecursoListItem' }),
        ...commonResponses.Unauthorized
      }
    }
  }
};

export default { schemas, paths };
```

## Registrar un módulo nuevo en el ensamblador

En `src/config/swagger.admin.ts` (o `swagger.client.ts`):

1. `import miRecursoPaths from '../modules/{dominio}/docs/mi-recurso.paths';`
2. Agregar `...miRecursoPaths.paths` al objeto `allPaths`.
3. Agregar `...miRecursoPaths.schemas` al objeto `allModuleSchemas`.

- Los `tags` se agrupan solos en Swagger UI por el `tags: [...]` de cada operación (no hay merge global de tags).
- Si un schema debe estar disponible en admin **y** client, definirlo en `swagger/schemas/core.schema.ts`
  (lo carga `getAllSchemas`, presente en ambos specs). Definirlo solo en un `*.paths.ts` admin y referenciarlo
  desde un path client deja el `$ref` colgando.

## Convención de rutas

Los paths se escriben con la ruta completa tal como queda montada en el monolito:
`/{server}/api/v1/{dominio}/{subdominio}/{recurso}` (ej. `/admin/api/v1/kyc/person`),
donde `{server}` ∈ `admin | client` (las rutas compartidas se documentan en ambos specs)
y `{dominio}` ∈ `kyc | records | notification | core | integration | auth`.
Excepción: `core`, `notification`, `integration` y `auth` no llevan `{subdominio}` (ej. `/admin/api/v1/core/approval-requests`).
Al agregar uno nuevo, seguir el patrón del módulo hermano más cercano.

## Checklist de revisión

1. **Request body**: cada campo del validator está en el schema (tipo, formato, min/max, nullable, enum).
2. **Response body**: cada campo del DTO está en el schema, con el tipo correcto.
3. **Todas las keys camelCase** (excepto valores de enum de BD).
4. **Status codes**: documentar 200/201/202, 400, 401, 403, 404, 409, 422, 500 cuando apliquen.
5. **Opcionales explícitos**: `nullable: true` donde el DTO puede devolver `null`.
6. **Enums del modelo**: reflejar todos los valores de `Model.STATUS` en el `enum: [...]`.
7. **AppError / ApiResponse**: mensajes de error y estructura de respuesta fieles a lo real (usar `common.responses`).
8. **PII enmascarada**: en los campos de **respuesta** con documento, correo, teléfono, TIN o cuenta, poner la
   `description` de `src/config/swagger/schemas/pii-masking.doc.ts` y un `example` enmascarado (`******4050`,
   `****n@example.com`, `****7890`). ⚠️ **Los `requestBody` y `parameters` NUNCA**: la entrada va completa. Si
   un mismo `const` sirve a request y response, pártelo en dos. Ver `docs/pii-masking.md`.

## Validar el spec sin levantar el server

El ensamblador expone el JSON en `GET /docs.json`. Para chequear `$ref` colgantes en un script: capturar el
spec (override de `swaggerUi.generateHTML` o invocar el handler de `/docs.json` con un `res` falso),
juntar `Object.keys(components.schemas)` y cruzarlo con todos los `#/components/schemas/X` que aparezcan en
`JSON.stringify(spec)`. Útil tras agregar/renombrar schemas.
