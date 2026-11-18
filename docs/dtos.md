# DTOs — guía de onboarding

> Detalle aquí. PII/descifrado: `docs/encryption-pii.md`.
> **Enmascaramiento de PII en la respuesta: `docs/pii-masking.md`.**

## Reglas base

- Nunca `{ ...row }` — mapear campo a campo (una fila puede traer columnas internas: hashes, secretos).
- Todas las keys del JSON de respuesta en **camelCase** (excepción: valores de enum de BD, ver abajo).
- Los `*_hash` nunca se incluyen.
- **PII siempre `safeDecrypt` + máscara** (`MaskingUtil`); los JSONB propios, por `redactPayload` — ver `pii-masking.md`.

## Arquitectura en 2 capas

**Capa 1 — Componentes shared (`shared/dtos/{dominio}/`)**: clases con métodos estáticos
`build()`, `buildList()`, `buildDetail()`, `buildArray()`. Mapean desde las filas de Prisma (campos camelCase).
Cada módulo tiene sus componentes en `src/modules/<dominio>/dtos/*-components.dto.ts`; otro módulo los usa a través del `index.ts` del dueño.

```
shared/dtos/
  audit/  core/  kyc/  notification/     (+ index.ts por dominio)
  kyc/components-catalog.dto.ts → MetadataDTO, PaginationDTO, SortDTO (paginación)
  kyc/components-person.dto.ts  → PersonComponent, PersonContactComponent, …
  core/components-approval.dto.ts → ApprovalRequestComponent, PendingApprovalComponent
```

**Capa 2 — DTOs de módulo (`modules/{servidor}/{dominio}/dtos/`)**: importan y **delegan** en los
componentes shared. No repiten mapeo.

```ts
// ✅ delega
import componentsAuditDtoModule from '../../../../src/modules/audit/dtos/audit-components.dto';
const { ConsentTypeComponent } = componentsAuditDtoModule;
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

```ts
import componentsCatalogDtoModule from '../../../../src/modules/catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;
import componentsMyresourceDtoModule from '../../../../shared/dtos/{dominio}/components-myresource.dto';
const { MyResourceComponent } = componentsMyresourceDtoModule;

function MyListResponseDTO(rows, metadata) {
  return {
    data: Array.isArray(rows) ? rows.map(r => MyResourceComponent.build(r)) : [],
    metadata: MetadataDTO.build(metadata) // nunca armar el objeto de paginación a mano
  };
}
```

El service arma `metadata` manualmente (`{ totalItems, page, limit, sortBy, order, filters }`) y se lo
pasa al DTO. El controller devuelve el resultado directo (ApiResponse aplana `{ data, metadata }`).

## Excepción de snake_case: valores de enum

Las **keys** siempre camelCase; pero los **valores** de enum/estado de BD se mantienen en snake_case
(`pendiente_renovacion`, `bank_transfer`, `pending_second_approval`, …), tanto como valor de un campo
(`status: 'approved'`) como cuando son claves dinámicas de estadísticas (`byStatus: { pendiente_renovacion: 5 }`).
No aplicar conversión sobre esos valores (evita alterar validators/migraciones).

## Mapa dominio → componente shared

Componentes por dominio en el template base:

| Dominio (`schemas/`) | Componente shared                                                                       |
| -------------------- | --------------------------------------------------------------------------------------- |
| audit                | `src/modules/audit/dtos/audit-components.dto.ts`                                              |
| core                 | `shared/dtos/core/` (components-approval, components-system-config)                      |
| kyc                  | `shared/dtos/kyc/` (components-person, components-auth, components-catalog: Metadata/Pagination/Sort) |
| notification         | `src/modules/notification/dtos/notification-components.dto.ts`                               |

> Un JSONB propio (`metadata`, `details`, etc.) que llegue snake_case desde la BD no se asigna crudo al DTO:
> se pasa por `redactPayload` (enmascara PII) y, si el front espera camelCase, se normaliza campo a campo.
