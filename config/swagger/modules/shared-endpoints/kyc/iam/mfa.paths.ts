import commonResponses = require('../../../../responses/common.responses');

/**
 * ============================================================
 * MFA PATHS
 * ============================================================
 * Módulo: /client/api/v1/kyc/iam/mfa
 * Todos los endpoints requieren autenticación (bearerAuth + idTokenAuth)
 *
 * Rutas:
 *   POST /client/api/v1/kyc/iam/mfa/setup-totp
 *   POST /client/api/v1/kyc/iam/mfa/activate-totp
 *   POST /client/api/v1/kyc/iam/mfa/verify-totp
 *   POST /client/api/v1/kyc/iam/mfa/validate-password
 *   POST /client/api/v1/kyc/iam/mfa/deactivate-totp
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  TOTPSetupResponse: {
    type: 'object',
    properties: {
      otpauthUrl: {
        type: 'string',
        example: 'otpauth://totp/Base Project:juan?secret=BASE32SECRET&issuer=Base Project',
        description: 'URI estándar `otpauth://` para generar el QR. Pásalo directamente a una librería de QR (ej: `qrcode`).'
      },
      secretCode: {
        type: 'string',
        example: 'JBSWY3DPEHPK3PXP',
        description: 'Secret en Base32 — para entrada manual si el usuario no puede escanear el QR.'
      },
      username: { type: 'string' },
      instructions: {
        type: 'string',
        example: 'Escanea el código QR con tu aplicación de autenticación y verifica el código generado para activar TOTP.'
      }
    }
  },

  TOTPCodeRequest: {
    type: 'object',
    required: ['totpCode'],
    properties: {
      totpCode: { type: 'string', minLength: 6, maxLength: 6, example: '123456' }
    }
  },

  TOTPActivationResponse: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      totpEnabled: { type: 'boolean', example: true }
    }
  },

  TOTPVerificationResponse: {
    type: 'object',
    properties: {
      valid: { type: 'boolean', example: true },
      username: { type: 'string' }
    }
  },

  PasswordValidationRequest: {
    type: 'object',
    required: ['password'],
    properties: {
      password: { type: 'string', format: 'password' }
    }
  },

  PasswordValidationResponse: {
    type: 'object',
    properties: {
      valid: { type: 'boolean', example: true },
      username: { type: 'string' }
    }
  },

  DeactivateTOTPRequest: {
    type: 'object',
    required: ['password'],
    properties: {
      password: {
        type: 'string',
        format: 'password',
        description: 'Contraseña actual como confirmación.'
      }
    }
  },

  MFAStatusResponse: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      totpEnabled: { type: 'boolean', example: true },
      smsMfaEnabled: { type: 'boolean', example: false },
      preferredMfaMethod: { type: 'string', enum: ['totp', 'sms', 'none'], example: 'totp' }
    }
  },

  SMSActivationRequestResponse: {
    type: 'object',
    properties: {
      verificationCodeId: { type: 'string', format: 'uuid' },
      expiresAt: { type: 'string', format: 'date-time' },
      truncatedCode: {
        type: 'string',
        example: '****56',
        description: 'Últimos 2 dígitos del código OTP enmascarados. Solo para desarrollo/debug.'
      }
    }
  },

  SMSConfirmRequest: {
    type: 'object',
    required: ['code'],
    properties: {
      code: {
        type: 'string',
        minLength: 6,
        maxLength: 6,
        example: '123456',
        description: 'Código OTP de 6 dígitos recibido por SMS.'
      }
    }
  },

  SMSMFAActivationResponse: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      smsMfaEnabled: { type: 'boolean', example: true }
    }
  },

  DeactivateSMSRequest: {
    type: 'object',
    required: ['password'],
    properties: {
      password: {
        type: 'string',
        format: 'password',
        description: 'Contraseña actual como confirmación.'
      }
    }
  },

  PreferredMethodRequest: {
    type: 'object',
    required: ['preferredMethod'],
    properties: {
      preferredMethod: {
        type: 'string',
        enum: ['totp', 'sms'],
        example: 'totp',
        description: 'Método MFA preferido. El método debe estar previamente activado.'
      }
    }
  },

  PreferredMethodResponse: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      username: { type: 'string' },
      preferredMfaMethod: { type: 'string', enum: ['totp', 'sms', 'none'], example: 'sms' }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── POST /client/api/v1/kyc/iam/mfa/setup-totp ───────────────
  '/client/api/v1/kyc/iam/mfa/setup-totp': {
    post: {
      tags: ['MFA'],
      summary: 'Iniciar configuración TOTP',
      operationId: 'setupTOTP',
      description: `Genera el secret TOTP y devuelve la URI \`otpauth://\` para crear el QR.

**Flujo completo de activación:**
1. \`POST /mfa/setup-totp\` → recibe \`otpauthUrl\` y \`secretCode\`
2. El usuario escanea el QR con Google Authenticator, Authy, etc.
3. \`POST /mfa/activate-totp\` → envía el código generado para confirmar.`,
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/TOTPSetupResponse' },
          'Configuración TOTP iniciada. Escanea el QR para continuar.'
        ),
        ...commonResponses.Conflict,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/activate-totp ────────────
  '/client/api/v1/kyc/iam/mfa/activate-totp': {
    post: {
      tags: ['MFA'],
      summary: 'Activar TOTP',
      operationId: 'activateTOTP',
      description:
        'Verifica el código TOTP generado por la app y activa MFA en la cuenta. Debe llamarse inmediatamente después de `setup-totp`.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TOTPCodeRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TOTPActivationResponse' }, 'TOTP activado exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Conflict,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/verify-totp ──────────────
  '/client/api/v1/kyc/iam/mfa/verify-totp': {
    post: {
      tags: ['MFA'],
      summary: 'Verificar código TOTP (sesión activa)',
      operationId: 'verifyTOTP',
      description:
        'Valida un código TOTP para el usuario autenticado. Útil para confirmar acciones sensibles dentro de la app (distinto del `/auth/verify-mfa` que completa el login).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TOTPCodeRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/TOTPVerificationResponse' }, 'Resultado de la verificación TOTP.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/validate-password ────────
  '/client/api/v1/kyc/iam/mfa/validate-password': {
    post: {
      tags: ['MFA'],
      summary: 'Validar contraseña actual',
      operationId: 'validatePassword',
      description:
        'Verifica que la contraseña ingresada es correcta. Útil como paso previo a acciones críticas que no requieren TOTP completo.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PasswordValidationRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/PasswordValidationResponse' },
          'Resultado de la validación de contraseña.'
        ),
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/deactivate-totp ──────────
  '/client/api/v1/kyc/iam/mfa/deactivate-totp': {
    post: {
      tags: ['MFA'],
      summary: 'Desactivar TOTP',
      operationId: 'deactivateTOTP',
      description:
        '⚠️ Desactiva MFA en la cuenta. Requiere contraseña actual como confirmación. Acción de alto riesgo — reduce la seguridad de la cuenta.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeactivateTOTPRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/TOTPActivationResponse' },
          'TOTP desactivado. `totpEnabled` será `false`.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/kyc/iam/mfa/status ────────────────────
  '/client/api/v1/kyc/iam/mfa/status': {
    get: {
      tags: ['MFA'],
      summary: 'Estado actual del MFA',
      operationId: 'getMFAStatus',
      description: 'Devuelve el estado de todos los métodos MFA del usuario: TOTP activo, SMS activo y método preferido.',
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/MFAStatusResponse' }, 'Estado MFA obtenido.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/sms/request ──────────────
  '/client/api/v1/kyc/iam/mfa/sms/request': {
    post: {
      tags: ['MFA'],
      summary: 'Solicitar activación SMS MFA',
      operationId: 'requestSMSActivation',
      description: `Inicia el flujo de activación de SMS MFA. Genera un código OTP de 6 dígitos y lo envía al teléfono primario registrado en el perfil.

**Flujo completo:**
1. \`POST /mfa/sms/request\` → envía OTP al teléfono registrado
2. \`POST /mfa/sms/confirm\` → confirma con el código recibido

> ⚠️ El usuario debe tener un teléfono primario registrado. Si SMS MFA ya está activo, devuelve 409.
> ⚠️ Se permite 1 solicitud por minuto (rate limit de 60s por número de teléfono).`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['password'],
              properties: {
                password: {
                  type: 'string',
                  format: 'password',
                  description: 'Contraseña actual como confirmación.'
                }
              }
            }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SMSActivationRequestResponse' },
          'Código OTP enviado. Confirma con `POST /mfa/sms/confirm`.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Conflict,
        ...commonResponses.RateLimitExceeded,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/sms/confirm ──────────────
  '/client/api/v1/kyc/iam/mfa/sms/confirm': {
    post: {
      tags: ['MFA'],
      summary: 'Confirmar activación SMS MFA',
      operationId: 'confirmSMSActivation',
      description: `Verifica el código OTP recibido por SMS y activa SMS MFA en la cuenta.

- Máximo **5 intentos** antes de invalidar el código.
- El código expira a los **15 minutos** de ser generado.
- Llama a \`POST /mfa/sms/request\` para obtener un nuevo código si se agotaron los intentos.`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SMSConfirmRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SMSMFAActivationResponse' },
          'SMS MFA activado. `smsMfaEnabled` será `true`.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Conflict,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── POST /client/api/v1/kyc/iam/mfa/deactivate-sms ───────────
  '/client/api/v1/kyc/iam/mfa/deactivate-sms': {
    post: {
      tags: ['MFA'],
      summary: 'Desactivar SMS MFA',
      operationId: 'deactivateSMS',
      description:
        '⚠️ Desactiva SMS MFA. Si el método preferido era `sms`, cambia automáticamente a `totp` (si está activo) o a `none`. Requiere contraseña actual como confirmación.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeactivateSMSRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/SMSMFAActivationResponse' },
          'SMS MFA desactivado. `smsMfaEnabled` será `false`.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /client/api/v1/kyc/iam/mfa/preferred-method ──────────
  '/client/api/v1/kyc/iam/mfa/preferred-method': {
    put: {
      tags: ['MFA'],
      summary: 'Cambiar método MFA preferido',
      operationId: 'updatePreferredMethod',
      description: `Establece el método MFA que se usará por defecto en el login.

- Para seleccionar \`totp\`: TOTP debe estar activo (\`totpEnabled: true\`).
- Para seleccionar \`sms\`: SMS MFA debe estar activo (\`smsMfaEnabled: true\`).
- Ambos métodos pueden estar activos simultáneamente; este endpoint define cuál se usa en el login.`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PreferredMethodRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/PreferredMethodResponse' }, 'Método preferido actualizado.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export = { paths, schemas };
