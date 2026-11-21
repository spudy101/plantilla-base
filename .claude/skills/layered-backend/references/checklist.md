# Checklist: funcionalidades nuevas y revisión de código existente

La checklist sirve para **detectar problemas**, no para exigir que todo se vea igual. Un "no" no obliga a
cambiar nada: obliga a preguntarse si ese "no" tiene un motivo.

---

## A. Antes de implementar una funcionalidad

- [ ] ¿Ya existe algo parecido en el proyecto? Se copia el molde de un módulo similar antes de inventar uno.
- [ ] ¿Hay un service compartido que ya resuelve parte del flujo? Se reutiliza en vez de copiar la regla.
- [ ] ¿A qué módulo pertenece? Si toca dos, ¿cuál es el dueño y cuál consume por su `index`?
- [ ] ¿Necesita alguna abstracción nueva? Si sí, pasa las 5 preguntas de "Cómo decidir ante una abstracción
      nueva" en `SKILL.md`.

## B. Al implementar

**Capas**
- [ ] La ruta declara auth, permisos, validación (esquema) y, si aplica, idempotencia.
- [ ] El controller solo traduce: request validado → **un** método del service → respuesta.
- [ ] El service no conoce HTTP ni el ORM (los tipos de filas sí, como tipos).
- [ ] Las consultas, filtros y joins están en el repositorio, con nombre de negocio.
- [ ] La salida pasa por un DTO explícito; ningún campo sensible sale sin enmascarar.

**SOLID**
- [ ] (S) ¿El service nuevo o modificado tiene una sola razón para cambiar? Si mezcla flujos, se divide.
- [ ] (O) ¿Hay una variante que va a crecer (tipos, formatos, proveedores)? → registro o estrategia. ¿Es un
      conjunto chico y cerrado? → `Record` tipado o `switch` exhaustivo.
- [ ] (L) Si extiende una base o implementa un contrato, ¿cumple todo lo que promete, sin "no soportado"?
- [ ] (I) ¿Depende solo de lo que usa (`Pick` o tipo mínimo)?
- [ ] (D) ¿Las dependencias de infraestructura o volátiles se inyectan (constructor con default)? ¿Las
      utilidades puras se importan directo, sin interfaces de más?

**Datos y efectos**
- [ ] Varias escrituras → una sola transacción (Unit of Work).
- [ ] Nada de red (proveedores, colas externas) dentro de la transacción.
- [ ] Auditoría y notificaciones después del commit, o encoladas dentro de la transacción.
- [ ] Llamadas a terceros por el envoltorio común (timeout, reintentos, breaker, log).
- [ ] Listados con el contrato común (orden permitido, desempate por clave primaria, metadata de lo aplicado).

**Verificación**
- [ ] Tests del service con dependencias inyectadas (sin infraestructura real).
- [ ] Las guardas de arquitectura y el typecheck pasan.
- [ ] La documentación del proyecto sigue coincidiendo con el código (rutas, nombres, ejemplos).

## C. Al revisar código existente

Primero se pregunta **si hay que cambiar algo**, y después qué.

**¿Vale la pena tocarlo?**
- [ ] ¿Este código está por cambiar (funcionalidad, bug) y su forma actual encarece el cambio? → Sí,
      mejorarlo en la dirección del cambio.
- [ ] ¿Hay un bug estructural (transacción mal cerrada, efecto antes del commit, frontera cruzada que causa
      ciclos)? → Sí, arreglarlo aunque nadie lo esté tocando.
- [ ] ¿Funciona, se entiende y nadie lo está cambiando? → **No se toca**, aunque no sea como lo
      escribiríamos hoy. Se puede dejar anotado.
- [ ] ¿El cambio es solo estético o "para que quede más SOLID"? → No se hace.

**Si se toca, qué buscar**
- [ ] Services de cientos de líneas que mezclan flujos → extraer **solo** la parte que se está tocando
      (técnica de la fachada).
- [ ] Reglas de negocio duplicadas entre flujos → extraer un service compartido.
- [ ] El ORM fuera de repositorios → mover la consulta a un método con nombre de negocio.
- [ ] `if` que crece con cada variante nueva → registro, si de verdad crece.
- [ ] Abstracciones sin segunda implementación ni frontera que proteger → candidatas a simplificar. Se
      simplifican solo si estorban al cambio actual: quitarlas también cuesta.
- [ ] Tests que dependen de `jest.mock` globales → inyección por constructor cuando se toque ese service.

**Cómo entregar el cambio**
- [ ] Refactor y cambio de comportamiento en commits (o PRs) separados.
- [ ] El refactor no cambia lo que hace el sistema; los tests existentes pasan sin modificar sus
      expectativas.
- [ ] Si el cambio contradice una convención del proyecto, se discute la convención aparte; no se cambia
      en un solo archivo.

## D. Señales de que se está sobre-diseñando

- Se escribe una interface antes que la primera implementación.
- Una funcionalidad simple necesita tocar más de 6 u 8 archivos "porque la arquitectura lo pide".
- Aparecen nombres como `AbstractBaseManagerFactory` o `IXxxService` con una sola implementación.
- El código está "preparado para" algo que nadie pidió (multi-tenant, otro ORM, microservicios).
- Para explicar el flujo hay que abrir más archivos de los que justifica su complejidad.

## E. Señales de que falta diseño

- Para testear una regla de negocio hace falta levantar la base o un proveedor.
- Un cambio en un flujo rompe otro que no tiene relación.
- La misma regla está escrita en dos o más lugares.
- El service arma `where` o joins del ORM.
- Un controller tiene `if` de negocio o consultas.
