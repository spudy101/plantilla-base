# SOLID pragmático: qué, cuándo, cuánto cuesta

Cada principio tiene **beneficio**, **costo**, **cuándo sí**, **cuándo no** y ejemplos buenos y malos. Los
ejemplos están en TypeScript con un dominio genérico (pedidos, facturas, clientes). La idea aplica a cualquier
lenguaje.

---

## S — Responsabilidad única

> Un módulo debería tener **una sola razón para cambiar**. No significa "un solo método".

**Beneficio:** los cambios quedan localizados; los archivos se pueden leer y testear por partes; dos personas
no se pisan editando el mismo archivo.
**Costo:** más archivos y algún salto más al navegar. Si se divide de más, una operación simple queda
repartida en cinco clases.

**Cuándo sí:** un service mezcla flujos que cambian por motivos distintos (crear pedidos, recalcular stock,
emitir facturas). Una señal útil: el archivo pasa de algunos cientos de líneas o su test necesita preparar
mucho contexto que no tiene que ver con el caso que prueba.
**Cuándo no:** para separar métodos que siempre cambian juntos, o para crear una clase por método.

```ts
// ❌ Un service que hace de todo: cualquier cambio en facturación obliga a tocar (y re-testear) los pedidos
class OrderService {
  async create(input) { /* valida, guarda, descuenta stock, calcula impuestos, emite factura, manda correo */ }
  async cancel(id) { /* revierte stock, anula factura, reembolsa, notifica */ }
  async recalculateTaxes(orderId) { /* … */ }
  async issueInvoice(orderId) { /* … */ }
  async refund(orderId) { /* … */ }
}

// ✅ Fachada delgada + services con una responsabilidad cada uno
class OrderService {
  constructor(deps = {}) {
    this.invoicing = deps.invoicing ?? invoicingService;
    this.stock = deps.stock ?? stockService;
  }
  async create(input) {
    const order = await this.orderRepository.create(input);
    await this.stock.reserve(order);
    await this.invoicing.issue(order);
    return order;
  }
}
// invoicing.service.ts → emitir / anular / recalcular impuestos
// stock.service.ts     → reservar / liberar
```

**Técnica de la fachada:** cuando un service grande ya existe, se extraen las responsabilidades a
sub-services y el original queda como fachada que delega. Los consumidores no cambian y el riesgo es bajo.

**Antes de copiar lógica** de otro flujo (p. ej. "emitir sesión" en login y en registro), se extrae un
service compartido. La duplicación de **reglas de negocio** es el problema de S más caro de arreglar después.
La duplicación de dos o tres líneas triviales no lo es.

---

## O — Abierto/cerrado

> Agregar una variante nueva no debería obligar a modificar código estable.

**Beneficio:** sumar un caso nuevo no rompe los existentes; el punto de extensión es obvio.
**Costo:** un registro o una estrategia agrega indirección: para entender qué pasa, hay que buscar quién se
registró. Con pocas variantes cerradas, es más difícil de leer que un `if`.

**Cuándo sí:** variantes que crecen por necesidad del negocio (tipos de entidad que un reporte sabe mostrar,
medios de pago, formatos de exportación, reglas de descuento configurables).
**Cuándo no:** conjuntos chicos y cerrados (tres canales fijos, dos roles). Ahí un `Record` tipado o un
`switch` exhaustivo es más claro, y el compilador avisa dónde falta un caso.

```ts
// ❌ Cada exportador nuevo toca la misma función (y su test)
function exportReport(format, rows) {
  if (format === 'csv') { /* … */ }
  else if (format === 'xlsx') { /* … */ }
  else if (format === 'pdf') { /* … */ }
  // el próximo formato: otro else-if acá
}

// ✅ Registro: un formato nuevo es una entrada nueva, sin tocar el recorrido
const EXPORTERS: Record<string, Exporter> = {
  csv: csvExporter,
  xlsx: xlsxExporter,
  pdf: pdfExporter
};
function exportReport(format: string, rows: Row[]) {
  const exporter = EXPORTERS[format];
  if (!exporter) throw AppError.badRequest(`Formato no soportado: ${format}`);
  return exporter.export(rows);
}
```

```ts
// ✅ También válido (conjunto cerrado): sin registro, pero el compilador obliga a cubrir cada caso
type Channel = 'push' | 'email' | 'sms';
const SUPPORTED_BY_DEFAULT: Record<Channel, boolean> = { push: true, email: true, sms: false };
// agregar 'whatsapp' a Channel → este Record no compila hasta sumar la clave
```

> Caso real: en un proyecto se pasó de canales como descriptores inyectables a un conjunto cerrado y
> tipado, porque eran tres canales fijos y la indirección no se pagaba. Si los canales empiezan a crecer,
> se vuelve al registro. Las dos decisiones son correctas en su momento.

---

## L — Sustitución de Liskov

> Donde se espera el tipo base, cualquier subtipo tiene que funcionar **sin sorpresas**.

**Beneficio:** el código que usa la abstracción puede confiar en ella; los tests del contrato sirven para
todas las implementaciones.
**Costo:** casi ninguno. Obliga a pensar qué promete realmente el contrato.

**Cuándo sí:** siempre que haya herencia, una clase base compartida o varias implementaciones de un contrato.
**Cuándo no:** no aplica si no hay jerarquía ni contrato. No se crea herencia para "tener" Liskov.

```ts
// ❌ La base promete update/delete y el hijo los rompe en tiempo de ejecución
class BaseRepository {
  create(data) { /* … */ }
  update(id, data) { /* … */ }
  delete(id) { /* … */ }
}
class AuditLogRepository extends BaseRepository {
  update() { throw new Error('Los logs son append-only'); } // sorpresa para quien confía en la base
  delete() { throw new Error('Los logs son append-only'); }
}

// ✅ La base trae solo lo común (acceso a la conexión, transacción, paginación);
//    cada repositorio expone las operaciones que su tabla admite
class BaseRepository {
  protected db() { /* conexión o transacción activa */ }
  protected paginationArgs(page, pk) { /* … */ }
}
class AuditLogRepository extends BaseRepository {
  create(entry) { /* … */ }            // append-only: no existe update ni delete
  findByCorrelationId(id) { /* … */ }
}
```

**Señales de que se rompe L:** métodos que lanzan "no soportado", `instanceof` para decidir qué hacer,
subtipos que piden precondiciones más fuertes o devuelven menos de lo prometido.

---

## I — Segregación de interfaces

> Nadie debería depender de métodos que no usa.

**Beneficio:** los fakes de test son mínimos; queda explícito qué usa cada service de cada dependencia; los
cambios en métodos que no se usan no afectan.
**Costo:** bajo si el lenguaje permite derivar tipos (`Pick`, `Omit`). Alto si hay que mantener a mano una
interface por consumidor.

**Cuándo sí:** siempre que haya contratos. En TypeScript, la forma más barata es derivar el tipo de la
implementación real.
**Cuándo no:** no se escribe una interface separada por consumidor si se puede derivar.

```ts
// ❌ El service depende de todo el repositorio; el fake del test tiene que imitar 20 métodos
class InvoiceQueryService {
  constructor(private invoices: typeof invoiceRepository) {}
}

// ✅ Depende solo de lo que usa, derivado del repositorio real (sin interface aparte que mantener)
type InvoiceReader = Pick<typeof invoiceRepository, 'findById' | 'findAllPaginated'>;
class InvoiceQueryService {
  constructor(deps: { invoices?: InvoiceReader } = {}) {
    this.invoices = deps.invoices ?? invoiceRepository;
  }
}
// test: new InvoiceQueryService({ invoices: { findById: jest.fn(), findAllPaginated: jest.fn() } })
```

**I también aplica a los repositorios:** métodos con nombre de negocio en vez de un `findAll(where)`
genérico. El genérico obliga al service a conocer el lenguaje de consultas del ORM.

```ts
// ❌ El service habla el idioma del ORM
const roles = await roleRepository.findAll({ where: { name: { in: names }, deletedAt: null } });

// ✅ El repositorio habla el idioma del negocio
const roles = await roleRepository.findActiveByNames(names);
```

---

## D — Inversión de dependencias (selectiva)

> Los módulos de alto nivel (reglas de negocio) no deberían depender de detalles de bajo nivel
> (infraestructura). Ambos dependen de abstracciones.

**Beneficio:** el negocio se testea sin base de datos ni proveedores; la infraestructura se reemplaza sin
tocar reglas; las fronteras quedan claras.
**Costo:** cada abstracción explícita es un archivo y un salto más, y un contrato que mantener sincronizado.
Con interfaces, puertos, adaptadores y composition root en todo, el costo crece rápido y lo paga quien lee.

### Escalera de inversión: se sube solo lo necesario

| Nivel | Qué es | Cuándo alcanza |
|---|---|---|
| 0. Import directo | `import { formatMoney } from './money'` | Funciones puras, utilidades estables, errores, logger, DTOs |
| 1. Inyección por constructor con default | `this.repo = deps.repo ?? realRepo` | **Default para services**: testable sin mocks globales y reemplazable, sin ceremonia |
| 2. Tipo derivado (`Pick`, `typeof`) | El service declara la forma mínima que necesita | Cuando conviene explicitar qué usa (I) |
| 3. Interface/puerto explícito | `interface PaymentGateway { charge(…) }` | Dos implementaciones reales, frontera con proveedor externo intercambiable, o contrato que consumen otros |
| 4. Composition root | Un único lugar que arma el grafo de objetos | Muchas implementaciones intercambiables por entorno o tenant; migración a hexagonal |

```ts
// ❌ Nivel 0 donde no corresponde: el service usa el ORM directo (test = base de datos real o mock global)
import { db } from '../database/client';
class OrderService {
  async listPending() {
    return db.order.findMany({ where: { status: 'PENDING' }, include: { customer: true } });
  }
}

// ✅ Nivel 1: el ORM queda en el repositorio; el service recibe el repositorio por constructor
class OrderService {
  constructor(deps: OrderService.Deps = {}) {
    this.orders = deps.orders ?? orderRepository;
  }
  async listPending() {
    return this.orders.findPendingWithCustomer();
  }
}
export default Object.assign(new OrderService(), { OrderService }); // instancia para uso normal + clase para tests

// test: sin jest.mock, sin base de datos
import orderServiceModule from './order.service';
const { OrderService } = orderServiceModule;
const service = new OrderService({ orders: { findPendingWithCustomer: async () => [fixture] } });
```

```ts
// ❌ Sobre-ingeniería: interface + implementación + factory para algo puro y estable
interface InterestCalculator { calculate(principal: number, rate: number, months: number): number; }
class DefaultInterestCalculator implements InterestCalculator { /* … */ }
const calculatorFactory = { create: (): InterestCalculator => new DefaultInterestCalculator() };

// ✅ Una función. Si algún día hay dos fórmulas reales, se abstrae ese día
export function compoundInterest(principal: number, rate: number, months: number): number { /* … */ }
```

```ts
// ✅ Nivel 3 justificado: dos proveedores de pago reales, elegidos por país
interface PaymentGateway {
  charge(input: ChargeInput): Promise<ChargeResult>;
}
class StripeGateway implements PaymentGateway { /* … */ }
class LocalBankGateway implements PaymentGateway { /* … */ }
```

### Qué se invierte siempre

- **Persistencia:** el ORM solo vive en repositorios. Los services pueden importar **tipos** de filas, pero no
  el cliente.
- **Transacciones:** un `UnitOfWork.run(async () => …)` en vez de que el service abra transacciones del ORM.
  El repositorio toma la transacción activa por sí solo, por ejemplo con contexto asíncrono.
- **Proveedores externos:** se inyectan los clientes (SDK) y toda llamada pasa por un envoltorio común.
- **Tiempo y aleatoriedad**, cuando el test los necesita controlar: inyectar `now()` o el generador.

### Cómo evitar que `shared/` dependa del negocio

Si la infraestructura necesita algo de un módulo de negocio (persistir un log de integración, auditar un
evento técnico, leer una configuración), **no lo importa**: expone un punto de registro y el arranque de la
app conecta el módulo dueño.

```ts
// shared/infra/integration-log.ts
let writer: IntegrationLogWriter | null = null;
export const registerIntegrationLogWriter = (w: IntegrationLogWriter) => { writer = w; };
export const logIntegration = (entry) => writer?.write(entry);

// app.ts (arranque)
registerIntegrationLogWriter(integrationModule.logWriter);
```

**Beneficio:** `shared/` se puede reutilizar y testear sin el negocio. **Costo:** si nadie registra al
writer, falla en silencio. Conviene un test o un log de arranque que lo detecte.

---

## Antipatrones frecuentes

| Antipatrón | Por qué duele | Alternativa |
|---|---|---|
| Interface con una sola implementación "por si acaso" | Doble mantenimiento, sin beneficio | Inyección con default; interface cuando llegue la segunda implementación |
| Repositorio genérico `findAll(where)` | El service termina hablando el idioma del ORM | Métodos con nombre de negocio |
| `jest.mock` global de módulos para testear un service | Tests frágiles y acoplados a rutas de import | Inyección por constructor |
| Herencia para reusar código | Rompe L, jerarquías rígidas | Composición o funciones compartidas |
| Registro dinámico para 2 o 3 casos fijos | Indirección sin retorno | `Record` tipado o `switch` exhaustivo |
| Fachada que también tiene lógica propia | Vuelve a crecer hasta ser el problema original | La fachada solo orquesta y delega |
| Capa "manager", "helper" o "handler" sin responsabilidad clara | Basurero de código | Ubicar en service, repositorio o `shared/` según qué es |
