import commonResponses from '../../../config/swagger/responses/common.responses';
import piiMaskingDocModule from '../../../config/swagger/schemas/pii-masking.doc';
const { MASKED_EMAIL_DESC, MASKED_PHONE_DESC } = piiMaskingDocModule;

/**
 * ============================================================
 * PROFILE PATHS
 * ============================================================
 * Módulo: /client/api/v1/kyc/person/profile
 * Todos los endpoints requieren autenticación (bearerAuth + idTokenAuth)
 *
 * Rutas:
 *   GET    /client/api/v1/kyc/person/profile
 *   GET    /client/api/v1/kyc/person/profile/extended
 *   GET    /client/api/v1/kyc/person/profile/location
 *   GET    /client/api/v1/kyc/person/profile/contact
 *   PUT    /client/api/v1/kyc/person/profile
 *   PUT    /client/api/v1/kyc/person/profile/email
 *   PUT    /client/api/v1/kyc/person/profile/phone
 *   PUT    /client/api/v1/kyc/person/profile/password
 *   PUT    /client/api/v1/kyc/person/profile/names
 *   DELETE /client/api/v1/kyc/person/profile/delete-account
 */

// ─── Schemas propios del módulo ───────────────────────────────

const schemas = {
  UpdateProfileRequest: {
    type: 'object',
    description: 'Debe incluir al menos un campo.',
    properties: {
      username: {
        type: 'string',
        minLength: 3,
        maxLength: 30,
        example: 'juan_perez',
        description: 'Solo letras, números y guiones bajos.'
      },
      avatarId: { type: 'string', format: 'uuid', nullable: true },
      genderId: { type: 'string', format: 'uuid', nullable: true },
      birthDate: {
        type: 'string',
        format: 'date',
        example: '1990-05-15',
        description: 'Fecha de nacimiento (YYYY-MM-DD).'
      },
      location: {
        type: 'object',
        description: 'Ubicación de residencia. Si se envía, `departmentId`, `cityId` y `address` son obligatorios.',
        properties: {
          departmentId: { type: 'string', format: 'uuid' },
          cityId: { type: 'string', format: 'uuid' },
          address: { type: 'string', example: 'Calle 123 # 45-67' },
          postalCode: { type: 'string', nullable: true, example: '110111' },
          type: { type: 'string', nullable: true, example: 'Casa', maxLength: 40 }
        }
      }
    }
  },

  UpdateEmailRequest: {
    type: 'object',
    required: ['email', 'currentPassword'],
    description: '⚠️ El nuevo email debe estar verificado previamente con `/verification/send-verification`.',
    properties: {
      email: { type: 'string', format: 'email', example: 'nuevo@example.com' },
      currentPassword: { type: 'string', format: 'password' }
    }
  },

  UpdateEmailResponse: {
    type: 'object',
    properties: {
      newEmail: { type: 'string', example: '****o@example.com', description: MASKED_EMAIL_DESC },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  UpdatePhoneRequest: {
    type: 'object',
    required: ['newPhone', 'phonePrefixId', 'phoneType'],
    properties: {
      newPhone: { type: 'string', example: '3001234567', description: '7–15 dígitos.' },
      phonePrefixId: {
        type: 'string',
        format: 'uuid',
        description: 'UUID del prefijo telefónico (ej: +57 Colombia).'
      },
      phoneType: { type: 'string', enum: ['primary', 'secondary'] }
    }
  },

  UpdatePhoneResponse: {
    type: 'object',
    properties: {
      phoneType: { type: 'string', enum: ['primary', 'secondary'] },
      phone: { type: 'string', example: '******4567', description: MASKED_PHONE_DESC },
      phonePrefixId: { type: 'string', format: 'uuid' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  UpdatePasswordRequest: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    properties: {
      currentPassword: { type: 'string', format: 'password' },
      newPassword: {
        type: 'string',
        format: 'password',
        description: 'Mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número.'
      }
    }
  },

  UpdateNamesRequest: {
    type: 'object',
    required: ['firstName', 'lastName'],
    description: 'Actualiza los nombres del cliente.',
    properties: {
      firstName: { type: 'string', minLength: 2, maxLength: 50, example: 'Juan', description: 'Primer nombre.' },
      middleName: {
        type: 'string',
        nullable: true,
        minLength: 2,
        maxLength: 50,
        example: 'Carlos',
        description: 'Segundo nombre (opcional). Enviar cadena vacía o null lo limpia.'
      },
      lastName: { type: 'string', minLength: 2, maxLength: 50, example: 'Pérez', description: 'Primer apellido.' },
      secondLastName: {
        type: 'string',
        nullable: true,
        minLength: 2,
        maxLength: 50,
        example: 'Gómez',
        description: 'Segundo apellido (opcional). Enviar cadena vacía o null lo limpia.'
      }
    }
  },

  UpdateNamesResponse: {
    type: 'object',
    properties: {
      personId: { type: 'string', format: 'uuid' },
      firstName: { type: 'string' },
      middleName: { type: 'string', nullable: true },
      lastName: { type: 'string' },
      secondLastName: { type: 'string', nullable: true },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },

  DeleteAccountRequest: {
    type: 'object',
    required: ['currentPassword'],
    properties: {
      currentPassword: { type: 'string', format: 'password' }
    }
  }
};

// ─── Paths ────────────────────────────────────────────────────

const paths = {
  // ── GET /client/api/v1/kyc/person/profile ────────────────────
  '/client/api/v1/kyc/person/profile': {
    get: {
      tags: ['Profile'],
      summary: 'Obtener perfil básico',
      operationId: 'getProfile',
      description:
        'Devuelve los datos esenciales del usuario: info de usuario, persona, contacto, ubicación, cuenta ' +
        'y los consentimientos vigentes (aceptados) del usuario.\n\n' +
        '**Datos PII enmascarados (RF-USR-01 CA-6):** documento, correo y teléfonos salen enmascarados; el valor ' +
        'completo nunca sale por la API.',
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/BasicProfile' }, 'Perfil básico obtenido.'),
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    },
    put: {
      tags: ['Profile'],
      summary: 'Actualizar perfil',
      operationId: 'updateProfile',
      description:
        'Actualiza uno o más campos del perfil: username, avatar, género, ubicación y/o fecha de nacimiento. ' +
        'Debe enviarse al menos un campo. `birthDate` es editable normalmente.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateProfileRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok(
          { $ref: '#/components/schemas/ExtendedProfile' },
          'Perfil actualizado. Devuelve el perfil extendido actualizado.'
        ),
        ...commonResponses.BadRequest,
        ...commonResponses.ValidationError,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/kyc/person/profile/extended ───────────
  '/client/api/v1/kyc/person/profile/extended': {
    get: {
      tags: ['Profile'],
      summary: 'Obtener perfil extendido',
      operationId: 'getExtendedProfile',
      description:
        'Devuelve el perfil completo del usuario junto con los consentimientos vigentes (aceptados).\n\n' +
        '**Datos PII enmascarados (RF-USR-01 CA-6):** documento, correo y teléfonos salen enmascarados.',
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/ExtendedProfile' }, 'Perfil extendido obtenido.'),
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/kyc/person/profile/location ───────────
  '/client/api/v1/kyc/person/profile/location': {
    get: {
      tags: ['Profile'],
      summary: 'Obtener ubicación del usuario',
      operationId: 'getLocation',
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/PersonLocation' }, 'Ubicación obtenida.'),
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── GET /client/api/v1/kyc/person/profile/contact ────────────
  '/client/api/v1/kyc/person/profile/contact': {
    get: {
      tags: ['Profile'],
      summary: 'Obtener información de contacto',
      operationId: 'getContactInfo',
      description: `Devuelve email, teléfonos con prefijos y fecha de verificación del email. ${MASKED_EMAIL_DESC}`,
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/PersonContact' }, 'Información de contacto obtenida.'),
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /client/api/v1/kyc/person/profile/email ──────────────
  '/client/api/v1/kyc/person/profile/email': {
    put: {
      tags: ['Profile'],
      summary: 'Actualizar email',
      operationId: 'updateEmail',
      description:
        '⚠️ El nuevo email debe estar verificado previamente con `/verification/send-verification`. Requiere contraseña actual como confirmación.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateEmailRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/UpdateEmailResponse' }, 'Email actualizado exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /client/api/v1/kyc/person/profile/phone ──────────────
  '/client/api/v1/kyc/person/profile/phone': {
    put: {
      tags: ['Profile'],
      summary: 'Actualizar teléfono',
      operationId: 'updatePhone',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdatePhoneRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/UpdatePhoneResponse' }, 'Teléfono actualizado exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /client/api/v1/kyc/person/profile/password ───────────
  '/client/api/v1/kyc/person/profile/password': {
    put: {
      tags: ['Profile'],
      summary: 'Cambiar contraseña',
      operationId: 'updatePassword',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdatePasswordRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ type: 'object', nullable: true }, 'Contraseña actualizada exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── PUT /client/api/v1/kyc/person/profile/names ──────────────
  '/client/api/v1/kyc/person/profile/names': {
    put: {
      tags: ['Profile'],
      summary: 'Actualizar nombres',
      operationId: 'updateNames',
      description: 'Actualiza los nombres del cliente: primer nombre, segundo nombre, primer apellido y segundo apellido.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateNamesRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ $ref: '#/components/schemas/UpdateNamesResponse' }, 'Nombres actualizados exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Forbidden,
        ...commonResponses.NotFound,
        ...commonResponses.Unauthorized,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  },

  // ── DELETE /client/api/v1/kyc/person/profile/delete-account ──
  '/client/api/v1/kyc/person/profile/delete-account': {
    delete: {
      tags: ['Profile'],
      summary: 'Eliminar cuenta',
      operationId: 'deleteAccount',
      description:
        '⚠️ **Acción irreversible.** Anonimiza y desactiva la cuenta del usuario en BD (soft-delete); ' +
        'revoca los consentimientos vigentes. Se envía una notificación de confirmación al email registrado. ' +
        'Requiere contraseña actual.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeleteAccountRequest' }
          }
        }
      },
      responses: {
        200: commonResponses.ok({ type: 'object', nullable: true }, 'Cuenta eliminada exitosamente.'),
        ...commonResponses.BadRequest,
        ...commonResponses.Unauthorized,
        ...commonResponses.Conflict,
        ...commonResponses.ValidationError,
        ...commonResponses.InternalServerError
      }
    }
  }
};

export default { paths, schemas };
