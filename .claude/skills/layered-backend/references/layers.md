# Capas, módulos y comunicación entre ellos

## Estructura por defecto: monolito modular

```
src/
  server.ts           arranque: infraestructura, workers, listen, apagado ordenado
  app.ts              framework HTTP: middlewares globales + monta los routers de cada módulo
                      y conecta los puntos de registro de shared/

  modules/
    <dominio>/        p. ej. orders, billing, customers, catalogs
      index.ts        API pública del módulo: lo único que otros módulos pueden importar
      routes/         rutas + middlewares por ruta (auth, permisos, validación)
      controllers/    traducen HTTP ↔ service
      requests/       esquemas de entrada (validación y tipos)
      responses/      DTOs de salida (qué se expone y cómo)
      services/       reglas de negocio y orquestación
      repositories/   acceso a datos (único lugar con el ORM)
      providers/      integraciones externas propias del dominio
      workers/        jobs periódicos o consumidores de cola del dominio

  shared/             infraestructura técnica SIN conocimiento del negocio
    database/         cliente, repositorio base, unit of work
    http/             errores, respuestas, paginación, middlewares técnicos
    security/         hash, cifrado, tokens
    infra/            cache, storage, envoltorio de llamadas a proveedores
    observability/    logger, contexto de la operación, trazas
```

**Por qué monolito modular:** un solo despliegue es lo más simple de operar, y los módulos con API pública
mantienen las fronteras. Si un módulo algún día tiene que ser un servicio aparte, la frontera ya existe.
**Costo:** hay que respetar las fronteras con disciplina, o con tests de arquitectura, porque el lenguaje
no impide importar lo que sea.
**Cuándo no:** cuando hay una necesidad real de escalar o desplegar partes por separado, o equipos
independientes con ciclos de release distintos. No se divide en servicios "para estar preparados".

## Responsabilidad de cada capa

| Capa | Hace | No hace |
|---|---|---|
| **Route** | Declara método, path y la cadena de middlewares (auth, permisos, rate limit, validación) | Lógica de negocio |
| **Controller** | Extrae datos ya validados del request, llama a **un** método del service y devuelve la respuesta | Reglas, consultas, transacciones, `try/catch` de negocio |
| **Request** | Esquema de entrada: valida, normaliza y tipa (lista blanca: lo no declarado se descarta) | Consultar la base |
| **Service** | Reglas de negocio, orquestación, transacciones (vía Unit of Work), auditoría de hechos de negocio | Conocer HTTP (`req`, `res`, códigos de estado) o el ORM |
| **Repository** | Consultas, filtros, `include`/joins, paginación, detrás de métodos con nombre de negocio | Reglas de negocio |
| **Response (DTO)** | Decide campo por campo qué sale, enmascara datos sensibles | Consultar la base, lógica |

**Flujo de una petición:** `route → middlewares → validación → controller → service → repository → base`,
y de vuelta `repository → service → DTO → controller → respuesta`.

## Comunicación entre capas: bueno y malo

```ts
// ❌ Controller con lógica de negocio y acceso a datos
router.post('/orders', async (req, res) => {
  if (!req.body.items?.length) return res.status(400).json({ error: 'sin ítems' });
  const customer = await db.customer.findUnique({ where: { id: req.user.id } });
  if (customer.blocked) return res.status(403).json({ error: 'bloqueado' });
  const order = await db.order.create({ data: { … } });
  res.status(201).json(order); // expone la fila completa, incluidos campos internos
});

// ✅ Cada capa en lo suyo
router.post('/orders', authenticate, validate({ body: CreateOrderBody }), OrderController.create);

class OrderController {
  create = asyncHandler(async (req, res) => {
    const order = await OrderService.create(req.body, requireAuthUser(req).userId);
    return ApiResponse.success(res, 'Pedido creado', order, 201);
  });
}

class OrderService {
  async create(input: CreateOrderBody, customerId: string) {
    const customer = await this.customers.findById(customerId);
    if (customer?.blocked) throw AppError.forbidden('Cliente bloqueado'); // error de dominio, no código HTTP suelto
    const order = await this.unitOfWork.run(async () => {
      const order = await this.orders.create({ customerId, items: input.items });
      await this.stock.reserve(order.items);
      return order;
    });
    await this.audit.record('ORDER_CREATED', { actorId: customerId, entityId: order.id });
    return OrderDetailDTO(order); // DTO explícito
  }
}
```

```ts
// ❌ El service conoce HTTP
async create(req, res) { … res.status(201) … }

// ❌ El service devuelve la fila del ORM tal cual (filtra campos internos o sensibles)
return await this.orders.findById(id);

// ✅ Errores de dominio con tipo; el middleware de errores los traduce a HTTP en un solo lugar
throw AppError.notFound('Pedido no encontrado');
```

## Comunicación entre módulos

- **Solo por el `index.ts` del otro módulo** (su API pública). Nunca `import … from '../billing/services/x'`.
- Lo que un módulo exporta es un contrato: se exporta poco y con intención.
- **Ciclos:** si A necesita a B y B a A, casi siempre falta un tercer concepto, o una de las dos direcciones
  es un evento o notificación. Como último recurso, una carga diferida (lazy) documentada.

```ts
// ❌ Atajo a un archivo interno: cualquier refactor interno de billing rompe orders
import invoiceRepository from '../billing/repositories/invoice.repository';

// ✅ API pública
import billing from '../billing';
await billing.invoicing.issueFor(order);
```

**Beneficio:** cada módulo puede reorganizarse por dentro sin romper a nadie. **Costo:** mantener el
`index.ts`, y a veces exponer un método fino en vez de usar el repositorio directo.

## `shared/` vs módulo

| Pregunta | Va en |
|---|---|
| ¿Sabe algo del negocio (pedidos, clientes, reglas)? | Módulo |
| ¿Es técnico y lo usarían dos proyectos distintos (cifrado, paginación, cache)? | `shared/` |
| ¿Es técnico pero necesita algo de un módulo? | `shared/` con un **punto de registro** que `app.ts` conecta |
| ¿Lo usa un solo módulo? | Ese módulo, aunque sea técnico. Se mueve a `shared/` cuando lo necesite un segundo |

## ¿Dónde va esto?

| Quiero… | Va en |
|---|---|
| Un endpoint nuevo | `routes/` + `controllers/` + `services/` del dominio |
| Una regla de negocio | `services/` |
| Una consulta, filtro o join | `repositories/`, con método de nombre de negocio |
| Validar entrada | `requests/` (esquema) + middleware de validación en la ruta |
| Dar forma a la salida | `responses/` (DTO) |
| Usar algo de otro módulo | Su `index.ts` |
| Un job periódico | `workers/` del dominio dueño |
| Integrar un proveedor externo | `providers/` del dominio, llamando por el envoltorio de `shared/infra` |
| Algo técnico sin negocio | `shared/<área>/` |
| Un dominio nuevo | Copiar el molde de un módulo existente que se parezca |
