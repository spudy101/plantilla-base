---
name: layered-backend
description: Criterio arquitectónico para backends por capas (KISS + YAGNI + SOLID pragmático). Úsalo al diseñar o implementar una funcionalidad de backend, al revisar código existente, al decidir si introducir una abstracción (interface, puerto, adaptador, registro, inyección) o no, al dividir un service grande, al ubicar código en una capa, o cuando se discuta Clean Architecture, hexagonal, SOLID o inversión de dependencias.
---

# Backend por capas: guía de criterio

Esta guía no es una plantilla. Es la forma de **decidir**: cuándo una solución simple alcanza y cuándo una
abstracción paga su costo. Las prácticas de este documento son defaults razonables, no reglas absolutas. Si
en un caso concreto otra opción es claramente mejor, se toma esa y se deja escrito por qué.

## La filosofía en tres líneas

1. **KISS y YAGNI primero.** Código sencillo, responsabilidades claras, nada "por si acaso".
2. **SOLID como detector, no como objetivo.** No se escribe código para cumplir SOLID: se escribe buen código
   y se usa SOLID para encontrar problemas de diseño (una clase que cambia por muchas razones, un `if` que
   crece con cada variante, un contrato que obliga a implementar métodos que no se usan).
3. **El acoplamiento se controla, no se elimina.** No toda dependencia necesita una abstracción, pero sí
   tiene que ser una decisión: qué puede depender de qué está claro y, si se puede, se verifica con tests.

## Cómo se aplica cada principio

| Principio | Postura | Por qué |
|---|---|---|
| **S** Responsabilidad única | Siempre, como guía | Dividir lo que cambia por razones distintas casi no cuesta y evita archivos de mil líneas |
| **O** Abierto/cerrado | Cuando las variantes crecen de verdad | Un registro o una estrategia para tres casos fijos es ceremonia; para casos que no paran de aparecer, se paga solo |
| **L** Sustitución de Liskov | Siempre que haya herencia o contratos | Una implementación que rompe lo que el contrato promete es un bug esperando a ocurrir |
| **I** Segregación de interfaces | Siempre que haya contratos | Depender solo de lo que se usa es barato (p. ej. `Pick<>` en TypeScript) |
| **D** Inversión de dependencias | **Selectiva**: donde hay infraestructura o volatilidad | Cada abstracción (interface, puerto, adaptador, composition root) tiene costo de mantenimiento |

**Sobre la D, que es la que más se malinterpreta:** aplicarla selectivamente no es ignorarla. La regla
práctica es esta:

- **Sí se invierte** lo que es detalle de infraestructura o cambia por razones ajenas al negocio: base de
  datos y ORM, proveedores externos (correo, SMS, storage, pagos), reloj, colas, transacciones.
- **No se abstrae** lo estable e interno: funciones puras, cálculos, utilidades de formato, errores, logger,
  DTOs. Una interface para una función que calcula intereses no protege de nada.
- **La inversión más barata primero**: inyección por constructor con la implementación real como default
  (`deps.x ?? realX`) da testabilidad y punto de reemplazo sin interfaces ni composition root. Las interfaces
  explícitas y los puertos llegan cuando hay una segunda implementación real o una frontera que proteger.

Detalle, ejemplos buenos y malos, beneficios y costos: [references/solid.md](references/solid.md).

## Arquitectura por defecto

**Monolito modular por capas**, un solo despliegue. Módulos por dominio y, dentro de cada uno:

```
routes / controllers   → HTTP: validar entrada, autenticar, llamar al service, dar forma a la respuesta
services               → reglas de negocio y orquestación (no conoce HTTP ni el ORM)
repositories           → acceso a datos detrás de métodos con nombre de negocio (único lugar con el ORM)
```

Más un `shared/` técnico **sin conocimiento del negocio** (base de datos, http, seguridad, infraestructura,
observabilidad). Detalle de capas, módulos y comunicación entre ellos: [references/layers.md](references/layers.md).

Esta estructura deja el camino abierto a hexagonal o Clean Architecture si el dominio lo pide: migrar es
sobre todo mover y renombrar (sub-services → casos de uso, contratos implícitos de repositorio → puertos,
defaults del constructor → composition root). No se adelanta ese paso sin necesidad.

## Cómo decidir ante una abstracción nueva

Antes de introducir una interface, un puerto, un registro, un patrón o una capa, hay que responder:

1. **¿Qué problema concreto resuelve hoy?** "Por si mañana cambiamos X" no cuenta, salvo que X sea
   infraestructura y el costo de aislarla sea bajo.
2. **¿Cuántas implementaciones o variantes reales hay?** Con una sola, la abstracción suele ser indirección.
   Excepciones válidas: frontera con infraestructura, test que de otra forma necesitaría infraestructura real,
   o contrato publicado que otros consumen.
3. **¿Qué cuesta?** Archivos extra, saltos al leer el código, sincronizar contrato e implementación, más
   para aprender antes de contribuir.
4. **¿Hay una versión más barata?** Un parámetro con default en vez de una interface, un `Record` tipado
   en vez de un registro dinámico, una función en vez de una clase.
5. **¿Se puede revertir fácil?** Si agregarla después es barato, se espera a necesitarla.

Si la respuesta es "sí, aporta", se introduce sin culpa: YAGNI no prohíbe abstraer, prohíbe abstraer
sin motivo.

Catálogo de decisiones habituales, cada una con su costo, su beneficio y cuándo conviene:
[references/patterns.md](references/patterns.md).

## Al revisar o tocar código existente

- **No se refactoriza por estética.** Un diseño imperfecto que funciona, se entiende y no está cambiando
  se deja como está. Se refactoriza cuando el código **está por cambiar** y su forma actual encarece ese cambio,
  o cuando hay un bug estructural.
- **Se mejora en la dirección del cambio**: si hay que tocar un service enorme para una funcionalidad, se
  extrae la parte que se toca, no todo el archivo.
- **Se respeta la convención del proyecto** aunque esta guía sugiera otra cosa. La coherencia vale más que
  la versión ideal en un solo archivo. Si la convención está mal, se propone cambiarla aparte.
- **Cambios de arquitectura y de comportamiento, separados.** Un refactor no cambia lo que hace el sistema,
  y una funcionalidad no trae un refactor grande escondido.

Checklist para funcionalidades nuevas y para revisión: [references/checklist.md](references/checklist.md).

## Reglas que conviene verificar automáticamente

Las fronteras importantes se protegen con tests que analizan el código fuente, no con buena voluntad:

- El ORM o el cliente de base de datos solo se usa en repositorios (y en la infraestructura de base de datos).
- `shared/` no importa nada de los módulos de negocio.
- Entre módulos solo se usa la API pública (`index`) del otro, nunca un archivo interno.
- Las llamadas a proveedores externos pasan por un único envoltorio (timeout, reintentos, circuit breaker, log).

Cuando una guarda falla, casi siempre se corrige moviendo el código a su lugar. Relajar la guarda es el
último recurso y se discute aparte.

## Cuándo esta guía no aplica tal cual

- **Scripts, prototipos o herramientas internas pequeñas**: capas mínimas, o ninguna.
- **Dominios con reglas muy ricas** (muchas invariantes, mucho lenguaje del negocio): conviene un modelo de
  dominio explícito (entidades con comportamiento, puertos formales). Ahí Clean o hexagonal se pagan solos.
- **Varias implementaciones reales de una misma dependencia** (multi-proveedor, multi-tenant con backends
  distintos): ahí sí, interfaces y puertos explícitos.
