const commonResponses = require('../../../../responses/common.responses');

const schemas = {
  AuthTokens: {
    type: 'object',
    description: 'Tokens RS256 emitidos por el servidor (autenticación propia).',
    properties: {
      accessToken: { type: 'string', description: 'JWT RS256 de acceso. Válido 15 minutos.' },
      refreshToken: {
        type: 'string',
        description: 'JWT RS256 de refresco. Tope absoluto 24h. Se rota en cada uso (guardar el nuevo y descartar el anterior).'
      },
      expiresIn: {
        type: 'integer',
        example: 900,
        description: 'Tiempo de expiración del access token en segundos (15 minutos = 900).'
      }
    }
  },

  LoginResponse: {
    type: 'object',
    properties: {
      user: { $ref: '#/components/schemas/User' },
      person: { $ref: '#/components/schemas/Person', nullable: true },
      contact: { $ref: '#/components/schemas/PersonContact', nullable: true },
      location: { $ref: '#/components/schemas/PersonLocation', nullable: true },
      tokens: { $ref: '#/components/schemas/AuthTokens' },
      deviceId: {
        type: 'string',
        format: 'uuid',
        description: 'ID del dispositivo registrado en esta sesión.'
      },
      hmacSecret: {
        type: 'string',
        nullable: true,
        description:
          '**Solo mobile.** Secret HMAC-SHA256 único para este dispositivo. Guárdalo en el keychain — se usa para firmar cada request (`x-signature`). No se expone en web.'
      }
    }
  },

  PolicyUpdateRequiredResponse: {
    type: 'object',
    description:
      'Se retorna cuando el usuario tiene una versión antigua de la política. **No incluye tokens.** El usuario debe aceptar la nueva versión y reintentar el login con `acceptPolicy: true`.',
    properties: {
      requiresPolicyAcceptance: { type: 'boolean', example: true },
      policy: {
        type: 'object',
        properties: {
          currentVersion: {
            type: 'string',
            nullable: true,
            example: '1.0',
            description: 'Versión que el usuario tenía aceptada. `null` si nunca aceptó ninguna.'
          },
          newVersion: {
            type: 'string',
            example: '1.1',
            description: 'Versión activa que debe aceptar.'
          },
          documentUrl: {
            type: 'string',
            example: 'https://base-project.com/docs/politica-v1.1.pdf',
            description: 'URL pública del PDF con la nueva política.'
          },
          summary: {
            type: 'string',
            nullable: true,
            example: 'Se actualizaron las cláusulas de uso de datos.',
            description: 'Resumen de los cambios respecto a la versión anterior.'
          },
          effectiveDate: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Fecha desde la que esta versión entra en vigor.'
          }
        }
      },
      message: {
        type: 'string',
        example: 'Hay una nueva versión de la política de privacidad. Debes aceptarla para continuar.'
      }
    }
  },

  DeviceApprovalRequiredResponse: {
    type: 'object',
    properties: {
      requiresDeviceApproval: { type: 'boolean', example: true },
      deviceId: { type: 'string', format: 'uuid' },
      message: {
        type: 'string',
        example: 'Dispositivo pendiente de aprobación. Apruébalo desde un dispositivo de confianza para continuar.'
      }
    }
  },

  MFARequiredResponse: {
    type: 'object',
    properties: {
      requiresMFA: { type: 'boolean', example: true },
      challengeType: {
        type: 'string',
        enum: ['SOFTWARE_TOKEN_MFA', 'SMS_OTP'],
        example: 'SOFTWARE_TOKEN_MFA',
        description:
          '`SOFTWARE_TOKEN_MFA` → el usuario debe ingresar el código de su app autenticadora (TOTP). `SMS_OTP` → el usuario debe ingresar el código enviado por SMS.'
      },
      preferredMfaMethod: {
        type: 'string',
        enum: ['totp', 'sms'],
        example: 'totp',
        description:
          'Método MFA preferido del usuario. Usar para decidir qué instrucción mostrar al usuario: `totp` → "Abre tu app de autenticación"; `sms` → "Ingresa el código que llegó a tu teléfono".'
      },
      username: {
        type: 'string',
        description: 'Username del usuario, requerido en `/auth/verify-mfa`.'
      },
      session: {
        type: 'string',
        description: 'Token de reto MFA (JWT corto) devuelto por `/auth/login`; se reenvía a `/auth/verify-mfa`.'
      }
    }
  },

  // ── Sesión activa asociada a un dispositivo ──────────────────
  UserSession: {
    type: 'object',
    nullable: true,
    properties: {
      sessionId: { type: 'string', format: 'uuid', description: 'ID único de la sesión.' },
      status: { type: 'string', enum: ['active', 'closed'] },
      ipAddress: { type: 'string', nullable: true, example: '192.168.1.1' },
      userAgent: { type: 'string', nullable: true, example: 'Mozilla/5.0...' },
      startedAt: {
        type: 'string',
        format: 'date-time',
        description: 'Fecha de inicio de la sesión.'
      },
      lastAccessAt: {
        type: 'string',
        format: 'date-time',
        description: 'Último acceso registrado.'
      },
      closedAt: { type: 'string', format: 'date-time', nullable: true },
      closeReason: {
        type: 'string',
        nullable: true,
        example: 'logout',
        description:
          'Razón de cierre: logout, logout_all, logout_others, closed_by_user, reauth_same_device, session_limit, password_reset, revoked_by_admin, etc.'
      },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  TrustedDevice: {
    type: 'object',
    properties: {
      userTrustedDeviceId: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      deviceName: { type: 'string', example: 'iPhone de Juan' },
      fingerprintHash: { type: 'string' },
      isCurrent: {
        type: 'boolean',
        description: '`true` solo si este es el dispositivo que hace el request **y** su última sesión sigue activa.'
      },
      status: { type: 'string', enum: ['pending', 'trusted', 'blocked'] },
      isPending: { type: 'boolean' },
      browser: { type: 'string', nullable: true, example: 'Chrome' },
      os: { type: 'string', nullable: true, example: 'Windows 11' },
      deviceType: { type: 'string', nullable: true, example: 'Desktop' },
      ipAddress: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true },
      country: { type: 'string', nullable: true },
      countryCode: { type: 'string', nullable: true, example: 'CO', description: 'Código ISO 3166-1 alfa-2 del país.' },
      approvedByDeviceId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'ID del dispositivo de confianza que aprobó este dispositivo.'
      },
      approvedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Fecha en que fue aprobado.' },
      blockedByDeviceId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'ID del dispositivo de confianza que bloqueó este dispositivo.'
      },
      blockedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Fecha en que fue bloqueado.' },
      trustedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'Fecha en que el dispositivo pasó a estado `trusted`.'
      },
      lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      activeSession: {
        allOf: [{ $ref: '#/components/schemas/UserSession' }],
        nullable: true,
        description:
          'Última sesión del dispositivo (la más reciente por `lastAccessAt`), **activa o cerrada**. Revisa `status` para saber si sigue activa: una sesión cerrada se sigue mostrando aquí (no desaparece) para poder ver su último acceso (`startedAt`). `null` solo si el dispositivo nunca tuvo una sesión.'
      }
    }
  },

  TrustedDeviceList: {
    type: 'object',
    properties: {
      devices: { type: 'array', items: { $ref: '#/components/schemas/TrustedDevice' } },
      total: { type: 'integer', example: 2 }
    }
  },

  TrustedDeviceUpdate: {
    type: 'object',
    properties: {
      userTrustedDeviceId: { type: 'string', format: 'uuid' },
      deviceName: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'trusted', 'blocked'] },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  }
};

// ─── Parámetros reutilizables ─────────────────────────────────

const clientTypeHeader = {
  name: 'x-client-type',
  in: 'header',
  required: true,
  description: 'Canal de origen. `web` usa cookies httpOnly; `mobile` envía tokens en headers y recibe `hmacSecret`.',
  schema: { type: 'string', enum: ['web', 'mobile'] }
};

const deviceIdParam = {
  name: 'deviceId',
  in: 'path',
  required: true,
  description: 'UUID del dispositivo.',
  schema: { type: 'string', format: 'uuid' }
};

const paths = {
  // ── POST /client/api/v1/auth/login ───────────────────────────
  '/client/api/v1/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Iniciar sesión',
      operationId: 'login',
      security: [],
      parameters: [clientTypeHeader],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['nationalId', 'password'],
              properties: {
                nationalId: { type: 'string', example: '12345678-9' },
                password: { type: 'string', format: 'password' },
                pushToken: {
                  type: 'string',
                  description: 'Token FCM/APNs para push notifications (opcional, solo mobile).'
                },
                pushDeviceId: {
                  type: 'string',
                  description: 'ID del dispositivo push (opcional, solo mobile).'
                },
                pushPlatform: {
                  type: 'string',
                  enum: ['android', 'ios'],
                  description: 'Plataforma del dispositivo (opcional, solo mobile).'
                },
                acceptPolicy: {
                  type: 'boolean',
                  example: true,
                  description:
                    '**Opcional.** Enviar `true` solo cuando el servidor retornó `requiresPolicyAcceptance: true` en un intento anterior y el usuario aceptó la nueva política.'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          {
            oneOf: [
              { $ref: '#/components/schemas/LoginResponse' },
              { $ref: '#/components/schemas/MFARequiredResponse' },
              { $ref: '#/components/schemas/DeviceApprovalRequiredResponse' },
              { $ref: '#/components/schemas/PolicyUpdateRequiredResponse' }
            ]
          },
          'Login exitoso, MFA requerido, dispositivo pendiente, o política desactualizada.'
        ),
        ...commonResponses.Forbidden,
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/verify-mfa ──────────────────────
  '/client/api/v1/auth/verify-mfa': {
    post: {
      tags: ['Auth'],
      summary: 'Verificar código MFA para completar el login',
      operationId: 'verifyMFA',
      security: [],
      parameters: [clientTypeHeader],
      description: `Verifica el código MFA del challenge iniciado en \`/auth/login\` y completa la sesión.

**Según el \`challengeType\` recibido en el login:**
| \`challengeType\`       | Campo a enviar | Instrucción para el usuario                        |
|------------------------|----------------|----------------------------------------------------|
| \`SOFTWARE_TOKEN_MFA\` | \`totpCode\`   | Abre tu app autenticadora e ingresa el código      |
| \`SMS_OTP\`            | \`smsCode\`    | Ingresa el código de 6 dígitos que llegó a tu SMS  |

Se requiere enviar **exactamente uno** de los dos campos (\`totpCode\` o \`smsCode\`).`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['nationalId', 'session'],
              properties: {
                nationalId: { type: 'string', example: '12345678-9' },
                totpCode: {
                  type: 'string',
                  minLength: 6,
                  maxLength: 6,
                  example: '123456',
                  description:
                    'Código de 6 dígitos de la app autenticadora. Requerido cuando `challengeType` es `SOFTWARE_TOKEN_MFA`.'
                },
                smsCode: {
                  type: 'string',
                  minLength: 6,
                  maxLength: 6,
                  example: '123456',
                  description: 'Código de 6 dígitos recibido por SMS. Requerido cuando `challengeType` es `SMS_OTP`.'
                },
                session: {
                  type: 'string',
                  description: 'Token de sesión recibido en la respuesta de `/auth/login`.'
                },
                acceptPolicy: {
                  type: 'boolean',
                  example: true,
                  description:
                    '**Opcional.** Igual que en `/auth/login`. Enviar `true` si el servidor solicitó aceptación de la política.'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          {
            oneOf: [{ $ref: '#/components/schemas/LoginResponse' }, { $ref: '#/components/schemas/PolicyUpdateRequiredResponse' }]
          },
          'MFA verificado. Sesión iniciada, o política desactualizada.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Forbidden,
        ...commonResponses.Unauthorized,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/refresh ─────────────────────────
  '/client/api/v1/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Renovar access token',
      operationId: 'refreshToken',
      security: [],
      description:
        'El refresh token se rota en cada uso: el JTI anterior se revoca y se emite uno nuevo. **El access token anterior también se invalida** (prevalece el nuevo par de tokens).\n\n' +
        '**Llamadas concurrentes.** Durante 60 s tras una rotación, cualquier llamada que llegue con el refresh token ya consumido recibe **el mismo par emitido** (200), no un error. Esto permite que un cliente web con varias pantallas montando a la vez dispare varios refresh sin romper la sesión. Pasada esa ventana, reusar un refresh token ya consumido se trata como reutilización maliciosa y **cierra todas las sesiones del usuario** (401 `SESSION_COMPROMISED`).\n\n' +
        '**Límites.** 30 renovaciones por sesión cada 15 minutos, y una sola renovación en vuelo por sesión (las simultáneas reciben 429). Ambos se cuentan **por sesión**, no por IP.\n\n' +
        '**Recomendación de integración:** mantener un único refresh en vuelo y encolar el resto de peticiones detrás de él; reintentar el 429 con backoff, nunca tratarlo como cierre de sesión.',
      parameters: [
        clientTypeHeader,
        {
          name: 'x-refresh-token',
          in: 'header',
          required: false,
          description:
            '**Requerido solo para mobile.** La web lo envía automáticamente en la cookie `refresh_token`; el servidor detecta el canal por la presencia de esa cookie, sin depender de `x-client-type`.',
          schema: { type: 'string' }
        }
      ],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/AuthTokens' }, 'Tokens renovados exitosamente.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/logout ──────────────────────────
  '/client/api/v1/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar sesión del dispositivo actual',
      operationId: 'logout',
      description:
        'Cierra la sesión actual: invalida el access token en Redis, revoca el refresh token y registra el cierre en BD.',
      responses: {
        200: commonResponses.ok({ type: 'object', nullable: true }, 'Sesión cerrada exitosamente.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/logout-all ──────────────────────
  '/client/api/v1/auth/logout-all': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar sesión en todos los dispositivos',
      operationId: 'logoutAll',
      description:
        'Invalida todos los tokens del usuario: invalidación masiva en Redis (blacklist) y cierre de todas las sesiones en BD. El usuario debe volver a hacer login en cada dispositivo.',
      responses: {
        200: commonResponses.ok({ type: 'object', nullable: true }, 'Sesión cerrada en todos los dispositivos.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/logout-others ───────────────────
  '/client/api/v1/auth/logout-others': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar todas las sesiones excepto la actual',
      operationId: 'logoutOthers',
      description:
        'Cierra todas las sesiones activas del usuario **excepto la sesión actual**. Por cada sesión cerrada se revoca el refresh token y se **invalida su access token de inmediato** (vía umbral por sesión en Redis), por lo que dejan de funcionar al instante, sin esperar a su expiración natural.',
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              closedCount: {
                type: 'integer',
                example: 3,
                description: 'Número de sesiones cerradas.'
              }
            }
          },
          'Todas las demás sesiones han sido cerradas.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── DELETE /client/api/v1/auth/sessions/:sessionId ───────────
  '/client/api/v1/auth/sessions/{sessionId}': {
    delete: {
      tags: ['Auth'],
      summary: 'Cerrar una sesión específica',
      operationId: 'closeSession',
      description:
        'Cierra una sesión activa específica del usuario **que no sea la sesión actual**. Revoca su refresh token e **invalida su access token de inmediato** (umbral por sesión en Redis), por lo que esa sesión deja de funcionar al instante. Para cerrar la sesión actual usa `/auth/logout`.',
      parameters: [
        {
          name: 'sessionId',
          in: 'path',
          required: true,
          description: 'UUID de la sesión a cerrar.',
          schema: { type: 'string', format: 'uuid' }
        }
      ],
      responses: {
        200: commonResponses.ok(
          {
            type: 'object',
            properties: {
              sessionId: { type: 'string', format: 'uuid' },
              status: { type: 'string', example: 'closed' }
            }
          },
          'Sesión cerrada exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/auth/devices ──────────────────────────
  '/client/api/v1/auth/devices': {
    get: {
      tags: ['Auth - Devices'],
      summary: 'Listar dispositivos del usuario',
      operationId: 'getTrustedDevices',
      description:
        'Devuelve todos los dispositivos del usuario (trusted, pending y blocked) con su **última sesión** (`activeSession`), que puede estar activa o cerrada — una sesión cerrada no desaparece, se muestra con su `status` y su último acceso (`startedAt`). El campo `isCurrent` indica el dispositivo que hace la solicitud y cuya sesión sigue activa.',
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TrustedDeviceList' }, 'Dispositivos obtenidos exitosamente.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/auth/devices/pending ──────────────────
  '/client/api/v1/auth/devices/pending': {
    get: {
      tags: ['Auth - Devices'],
      summary: 'Listar dispositivos pendientes de aprobación',
      operationId: 'getPendingDevices',
      description:
        'Devuelve solo los dispositivos en estado `pending`. Útil para mostrar la notificación de aprobación desde un dispositivo trusted.',
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TrustedDeviceList' }, 'Dispositivos pendientes obtenidos.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PATCH /client/api/v1/auth/devices/:deviceId ──────────────
  '/client/api/v1/auth/devices/{deviceId}': {
    patch: {
      tags: ['Auth - Devices'],
      summary: 'Renombrar dispositivo',
      operationId: 'renameDevice',
      parameters: [deviceIdParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['deviceName'],
              properties: {
                deviceName: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 100,
                  example: 'iPhone de Juan'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TrustedDeviceUpdate' }, 'Dispositivo renombrado.'),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/devices/:deviceId/approve ───────
  '/client/api/v1/auth/devices/{deviceId}/approve': {
    post: {
      tags: ['Auth - Devices'],
      summary: 'Aprobar dispositivo pendiente',
      operationId: 'approveDevice',
      description:
        'Cambia el estado del dispositivo de `pending` a `trusted`. **Solo puede ejecutarse desde un dispositivo trusted.**',
      parameters: [deviceIdParam],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TrustedDeviceUpdate' }, 'Dispositivo aprobado.'),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Forbidden,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/devices/:deviceId/block ─────────
  '/client/api/v1/auth/devices/{deviceId}/block': {
    post: {
      tags: ['Auth - Devices'],
      summary: 'Bloquear dispositivo',
      operationId: 'blockDevice',
      description:
        'Bloquea un dispositivo (trusted o pending). **Solo puede ejecutarse desde un dispositivo trusted. No se puede bloquear el único dispositivo trusted del usuario.**',
      parameters: [deviceIdParam],
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TrustedDeviceUpdate' }, 'Dispositivo bloqueado.'),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Forbidden,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/auth/devices/:deviceId/unblock ───────
  '/client/api/v1/auth/devices/{deviceId}/unblock': {
    post: {
      tags: ['Auth - Devices'],
      summary: 'Desbloquear dispositivo',
      operationId: 'unblockDevice',
      description:
        'Cambia el estado del dispositivo de `blocked` a `pending` (requiere nueva aprobación). **Solo puede ejecutarse desde un dispositivo trusted.**',
      parameters: [deviceIdParam],
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/TrustedDeviceUpdate' },
          'Dispositivo desbloqueado. Queda en estado pending hasta ser aprobado.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.Forbidden,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  }
};

module.exports = { paths, schemas };
