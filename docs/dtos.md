# DTOs — guía de onboarding

> Detalle aquí. PII/descifrado: `docs/encryption-pii.md`.
> **Enmascaramiento de PII en la respuesta: `docs/pii-masking.md`.**

## Reglas base

- Nunca `{ ...sequelizeInstance }` — mapear campo a campo.
- Todas las keys del JSON de respuesta en **camelCase** (excepción: valores de enum de BD, ver abajo).
- Los `*_hash` nunca se incluyen.
- Usar `_normalizePersonAliases()` para aliases snake_case de asociaciones Sequelize.
- **PII siempre `safeDecrypt` + máscara** (`MaskingUtil`); los JSONB propios, por `redactPayload` — ver `pii-masking.md`.

## Arquitectura en 2 capas

**Capa 1 — Componentes shared (`shared/dtos/{dominio}/`)**: clases con métodos estáticos
`build()`, `buildList()`, `buildDetail()`, `buildArray()`. Mapean desde Sequelize y son el reflejo de la BD.
La estructura espeja `modules/schemas/`. Cada dominio tiene un barrel `index.ts` que re-exporta todo.

```
shared/dtos/
  audit/  core/  kyc/  notification/     (+ index.ts por dominio)
  kyc/components-catalog.dto.ts → MetadataDTO, PaginationDTO, SortDTO (paginación)
  kyc/components-person.dto.ts  → PersonComponent, PersonContactComponent, …
  core/components-approval.dto.ts → ApprovalRequestComponent, PendingApprovalComponent
```

**Capa 2 — DTOs de módulo (`modules/{servidor}/{dominio}/dtos/`)**: importan y **delegan** en los
componentes shared. No repiten mapeo.

```js
// ✅ delega
const { ConsentTypeComponent } = require('../../../../shared/dtos/audit/components-audit.dto');
const ConsentTypeListDTO = record => ConsentTypeComponent.buildList(record);

// ❌ mapeo duplicado
const ConsentTypeListDTO = record => ({ id: record.consent_type_id, name: record.name });
```

> Si el componente shared no refleja todas las columnas del modelo, es un bug: corregirlo en shared antes de usarlo.

## Convención de métodos de componente

```js
class XyzComponent {
  static build(record, options = {}) {
    if (!record) return null; /* mapea campo a campo */
  }
  static buildArray(rows, options = {}) {
    return Array.isArray(rows) ? rows.map(r => this.build(r, options)) : [];
  }
  // buildList (item liviano de lista) / buildDetail (con relaciones) según el dominio
}
```

- `options` controla relaciones a incluir: `{ includeContact: true, includeReviewedBy: true, ... }`.
- Siempre guardas defensivos (`if (!record) return null`, `Array.isArray(...) ? ... : []`).

## DTO de lista paginada (patrón)

```js
const { MetadataDTO } = require('../../../../shared/dtos/kyc/components-catalog.dto');
const { MyResourceComponent } = require('../../../../shared/dtos/{dominio}/components-myresource.dto');

function MyListResponseDTO(rows, metadata) {
  return {
    data: Array.isArray(rows) ? rows.map(r => MyResourceComponent.build(r)) : [],
    metadata: MetadataDTO.build(metadata) // nunca armar el objeto de paginación a mano
  };
}
```

El service arma `metadata` manualmente (`{ totalItems, page, limit, sortBy, order, filters }`) y se lo
pasa al DTO. El controller devuelve el resultado directo (ApiResponse aplana `{ data, metadata }`).

## `_normalizePersonAliases()`

Sequelize devuelve las asociaciones con su alias (algunas snake_case) pero los componentes esperan
camelCase. Los DTOs de persona normalizan antes de mapear:

```js
function _normalizePersonAliases(person) {
  if (!person) {
    return null;
  }
  return {
    // escalares, campo a campo — NUNCA `...person` (spread sobre instancia Sequelize)
    person_id: person.person_id,
    first_name: person.first_name,
    // … last_name, middle_name, second_last_name, national_id (ya descifrado por el afterFind),
    //   birth_date, gender_id, country_id, createdAt, updatedAt
    gender: person.gender ?? null,
    contact: person.contact ?? null, // email/teléfonos (cifrados → descifrar + enmascarar)
    location: person.location ?? null,
    references: person.references ?? [],
    nationality: person.country ?? null // FK mapeada al alias del componente
  };
}
```

Existe en `modules/admin/kyc/person/dtos/admin-person.dto.ts` y en
`modules/shared-endpoints/kyc/person/dtos/profile.dto.ts`.

## Excepción de snake_case: valores de enum

Las **keys** siempre camelCase; pero los **valores** de enum/estado de BD se mantienen en snake_case
(`pendiente_renovacion`, `bank_transfer`, `pending_second_approval`, …), tanto como valor de un campo
(`status: 'approved'`) como cuando son claves dinámicas de estadísticas (`byStatus: { pendiente_renovacion: 5 }`).
No aplicar conversión sobre esos valores (evita alterar validators/migraciones).

## Mapa dominio → componente shared

La estructura de `shared/dtos/` espeja `modules/schemas/`. En el template base:

| Dominio (`schemas/`) | Componente shared                                                                       |
| -------------------- | --------------------------------------------------------------------------------------- |
| audit                | `shared/dtos/audit/components-audit.dto.ts`                                              |
| core                 | `shared/dtos/core/` (components-approval, components-system-config)                      |
| kyc                  | `shared/dtos/kyc/` (components-person, components-auth, components-catalog: Metadata/Pagination/Sort) |
| notification         | `shared/dtos/notification/components-notification.dto.ts`                               |

> Un JSONB propio (`metadata`, `details`, etc.) que llegue snake_case desde la BD no se asigna crudo al DTO:
> se pasa por `redactPayload` (enmascara PII) y, si el front espera camelCase, se normaliza campo a campo.
