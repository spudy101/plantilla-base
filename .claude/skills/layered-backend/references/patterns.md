# Catálogo de decisiones: beneficio, costo y cuándo conviene

Cada entrada es una decisión que funcionó bien en backends por capas. **No son obligatorias**: son puntos de
partida con sus trade-offs explícitos. Para cada caso, se elige la versión más simple que resuelve el
problema que existe hoy.

Formato: **Qué** · **Beneficio** · **Costo** · **Conviene cuando** · **No conviene cuando** · **Alternativa
más simple / más robusta**.

---

## Dependencias y estructura

### Inyección por constructor con default real

```ts
class InvoiceService {
  constructor(deps: InvoiceService.Deps = {}) {
    this.invoices = deps.invoices ?? invoiceRepository;
    this.unitOfWork = deps.unitOfWork ?? unitOfWork;
  }
}
export default Object.assign(new InvoiceService(), { InvoiceService }); // instancia + clase
```

- **Beneficio:** tests sin mocks globales; punto de reemplazo claro; no hace falta contenedor de DI ni
  composition root.
- **Costo:** se repite un poco el patrón en cada service; las dependencias se resuelven al importar (cuidado
  con ciclos).
- **Conviene cuando:** el service usa repositorios, otros services o infraestructura.
- **No conviene cuando:** es una función pura o una utilidad sin estado. Ahí, import directo.
- **Más robusta:** contenedor de DI o composition root, si hay muchas implementaciones por entorno.

### Fachada + sub-services

- **Qué:** un service grande se divide por responsabilidad y el original queda como fachada que delega.
- **Beneficio:** se refactoriza sin cambiar a los consumidores; cada sub-service se testea solo.
- **Costo:** un nivel más de indirección. La fachada tiende a volver a crecer si no se cuida.
- **Conviene cuando:** el archivo mezcla flujos que cambian por razones distintas.
- **No conviene cuando:** el service es chico y cohesivo, aunque tenga varios métodos.

### Puntos de registro para que `shared/` no dependa del negocio

- **Qué:** `shared/` expone `registerX(impl)` y `app.ts` conecta el módulo dueño al arrancar.
- **Beneficio:** la dependencia apunta en una sola dirección; `shared/` se testea solo.
- **Costo:** si no se registra, falla tarde o en silencio; es un indirecto más para seguir.
- **Conviene cuando:** infraestructura necesita persistir o leer algo que es de un módulo.
- **Alternativa más simple:** pasar el dato como parámetro si el que llama ya lo tiene.

---

## Datos

### Repositorio con métodos de nombre de negocio + base común

- **Qué:** `findActiveByEmail`, `searchPaginated`, `markAsReadByIds`, en vez de `findAll(where)`. Una
  clase base con lo común (conexión o transacción activa, paginación, búsqueda).
- **Beneficio:** el service no conoce el ORM; cambiar de ORM toca solo repositorios; las consultas quedan
  nombradas y se encuentran fácil.
- **Costo:** muchos métodos pequeños; tentación de crear uno por cada variación mínima.
- **Conviene:** siempre que haya ORM o SQL.
- **Señal de exceso:** cinco métodos casi iguales. Ahí se unifican con un parámetro de filtros **tipado**
  (no un `where` del ORM).

### Unit of Work gestionado

```ts
const order = await this.unitOfWork.run(async () => {
  const order = await this.orders.create(data);   // los repositorios toman la transacción activa solos
  await this.stock.reserve(order.items);
  return order;
});
await this.audit.record('ORDER_CREATED', …);       // efectos posteriores al commit, fuera de la transacción
```

- **Beneficio:** el service no ve el ORM; todo o nada sin pasar `tx` de mano en mano; sin `commit()` ni
  `rollback()` manual (un error después del commit no puede "revertir" algo ya confirmado).
- **Costo:** requiere contexto asíncrono (p. ej. AsyncLocalStorage); la transacción es implícita y hay que
  saber que existe.
- **Conviene cuando:** una operación escribe en más de una tabla.
- **Cuidado:** llamadas de red **dentro** de la transacción la alargan y retienen locks. Van antes o después.

### DTOs de salida explícitos (campo a campo)

- **Beneficio:** nunca se filtra un campo nuevo o sensible por accidente; el contrato de la API es visible.
- **Costo:** hay que mantener el DTO cuando cambia la tabla.
- **Refuerzo opcional:** un esquema de salida y un test de conformidad (`schema.safeParse(dto(fixture))`).
  Así la documentación (p. ej. OpenAPI) sale del mismo esquema y no se desincroniza.

### Validación de entrada con esquema en la ruta

- **Qué:** un esquema por request (lista blanca, tipos, normalización); el service recibe datos ya válidos
  y tipados.
- **Beneficio:** el service no reinterpreta strings; los errores 4xx son consistentes; el mismo esquema
  documenta la API.
- **Costo:** un archivo más por recurso.

### Contrato único de listados

- **Qué:** todos los listados aceptan `page`, `limit`, `sortBy`, `order` y filtros tipados; responden
  `{ data, metadata: { pagination, sort, filters } }` con lo que **se aplicó**.
- **Beneficio:** el front consume todos los listados igual; un `sortBy` inválido es un error, no se ignora
  en silencio.
- **Costo:** declarar por listado qué campos se pueden ordenar (pocos, con índice).
- **Desempate por clave primaria** en el orden: sin él, filas con el mismo valor se repiten o faltan entre
  páginas.
- **Escala:** offset con total sirve para pantallas de administración. Si una tabla enorme se vuelve
  lenta, ese listado pasa a cursor; el resto no cambia.

---

## Integraciones y resiliencia

### Envoltorio único para llamadas a proveedores

```ts
const res = await callProvider({ product: 'mail', endpoint: 'SendEmail' }, signal => client.send(cmd, { abortSignal: signal }));
```

- **Qué:** toda llamada de red a un tercero pasa por una función que aplica circuit breaker → reintentos con
  backoff (solo errores transitorios) → timeout por intento → una línea de log o métrica.
- **Beneficio:** resiliencia y observabilidad uniformes; los parámetros salen de configuración y no
  quedan repartidos por el código.
- **Costo:** desactivar los reintentos propios del SDK para no reintentar dos veces; un archivo central que
  hay que entender.
- **Conviene:** desde el primer proveedor externo. Es barato y evita muchos incidentes.
- **Alternativa:** librerías de resiliencia (breaker, retry). Guardan el estado en memoria por proceso: con
  varias instancias, cada una abre su propio circuito. Si importa tener un solo estado compartido, va en
  cache distribuida.

### Errores que dicen si reintentar

- **Qué:** cada error de la API indica `retryable` (y `Retry-After` si se sabe); un 4xx nunca es
  reintentable; la base caída es 503, no 500.
- **Beneficio:** los clientes reintentan solo lo que tiene sentido.
- **Costo:** clasificar bien los errores en el middleware central.

### Idempotencia por clave

- **Qué:** las operaciones que no deben ejecutarse dos veces (crear un pago, enviar algo) exigen un header
  `Idempotency-Key`; un reintento con la misma clave recibe la respuesta guardada.
- **Beneficio:** reintentos seguros ante timeouts de red.
- **Costo:** almacenamiento de claves con expiración; definir qué pasa si llega la misma clave con otro
  cuerpo.
- **Conviene:** en operaciones con efectos externos o dinero. **No** en todas las escrituras.

---

## Trabajo asíncrono

### La base de datos como cola (hasta que deje de alcanzar)

- **Qué:** una tabla de trabajos; el worker toma lo vencido con `FOR UPDATE SKIP LOCKED` y lo reserva con
  un lease; reintentos con backoff; otra instancia retoma lo de una que se cayó.
- **Beneficio:** el trabajo se encola **en la misma transacción** que el dato que lo origina (outbox
  natural); no hay broker que operar ni simular en tests.
- **Costo:** carga la base; no sirve para fan-out a muchos sistemas ni para releer historial.
- **Pasar a broker cuando:** la cola compite con la app por la base o hay picos grandes (SQS o equivalente,
  con DLQ); el trabajo cruza a otro servicio (cola o RabbitMQ); varios sistemas reaccionan al mismo evento
  (pub/sub); hay un flujo masivo con relectura (Kafka).
- **Cómo migrar sin rehacer:** la tabla queda como outbox y un publicador la pasa al broker; cambia solo
  el consumidor. La entrega sigue siendo *at-least-once*, así que el consumidor tolera duplicados.

### Efectos después del commit

- **Qué:** auditoría, notificaciones y llamadas externas se disparan **después** de confirmar la
  transacción, o se encolan dentro de ella.
- **Por qué:** si se notifica dentro y luego hay rollback, se avisó algo que no ocurrió.

---

## Observabilidad

### Tres cosas distintas: auditoría, traza de operaciones, logs

| | Auditoría | Traza de operaciones | Logs |
|---|---|---|---|
| Responde | ¿Qué hecho de negocio ocurrió y quién lo hizo? | ¿Qué operación corrió, cuánto tardó, cómo terminó? | ¿Qué pasó por dentro? |
| ¿Se puede perder? | No | Tolerable | Tolerable |
| Retención | Años | Semanas o meses | Días o semanas |

Las tres comparten un `correlationId` por operación (petición, webhook, ciclo de worker), propagado
con contexto asíncrono.

- **Costo:** tres destinos que configurar. **Más simple:** al principio, logs estructurados con
  `correlationId` y auditoría de los hechos que la ley o el negocio exigen. La traza de operaciones se
  suma cuando hace falta.

---

## Verificación

### Guardas de arquitectura como tests

- **Qué:** tests que leen el código fuente (sin ejecutarlo) y fallan si se cruza una frontera: ORM fuera de
  repositorios, `shared/` importando módulos, imports a archivos internos de otro módulo, service que
  exporta la instancia sin la clase.
- **Beneficio:** las reglas sobreviven a la rotación del equipo y a la prisa; el error dice qué mover y
  adónde.
- **Costo:** regex o AST que mantener; falsos positivos que obligan a listar excepciones explícitas.
- **Conviene:** para las 4 o 5 fronteras que de verdad importan. No para cada preferencia de estilo: eso es
  trabajo del linter o de la revisión.

### Excepciones deliberadas, escritas

Toda regla tiene casos donde no aplica (el logger que persiste a través de un repositorio, un worker de
mantenimiento, el arranque). Se listan con su motivo en la documentación o en la guarda. Una excepción
escrita es una decisión; una sin escribir es deuda.
