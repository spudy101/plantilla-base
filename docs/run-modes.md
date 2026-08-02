# Modos de ejecución — monolito vs admin/client separados

> Cómo levantar la API en cada modo, qué comando usa cada uno y qué variables de entorno
> necesita.

## Idea central

Hay **tres entrypoints** en `servers/`, todos extienden `BaseServer` y montan la misma
infraestructura (Redis, DB, workers). El "modo" se elige por **qué comando levantas**, no por
puertos distintos: los tres usan la misma variable `PORT` y **solo corre uno a la vez**.

| Modo               | Entrypoint            | Qué expone                                                                                             |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------ |
| Monolito (default) | `servers/monolith.js` | admin **y** client en un solo proceso: `app.use('/admin', adminApp)` + `app.use('/client', clientApp)` |
| Solo admin         | `servers/admin.js`    | únicamente `adminApp`                                                                                  |
| Solo client        | `servers/client.js`   | únicamente `clientApp`                                                                                 |

## Comandos

| Modo        | Con hot-reload (nodemon) | Plano (node)           |
| ----------- | ------------------------ | ---------------------- |
| Monolito    | `npm run dev`            | `npm start`            |
| Solo admin  | `npm run dev:admin`      | `npm run start:admin`  |
| Solo client | `npm run dev:client`     | `npm run start:client` |

`dev:*` recarga al guardar (nodemon); `start:*` es `node` plano (despliegue).

## Variables de entorno

- **`PORT`** (default `4000`) — único puerto. Lo usan los tres modos. Como solo se levanta un
  modo a la vez, no hay colisión y no se necesitan puertos separados por app.
- El resto de variables (DB, Redis, AWS, JWT, `ENABLE_WORKERS`, etc.) son comunes a los tres
  modos. Ver `.env.example`.

> No existen `PORT_ADMIN`/`PORT_CLIENT`: se decidió no levantar tres puertos simultáneos. Si en el
> futuro se quisieran admin y client a la vez en el mismo host, habría que reintroducir puertos
> separados (vars dedicadas + `server.adminPort`/`server.clientPort` en `shared/constants/config.js`).

## Rutas según el modo

El path declarado en cada `*.routes.js` es el subpath del recurso (ej. `/person`), y cada app lo monta bajo
`/api/v1/{dominio}` (ej. `/api/v1/kyc`). La diferencia entre modos está en el prefijo:

- **Standalone** (admin.js / client.js): `GET /api/v1/kyc/person`
- **Monolito**: se antepone `/admin` o `/client` en el mount → `GET /admin/api/v1/kyc/person`

Ese prefijo `/admin`·`/client` vive solo en el mount del monolito; nunca se hardcodea en los
`*.routes.js`.

## Health & docs

- Monolito: `GET /health` (incluye estado de ambos sub-servicios), `GET /admin/...` y `GET /client/...`.
- Standalone: `GET /health` y `GET /{serviceName}/docs` los provee `BaseApp`.
