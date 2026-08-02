# 🔔 Notificaciones

> **Grupo RBAC:** `notifications` · **Prefijo omitido:** `/admin/api/v1`
> Parte del mapeo de módulos del hub admin. Ver [README](README.md).

## La idea

Antes era un ítem suelto (`notificationManagement`) + una pieza mal ubicada dentro de Auditoría (el
reenvío). Se consolidan en un **grupo propio** con 2 partes: gestión de tipos + envíos/reenvíos.

**Estructura:**
```
🔔 Notificaciones  (grupo)
├─ Tipos / Gestión           → notificationManagement
└─ Envíos y Reenvíos         → notificationResend     (⬅️ SALE de Auditoría)
```

---

## Tipos / Gestión — `RBAC: notificationManagement`
```
GET    /notification/notification-types
POST   /notification/notification-types/global · /direct   (create)
PATCH  /notification/notification-types/:notificationTypeId (update)
```

## Envíos y Reenvíos — `RBAC: notificationResend`  *(era "Notificaciones SMS" dentro de Auditoría)*
```
GET    /notification/notification-delivery[/:id]
POST   /notification/notification-delivery/:id/retry       (update — reenviar)
```

*Quién:* notificationManagement → admins; notificationResend → ATENCION_CLIENTE
(`read`/`create`/**`update`**; el `update` es el que habilita el retry — se agregó el 2026-07-22, antes el
endpoint devolvía 403 para todo rol no-wildcard).

---

## Decisiones del módulo

| # | Acción | Detalle | Estado |
|---|--------|---------|--------|
| 1 | notificationResend sale de Auditoría | Se une a Notificaciones (mismo grupo RBAC `notifications`). | ✅ |
| 2 | Notificaciones = grupo | Deja de ser ítem suelto; 2 partes: Gestión + Envíos/Reenvíos. | ✅ |
