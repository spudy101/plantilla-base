import commonResponses from '../../../responses/common.responses';

/**
 * ============================================================
 * SEND VERIFICATION PATHS — SHARED ENDPOINTS
 * ============================================================
 * Disponible en: servidor client y servidor admin
 * Endpoints públicos — sin bearerAuth
 *
 * Rutas:
 *   POST /client/api/v1/notification/send-verification
 *   POST /client/api/v1/notification/verify-code
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  SendVerificationRequest: {
    type: 'object',
    required: ['type', 'contact'],
    properties: {
      type: {
        type: 'string',
        enum: ['email', 'phone'],
        example: 'email',
        description: 'Canal al que se enviará el código OTP.'
      },
      contact: {
        type: 'string',
        example: 'juan@example.com',
        description: 'Email o número de teléfono (7–15 dígitos) según el tipo.'
      },
      phonePrefixId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Requerido únicamente cuando `type = phone`.'
      }
    }
  },

  SendVerificationResponse: {
    type: 'object',
    properties: {
      verificationCodeId: {
        type: 'string',
        format: 'uuid',
        description: 'ID del código generado. Guárdalo para rastrear la verificación.'
      },
      expiresAt: {
        type: 'string',
        format: 'date-time',
        description: 'Fecha y hora de expiración del código (15 minutos desde la emisión).'
      }
    }
  },

  VerifyCodeRequest: {
    type: 'object',
    required: ['type', 'contact', 'code'],
    properties: {
      type: {
        type: 'string',
        enum: ['email', 'phone'],
        example: 'email'
      },
      contact: {
        type: 'string',
        example: 'juan@example.com',
        description: 'Debe coincidir exactamente con el usado en send-verification.'
      },
      code: {
        type: 'string',
        minLength: 4,
        maxLength: 8,
        example: '123456',
        description: 'Código OTP recibido por email o SMS.'
      }
    }
  },

  VerifyCodeResponse: {
    type: 'object',
    properties: {
      verified: {
        type: 'boolean',
        example: true,
        description: 'Siempre `true` cuando la verificación es exitosa.'
      }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── POST /client/api/v1/notification/send-verification ──────
  '/client/api/v1/notification/send-verification': {
    post: {
      tags: ['Verification'],
      summary: 'Enviar código OTP',
      description: `Genera y envía un código OTP de 6 dígitos al email o teléfono indicado.

**Reglas importantes:**
- Debes esperar **60 segundos** entre solicitudes para el mismo contacto.
- El código expira a los **15 minutos**.
- Máximo **5 intentos** de verificación antes de que el código se invalide.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SendVerificationRequest' },
            examples: {
              porEmail: {
                summary: 'Envío por email',
                value: { type: 'email', contact: 'juan@example.com' }
              },
              porTelefono: {
                summary: 'Envío por teléfono',
                value: {
                  type: 'phone',
                  contact: '3001234567',
                  phonePrefixId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SendVerificationResponse' },
          'Código de verificación enviado exitosamente.'
        ),
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded, // antes TooManyRequests (no existe → el 429 no se documentaba)
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/notification/verify-code ────────────
  '/client/api/v1/notification/verify-code': {
    post: {
      tags: ['Verification'],
      summary: 'Verificar código OTP',
      description: `Valida el código OTP ingresado por el usuario.

**Flujo esperado:**
1. Llama a \`/send-verification\` para generar y enviar el código.
2. El usuario ingresa el código recibido.
3. Llama a este endpoint para verificarlo.
4. Si es correcto, el código queda marcado como **verificado** y no puede reutilizarse.

**Errores posibles:**
- \`400\` — Código inválido (devuelve los intentos restantes).
- \`403\` — Se agotaron los 5 intentos. Debes solicitar un nuevo código.
- \`404\` — Código no encontrado, ya usado, o expirado.`,
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/VerifyCodeRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/VerifyCodeResponse' }, 'Código verificado exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.RateLimitExceeded, // antes TooManyRequests (no existe → el 429 no se documentaba)
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
