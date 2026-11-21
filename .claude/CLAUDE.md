# Criterio de trabajo en este backend

Este archivo es portable: no habla de ningún proyecto en particular. Lo específico del repositorio (comandos,
estructura real, reglas propias) va en el `CLAUDE.md` de la raíz.

## Filosofía

- **KISS + YAGNI + SOLID pragmático.** Código simple y responsabilidades claras. Nada "por si acaso".
- **SOLID se usa para detectar problemas de diseño, no como meta.** S, L e I casi siempre; O cuando las
  variantes crecen de verdad; D de forma **selectiva**: se invierte la infraestructura (persistencia,
  proveedores, transacciones, reloj) y no lo puro ni lo estable.
- **Arquitectura por capas** (rutas/controllers → services → repositorios) en un **monolito modular** por
  dominio, con un `shared/` técnico sin conocimiento del negocio. El camino a hexagonal o Clean queda
  abierto, pero no se adelanta sin una necesidad real.
- **Las abstracciones se justifican.** Una interface, un puerto o un registro se introducen cuando aportan
  algo concreto (frontera con infraestructura, segunda implementación real, variantes que crecen), no por
  costumbre. Si aportan, se introducen sin culpa.

Para el criterio completo (ejemplos buenos y malos, beneficios y costos de cada decisión, checklist) usa el
skill **`layered-backend`** al diseñar una funcionalidad, al revisar código o al dudar si conviene una
abstracción.

## Cómo trabajar

- **Respetar las convenciones del proyecto** antes que la versión "ideal". Si una convención parece mal,
  se propone cambiarla aparte; no se cambia en un solo archivo.
- **No refactorizar por estética.** Se mejora el código que está por cambiar, en la dirección del cambio.
  Lo que funciona, se entiende y nadie toca, se deja.
- **Refactor y cambio de comportamiento, separados** (commits o PRs distintos).
- **Las fronteras se verifican con tests**, no con buena voluntad. Si una guarda de arquitectura falla, se
  mueve el código a su lugar; relajar la guarda se discute aparte.
- **La documentación debe coincidir con el código.** Si se cambia algo que un documento describe, se
  actualiza el documento en el mismo cambio.
- **Explicar los trade-offs** al proponer un diseño: qué se gana, qué cuesta y qué alternativa más simple
  se descartó.
