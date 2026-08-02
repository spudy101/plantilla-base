# ============================================================
# Dockerfile — Base Project API
# Multi-stage: builder instala deps, runner es la imagen final
# ============================================================

# ── STAGE 1: builder ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar solo los manifests primero para aprovechar cache de capas
COPY package.json package-lock.json ./

# Instalar TODAS las dependencias (incluye devDependencies como sequelize-cli)
RUN npm ci --frozen-lockfile

# Copiar el resto del código
COPY . .

# ── STAGE 2: runner ───────────────────────────────────────
FROM node:20-alpine AS runner

# curl        → requerido por el healthcheck del contenedor
# bash        → requerido por entrypoint.sh
# dumb-init   → maneja señales correctamente (SIGTERM → graceful shutdown)
RUN apk add --no-cache bash curl dumb-init

WORKDIR /app

# Copiar node_modules y código desde builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Usuario no-root por seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app
USER appuser

# HOME escribible para herramientas que crean archivos temporales de perfil.
# appuser no tiene home propio → se apunta a /tmp (world-writable).
ENV HOME=/tmp

# Puerto de la app
EXPOSE 4000

# entrypoint.sh se encarga de:
#   1. Leer secrets desde AWS Secrets Manager
#   2. Correr migraciones (npx sequelize-cli db:migrate)
#   3. Correr seeders si RUN_SEEDS=true
#   4. Arrancar el servidor (node servers/monolith.js)
ENTRYPOINT ["dumb-init", "--", "bash", "entrypoint.sh"]
