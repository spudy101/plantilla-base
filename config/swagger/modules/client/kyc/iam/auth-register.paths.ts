import commonResponses = require('../../../../responses/common.responses');
import piiMaskingDocModule = require('../../../../schemas/pii-masking.doc');
const { UNMASKED_ROUTE_DESC } = piiMaskingDocModule;

/**
 * ============================================================
 * AUTH REGISTER PATHS
 * ============================================================
 * Módulo: /client/api/v1/auth
 * Endpoints públicos — sin bearerAuth
 *
 * Rutas:
 *   POST /client/api/v1/auth/register
 *   POST /client/api/v1/auth/reset-credentials/request
 *   POST /client/api/v1/auth/reset-credentials/confirm
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  RegisterRequest: {
    type: 'object',
    required: ['email', 'password', 'firstName', 'lastName', 'nationalId', 'documentTypeId', 'birthDate', 'acceptedPrivacyPolicy'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        example: 'juan@example.com',
        description:
          '⚠️ El email **debe estar verificado** previamente con `/verification/send-verification` + `/verification/verify-code`.'
      },
      password: { type: 'string', format: 'password', example: 'MiPass123!' },
      firstName: { type: 'string', example: 'Juan' },
      lastName: { type: 'string', example: 'Pérez' },
      middleName: { type: 'string', nullable: true, example: 'Andrés' },
      secondLastName: { type: 'string', nullable: true, example: 'González' },
      nationalId: { type: 'string', example: '12345678-9' },
      birthDate: {
        type: 'string',
        format: 'date',
        example: '1990-05-15',
        description: 'Fecha de nacimiento en formato ISO 8601 (YYYY-MM-DD).'
      },
      documentTypeId: {
        type: 'string',
        format: 'uuid',
        description:
          'UUID del tipo de documento. Debe estar activo y visible para clientes (consultar `GET /kyc/maintainers/document-types`).'
      },
      genderId: { type: 'string', format: 'uuid', nullable: true },
      acceptedPrivacyPolicy: {
        type: 'boolean',
        example: true,
        description:
          'El usuario debe aceptar explícitamente el documento que cubre la **Política de Privacidad, Términos y Condiciones y Tratamiento de Datos**. Requerido por Ley 1581 y App Stores. La versión vigente se toma automáticamente del servidor.'
      },
      comunicacionesComerciales: {
        type: 'boolean',
        example: false,
        description:
          'Consentimiento opcional para recibir comunicaciones comerciales y de marketing. Si se omite o es `false` no se registra consentimiento y no se enviarán comunicaciones comerciales. **Puede revocarse en cualquier momento desde el perfil del usuario.** (Ley 1581/2012 — no puede ser condición de acceso al servicio.)'
      }
    }
  },

  RegisterResponse: {
    type: 'object',
    properties: {
      user: { $ref: '#/components/schemas/User' },
      person: {
        allOf: [
          { $ref: '#/components/schemas/Person' },
          {
            type: 'object',
            properties: {
              gender: {
                type: 'object',
                nullable: true,
                properties: {
                  genderId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' }
                }
              }
            }
          }
        ],
        nullable: true
      },
      contact: { $ref: '#/components/schemas/PersonContact', nullable: true },
      tokens: {
        type: 'object',
        description: 'Tokens RS256 para la sesión recién creada.',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'integer', example: 900 }
        }
      }
    }
  },

  ResetCredentialsRequestBody: {
    type: 'object',
    required: ['email', 'type'],
    properties: {
      email: { type: 'string', format: 'email', example: 'juan@example.com' },
      type: { type: 'string', enum: ['password', 'mfa'], example: 'password' }
    }
  },

  ResetCredentialsConfirmBody: {
    type: 'object',
    required: ['token', 'type'],
    properties: {
      token: { type: 'string', example: 'abc123def456...' },
      type: { type: 'string', enum: ['password', 'mfa'], example: 'password' },
      newPassword: {
        type: 'string',
        format: 'password',
        nullable: true,
        description: 'Requerido solo cuando `type = password`.',
        example: 'NuevoPass123!'
      }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── POST /auth/register ──────────────────────────────────────
  '/client/api/v1/auth/register': {
    post: {
      tags: ['Auth - Register'],
      summary: 'Registrar nuevo usuario',
      description: `Crea un nuevo usuario en BD. Retorna tokens RS256 de sesión listos para usar.

**Prerequisitos:**
1. El email debe estar verificado previamente (ver \`/verification/send-verification\`).
2. El usuario debe aceptar la política de privacidad vigente (\`acceptedPrivacyPolicy: true\`). Este documento único cubre Política de Privacidad, Términos y Condiciones y Tratamiento de Datos.
3. _(Opcional)_ El usuario puede aceptar comunicaciones comerciales en el mismo paso (\`comunicacionesComerciales: true\`). Si no se envía, no se registra ningún consentimiento comercial y no se enviarán comunicaciones de marketing.

El usuario teclea sus propios datos (\`birthDate\` es un campo normal requerido).

${UNMASKED_ROUTE_DESC}
Por eso \`person\`, \`contact\` y demás datos personales de esta respuesta salen **completos**, aunque los schemas
compartidos (\`Person\`, \`PersonContact\`) documenten el valor enmascarado que sí aplica al resto de la API.`,
      security: [],
      parameters: [
        {
          name: 'x-client-type',
          in: 'header',
          required: true,
          description: 'Canal de origen. `web` envía tokens en cookies httpOnly; `mobile` los devuelve en el body.',
          schema: { type: 'string', enum: ['web', 'mobile'] }
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RegisterRequest' }
          }
        }
      },
      responses: {
        201: commonResponses.created({ $ref: '#/components/schemas/RegisterResponse' }, 'Usuario registrado exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Forbidden,
        ...commonResponses.Conflict,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /auth/reset-credentials/request ────────────────────
  '/client/api/v1/auth/reset-credentials/request': {
    post: {
      tags: ['Auth - Register'],
      summary: 'Solicitar reset de credenciales',
      description: `Envía email con link para resetear password o desactivar MFA. **Respuesta siempre exitosa** — no revela si el email existe.

**Rate limit:** máximo 3 solicitudes por hora por IP.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ResetCredentialsRequestBody' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { type: 'object', nullable: true },
          'Solicitud procesada. Si el email existe, recibirás un correo.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /auth/reset-credentials/confirm ────────────────────
  '/client/api/v1/auth/reset-credentials/confirm': {
    post: {
      tags: ['Auth - Register'],
      summary: 'Confirmar reset de credenciales',
      description: `Aplica el reset usando el token recibido por email.

- \`type = password\`: actualiza la contraseña en BD. **Invalida automáticamente todas las sesiones activas** del usuario.
- \`type = mfa\`: desactiva el TOTP en BD.

El token tiene una validez de tiempo limitado y solo puede usarse una vez.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ResetCredentialsConfirmBody' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ type: 'object', nullable: true }, 'Credenciales reseteadas exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export = { paths, schemas };
