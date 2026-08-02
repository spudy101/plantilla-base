// src/utils/sanitize-audit-body.js
const { server } = require('../constants');

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 10;
const MAX_DEPTH = 3; // Nueva: Evitar objetos muy anidados

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'sessionId'
  // Añade más según tu app
];

/**
 * Sanitiza objetos para logs/auditoría
 * - Redacta campos sensibles
 * - Trunca strings/arrays largos
 * - Maneja objetos anidados hasta MAX_DEPTH
 */
function sanitizeValue(key, value, depth) {
  if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return sanitizeAuditBody(value, depth + 1);
  }
  return String(value);
}

function sanitizeArray(body, depth) {
  if (body.length <= MAX_ARRAY_LENGTH) {
    return body.map(item => sanitizeAuditBody(item, depth + 1));
  }
  const truncated = body.slice(0, MAX_ARRAY_LENGTH).map(item => sanitizeAuditBody(item, depth + 1));
  return [...truncated, `...[${body.length - MAX_ARRAY_LENGTH} more items]`];
}

function sanitizeAuditBody(body, depth = 0) {
  if (!body || typeof body !== 'object') {
    return body;
  }
  if (depth > MAX_DEPTH) {
    return '[Max depth reached]';
  }
  if (Array.isArray(body)) {
    return sanitizeArray(body, depth);
  }

  const safe = {};
  for (const [key, value] of Object.entries(body)) {
    safe[key] = sanitizeValue(key, value, depth);
  }
  return safe;
}

/**
 * Sanitiza objetos específicamente para logs de error
 * Añade contexto adicional
 */
function sanitizeErrorContext(context) {
  return {
    ...sanitizeAuditBody(context),
    timestamp: new Date().toISOString(),
    environment: server.nodeEnv
  };
}

module.exports = {
  sanitizeAuditBody,
  sanitizeErrorContext,
  SENSITIVE_FIELDS // Por si quieres extenderlo en otro módulo
};
