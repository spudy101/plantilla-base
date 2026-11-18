# Features — qué hace el sistema (cliente vs admin)

> Mapa de alto nivel de las capacidades del template y dónde vive cada una. El detalle de cada área está
> en su doc dedicado (enlazados abajo). Prefijos reales: `/api/v1/auth`, `/api/v1/kyc`, `/api/v1/notification`,
> `/api/v1/records`.

Cliente y admin **comparten** login, MFA y perfil (routers de `modules/shared-endpoints`). El portal se
discrimina por `req.serverContext` (`client`/`admin`). El admin añade `RbacMiddleware.requirePermission` en
sus rutas propias.

---

## Autenticación e identidad

| Capacidad                                   | Cliente | Admin | Dónde |
| ------------------------------------------- | :-----: | :---: | ----- |
| Registro self-service (email pre-verificado por OTP + login automático) | ✅ | ❌ (usuarios internos se crean por gestión) | `modules/client/kyc/iam/.../auth-register` |
| Login con password + 2º factor              | ✅ | ✅ | `modules/shared-endpoints/kyc/iam/.../auth-login` |
| Refresh rotativo / logout / logout-all      | ✅ | ✅ | idem |
| MFA **TOTP** (setup/activar/verificar/desactivar) | ✅ | ✅ | `.../kyc/iam/.../mfa` |
| MFA **SMS** (request/confirm; reto en login) | ✅ | ✅ | idem |
| Método MFA preferido (totp/sms/none)        | ✅ | ✅ | idem |
| Biométrico (challenge-response ES256 propio, **no** WebAuthn/FIDO2) | ✅ | ❌ | `modules/client/kyc/iam/.../auth-biometric` |
| Reset de credenciales por email (password/mfa) | ✅ | ❌ (admin resetea por gestión) | `.../auth-register` |
| Editar perfil propio (email, teléfono, password, nombres, género, fecha de nacimiento, ubicación, borrar cuenta) | ✅ | ✅ | `modules/shared-endpoints/kyc/person/.../profile` |
| Documento de identidad (RUT + tipo) editable por el propio usuario | ❌ (inmutable; se fija en registro) | ✅ (corrección admin, maker-checker) | `modules/admin/kyc/person/.../admin-person` |
| Referencias personales                       | ✅ | ❌ | `modules/client/kyc/person/.../person-reference` |
| Dispositivos de confianza (listar/renombrar/aprobar/bloquear) | ✅ | ✅ | `.../auth-login` |

> **2FA = opt-in** en el template base: el usuario la activa cuando quiere; el registro no la fuerza. Un
> proyecto derivado que la quiera obligatoria puede gatear el acceso tras el registro/primer login.

Detalle: `docs/auth-sessions.md`.

### Gestión de terceros (solo admin, con RBAC + doble aprobación en acciones sensibles)
- Usuarios internos: CRUD, rol, estado, reset password, disable MFA — `modules/admin/kyc/iam/.../admin-user`.
- Clientes: listar, activar/desactivar, reset password, disable MFA, cambiar email/documento/rol — `modules/admin/kyc/person/.../admin-person`.
- RBAC: módulos, roles, overrides de permisos — `modules/admin/kyc/iam/.../admin-rbac`.
- Ver/revocar sesiones de terceros e intentos de login — `modules/admin/kyc/iam/.../admin-auth-session`.

---

## Notificaciones

| Capacidad                                    | Cliente | Admin | Dónde |
| -------------------------------------------- | :-----: | :---: | ----- |
| Bandeja in-app + conteo no leídas (SSE)      | ✅ | — | `modules/shared-endpoints/notification` |
| Preferencias por **categoría** y global (push/email/**sms** + quiet hours) | ✅ | ✅ | `modules/shared-endpoints/kyc/person/.../notification-preference` |
| Ver entregas + estado por canal              | ❌ | ✅ | `modules/admin/notification/.../admin-notification-delivery` |
| **Reintentar** entrega fallida (email/push/sms) | ❌ | ✅ | idem |
| **Métricas de % de éxito** por canal/categoría/fecha | ❌ | ✅ | idem (`GET .../notification-delivery/metrics`) |
| CRUD de **categorías** (canales, criticidad, DND, layout email) | ❌ | ✅ | `.../admin-notification-category` |
| Editar tipos de notificación (nombre, priority, categoría, templates) | ❌ | ✅ | `.../admin-notification-type` |
| Enviar notificación global / directa         | ❌ | ✅ | idem |

Canales reales: email (SES), push (SNS), SMS (SNS), in-app. Reintentos automáticos por worker
(push/email/**sms**) + detección de hard-bounce. Detalle: `docs/notifications.md`.

---

## Auditoría, logs y trazabilidad por sesión

| Capacidad                                    | Cliente | Admin | Dónde |
| -------------------------------------------- | :-----: | :---: | ----- |
| Logs de auditoría globales (append-only)     | ❌ | ✅ | `modules/admin/records/audit/.../admin-audit-log` |
| Catálogo de acciones de auditoría            | ❌ | ✅ | `.../admin-audit-action-catalog` |
| Change-logs de usuario (antes/después)       | ❌ | ✅ | `.../admin-change-log` |
| **Sesiones + timeline forense** ("qué hizo el usuario en la sesión") | ❌ | ✅ | `.../admin-session-trace` |
| Hidratación de entidades tocadas en la sesión | ❌ | ✅ | idem (`ENTITY_REGISTRY`) |
| Alertas de seguridad (acknowledge)           | ❌ | ✅ | `.../admin-audit-alert` |
| "Mi actividad" (audit propio + cambios de terceros) | ✅ | — | `modules/client/records/audit/.../user-activity` |
| Intentos de login                             | ❌ | ✅ | `.../admin-auth-session` |

Toda fila de dominio se ata a su sesión de origen vía `origin_session_id` (automático). Detalle:
`docs/audit-and-alerts.md` y `docs/origin-session-tracking.md`.

---

## Núcleo transversal
- **Doble aprobación (maker-checker)** en acciones sensibles — `docs/dual-approval-global.md`.
- **RBAC** por módulo/acción con overrides — `docs/rbac/`.
- **Cifrado y PII** (AES-256-GCM, enmascarado) — `docs/encryption-pii.md`, `docs/pii-masking.md`.
- **Consentimientos** y política de privacidad — `modules/*/records/legal`.
- **Base de datos** (migraciones, seed, reset) — `docs/database.md`.
