import commonResponses from '../../../config/swagger/responses/common.responses';

/**
 * ============================================================
 * AUTH BIOMETRIC PATHS — CLIENT
 * ============================================================
 * Módulo: /client/api/v1/auth/biometric
 *
 * Flujo de registro (requiere dispositivo TRUSTED):
 *   POST /client/api/v1/auth/biometric/register/start   → genera challenge
 *   POST /client/api/v1/auth/biometric/register/finish  → registra credencial
 *
 * Flujo de login (público):
 *   POST /client/api/v1/auth/biometric/login/start      → genera challenge
 *   POST /client/api/v1/auth/biometric/login/finish     → autentica y devuelve tokens
 *
 * Gestión (requiere autenticación):
 *   GET    /client/api/v1/auth/biometric/credentials    → lista credenciales activas
 *   DELETE /client/api/v1/auth/biometric/:credentialId  → elimina credencial
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  // ── Register ──────────────────────────────────────────────

  BiometricRegisterStartResponse: {
    type: 'object',
    properties: {
      challenge: {
        type: 'string',
        description: 'Challenge base64url que el dispositivo debe firmar con su llave privada ES256.',
        example: 'dGhpcyBpcyBhIHRlc3QgY2hhbGxlbmdl'
      },
      deviceId: {
        type: 'string',
        format: 'uuid',
        description: 'ID del `UserTrustedDevice` asociado a este registro.'
      },
      algorithm: {
        type: 'integer',
        example: -7,
        description: 'Algoritmo requerido. `-7` = ES256 (ECDSA con P-256 y SHA-256).'
      }
    }
  },

  BiometricRegisterFinishRequest: {
    type: 'object',
    required: ['credentialId', 'publicKey', 'challenge', 'signature'],
    properties: {
      credentialId: {
        type: 'string',
        description: 'ID único de la credencial generado por el dispositivo (base64url).',
        example: 'AQIDBAUGBwgJCgsMDQ4PEA=='
      },
      publicKey: {
        type: 'string',
        description: 'Llave pública ES256 del dispositivo en base64 (formato DER/SPKI) o PEM.',
        example: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...'
      },
      challenge: {
        type: 'string',
        description: 'El mismo challenge recibido en `register/start`.',
        example: 'dGhpcyBpcyBhIHRlc3QgY2hhbGxlbmdl'
      },
      signature: {
        type: 'string',
        description: 'Firma ES256 del challenge en base64url (formato DER o raw r||s de 64 bytes).',
        example: 'MEUCIQD...'
      }
    }
  },

  BiometricRegisterFinishResponse: {
    type: 'object',
    properties: {
      biometricCredentialId: { type: 'string', format: 'uuid' },
      credentialId: {
        type: 'string',
        description: 'ID de la credencial tal como lo envió el dispositivo.'
      },
      deviceId: { type: 'string', format: 'uuid' },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  // ── Login ─────────────────────────────────────────────────

  BiometricLoginStartRequest: {
    type: 'object',
    required: ['nationalId'],
    properties: {
      nationalId: {
        type: 'string',
        example: '12345678-9',
        description: 'Identificador nacional del usuario. Se usa para buscar sus credenciales biométricas.'
      }
    }
  },

  BiometricLoginStartResponse: {
    type: 'object',
    properties: {
      challenge: {
        type: 'string',
        description: 'Challenge base64url que el dispositivo debe firmar con su llave privada.',
        example: 'dGhpcyBpcyBhIHRlc3QgY2hhbGxlbmdl'
      },
      userId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID del usuario identificado. Necesario para construir la firma en el dispositivo.'
      }
    }
  },

  BiometricLoginFinishRequest: {
    type: 'object',
    required: ['credentialId', 'challenge', 'signature', 'signCount'],
    properties: {
      credentialId: {
        type: 'string',
        description: 'ID de la credencial registrada en `register/finish`.',
        example: 'AQIDBAUGBwgJCgsMDQ4PEA=='
      },
      challenge: {
        type: 'string',
        description: 'El mismo challenge recibido en `login/start`.',
        example: 'dGhpcyBpcyBhIHRlc3QgY2hhbGxlbmdl'
      },
      signature: {
        type: 'string',
        description: 'Firma ES256 del challenge en base64url.',
        example: 'MEUCIQD...'
      },
      signCount: {
        type: 'integer',
        minimum: 0,
        example: 1,
        description: 'Contador del authenticator. Debe ser **mayor** al almacenado en servidor (protección anti-replay).'
      },
      acceptPolicy: {
        type: 'boolean',
        example: true,
        description:
          '**Opcional.** Enviar `true` solo cuando el servidor retornó `requiresPolicyAcceptance: true` en un intento anterior y el usuario aceptó la nueva política.'
      }
    }
  },

  // ── Credential ────────────────────────────────────────────

  BiometricCredential: {
    type: 'object',
    properties: {
      biometricCredentialId: { type: 'string', format: 'uuid' },
      deviceId: {
        type: 'string',
        format: 'uuid',
        description: 'ID del `UserTrustedDevice` asociado.'
      },
      credentialId: { type: 'string', description: 'ID opaco generado por el dispositivo.' },
      signCount: { type: 'integer', example: 5 },
      isActive: { type: 'boolean', example: true },
      lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },

  BiometricCredentialListResponse: {
    type: 'object',
    properties: {
      credentials: {
        type: 'array',
        items: { $ref: '#/components/schemas/BiometricCredential' }
      },
      total: { type: 'integer', example: 2 }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── POST /auth/biometric/register/start ─────────────────────
  '/client/api/v1/auth/biometric/register/start': {
    post: {
      tags: ['Auth - Biométrico'],
      summary: 'Iniciar registro de huella',
      description: `Genera un challenge para registrar una nueva credencial biométrica.

**Requisito:** el dispositivo debe tener estado \`trusted\`. No es posible registrar una huella desde un dispositivo pendiente de aprobación.

**Flujo completo:**
1. \`POST /auth/biometric/register/start\` → recibe \`challenge\` + \`deviceId\`
2. El dispositivo firma el challenge con su llave privada ES256 y genera un par de llaves
3. \`POST /auth/biometric/register/finish\` → envía \`credentialId\`, \`publicKey\`, \`challenge\`, \`signature\``,
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/BiometricRegisterStartResponse' },
          'Challenge de registro generado.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.Conflict,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /auth/biometric/register/finish ────────────────────
  '/client/api/v1/auth/biometric/register/finish': {
    post: {
      tags: ['Auth - Biométrico'],
      summary: 'Completar registro de huella',
      description: `Recibe la llave pública y la firma del challenge para registrar la credencial biométrica.

**Algoritmo soportado:** ES256 (ECDSA con P-256 y SHA-256).

La firma puede venir en formato DER o en formato raw (r||s, 64 bytes) — el servidor detecta automáticamente.`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BiometricRegisterFinishRequest' }
          }
        }
      },
      responses: {
        201: commonResponses.created(
          { $ref: '#/components/schemas/BiometricRegisterFinishResponse' },
          'Huella registrada exitosamente.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.Conflict,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /auth/biometric/login/start ────────────────────────
  '/client/api/v1/auth/biometric/login/start': {
    post: {
      tags: ['Auth - Biométrico'],
      summary: 'Iniciar login biométrico',
      description: `Genera un challenge de autenticación a partir del \`nationalId\` del usuario.

**Endpoint público** — no requiere token.

El challenge expira en **5 minutos**. Si el usuario no completa el login en ese tiempo, debe iniciar el flujo nuevamente.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BiometricLoginStartRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/BiometricLoginStartResponse' },
          'Challenge de autenticación generado.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /auth/biometric/login/finish ───────────────────────
  '/client/api/v1/auth/biometric/login/finish': {
    post: {
      tags: ['Auth - Biométrico'],
      summary: 'Completar login biométrico',
      description: `Verifica la firma del dispositivo y autentica al usuario. La huella actúa como **segundo factor** — bypasea el MFA (segundo factor propio).

**Endpoint público** — no requiere token.

**Validaciones de seguridad:**
- El challenge debe ser válido, no expirado y no utilizado previamente.
- El \`signCount\` debe ser mayor al almacenado (protección anti-replay).
- La firma ES256 debe ser válida con la llave pública registrada.
- El dispositivo asociado a la credencial debe seguir siendo \`trusted\`.

La respuesta incluye \`hmacSecret\` que el dispositivo debe guardar en el **keychain** para firmar requests posteriores.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/BiometricLoginFinishRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          {
            oneOf: [{ $ref: '#/components/schemas/LoginResponse' }, { $ref: '#/components/schemas/PolicyUpdateRequiredResponse' }]
          },
          'Autenticación biométrica exitosa, o política desactualizada.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Forbidden,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /auth/biometric/credentials ─────────────────────────
  '/client/api/v1/auth/biometric/credentials': {
    get: {
      tags: ['Auth - Biométrico'],
      summary: 'Listar credenciales biométricas',
      description:
        'Retorna todas las credenciales biométricas activas del usuario autenticado, ordenadas por fecha de creación descendente.',
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/BiometricCredentialListResponse' },
          'Credenciales biométricas obtenidas.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── DELETE /auth/biometric/:credentialId ─────────────────────
  '/client/api/v1/auth/biometric/{credentialId}': {
    delete: {
      tags: ['Auth - Biométrico'],
      summary: 'Eliminar credencial biométrica',
      description: `Desactiva (soft delete) una credencial biométrica del usuario.

Tras eliminarla, el dispositivo asociado ya no podrá hacer login biométrico hasta registrar una nueva huella.`,
      parameters: [
        {
          name: 'credentialId',
          in: 'path',
          required: true,
          description: 'UUID de la credencial biométrica a eliminar.',
          schema: { type: 'string', format: 'uuid' }
        }
      ],
      responses: {
        ...commonResponses.noContent,
        ...commonResponses.Unauthorized,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
