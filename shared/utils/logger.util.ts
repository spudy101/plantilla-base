// === RF-OPS-01: Pipeline DevSecOps, Infraestructura Base ===
// src/utils/logger.util.ts
import { interopDefault } from './interop.util';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import constantsModule from '../constants';
const { logging, server } = constantsModule;
import errorMessageModule from './error-message.util';
import type defineAuditLog from '../../modules/schemas/records/audit/models/audit-log.model';

// Se usa como errorMessageModule.errorMessage(…): logAudit recibe una opción llamada errorMessage.


// ==============================================
// SANITIZE
// ==============================================

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 10;
const MAX_DEPTH = 3;

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'sessionId',
  'nationalId',
  'national_id',
  'email',
  'phone',
  'rut'
];

const _sanitizeValue = (key: string, value: unknown, depth: number): unknown => {
  const isSensitive = SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()));
  if (isSensitive) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]` : value;
  }
  if (['number', 'boolean'].includes(typeof value) || value === null) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // eslint-disable-next-line no-use-before-define
  if (Array.isArray(value) || typeof value === 'object') {
    // eslint-disable-next-line no-use-before-define
    return sanitizeForLog(value, depth + 1);
  }
  return String(value);
};

// [RF-OPS-01] | CA-03 | Redacta campos sensibles (PII) antes
// de loguear — stack trace nunca expone passwords, tokens ni
// documentos de identidad.
const sanitizeForLog = (body: unknown, depth = 0): unknown => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  if (depth > MAX_DEPTH) {
    return '[max depth reached]';
  }

  if (Array.isArray(body)) {
    const items: unknown[] = body.slice(0, MAX_ARRAY_LENGTH).map(item => sanitizeForLog(item, depth + 1));
    return body.length > MAX_ARRAY_LENGTH ? [...items, `...[${body.length - MAX_ARRAY_LENGTH} more items]`] : items;
  }

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    safe[key] = _sanitizeValue(key, value, depth);
  }
  return safe;
};

// ==============================================
// FORMATS
// ==============================================

// [RF-OPS-01] | CA-03 | Inyecta Correlation ID desde
// AsyncLocalStorage en cada log operacional.
// Inyecta correlationId en cada entrada de log operacional desde AsyncLocalStorage.
// Permite rastrear cualquier logger.info/warn/error hasta el request o ciclo de
// worker que lo originó. Usa get() (no getSafe()): si NO hay contexto activo
// (loggers huérfanos de arranque, eventos de Redis, bootstrap) NO se estampa
// correlationId — esos logs no pertenecen a ningún flujo.
const correlationFormat = winston.format(info => {
  const { get } = interopDefault(require('./request-context.util') as typeof import('./request-context.util'));
  const ctx = get();
  if (ctx?.correlationId && !info.correlationId) {
    info.correlationId = ctx.correlationId;
  }
  return info;
})();

// [RF-OPS-01] | CA-03 | Logger operacional con timestamp UTC
// explícito, correlation ID y sanitización de PII en logs.
const jsonFormat = winston.format.combine(
  correlationFormat,
  winston.format.timestamp({ format: () => new Date().toISOString() }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// ==============================================
// TRANSPORTS — logger operacional
// En Fargate/ECS los logs van a CloudWatch via awslogs driver.
// DailyRotateFile solo se activa en local para debugging.
// ==============================================

const isLocal = server.nodeEnv === 'development' && server.localhost === 'true';

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: logging.level || 'info'
  }),
  ...(isLocal
    ? [
        new DailyRotateFile({
          filename: path.join('/tmp/logs', 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          format: jsonFormat,
          maxSize: '20m',
          maxFiles: '14d',
          zippedArchive: true
        }),
        new DailyRotateFile({
          filename: path.join('/tmp/logs', 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          format: jsonFormat,
          maxSize: '20m',
          maxFiles: '14d',
          zippedArchive: true
        })
      ]
    : [])
];

// ==============================================
// LOGGER OPERACIONAL
// ==============================================

const logger = winston.createLogger({
  level: logging.level || 'info',
  format: jsonFormat,
  transports,
  exitOnError: false
});

// ==============================================
// AUDIT LOGGER — transport separado e independiente
// ==============================================

const auditLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
  transports: [
    new winston.transports.Console({
      format: jsonFormat,
      level: 'info'
    }),
    ...(isLocal
      ? [
          new DailyRotateFile({
            filename: path.join('/tmp/logs', 'audit-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            format: jsonFormat,
            maxSize: '20m',
            maxFiles: '90d',
            zippedArchive: true
          })
        ]
      : [])
  ],
  exitOnError: false
});

// ==============================================
// AUDIT LOG — guardado en BD
// ==============================================

const UUID_REGEX = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
/** Opciones de logAudit (todas opcionales). */
interface LogAuditOptions {
  outcome?: 'success' | 'failure' | string;
  httpStatus?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  /** Contexto explícito; si no viene se toma el de la petición en curso (request-context). */
  context?: Record<string, unknown> | null;
  entityId?: string | null;
  entityType?: string | null;
  entityTable?: string | null;
}

/** Entrada de auditoría tal como se escribe en CloudWatch, BD y S3. */
interface AuditEntry {
  action: string;
  description: string;
  category: string;
  risk: string;
  outcome: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  userId: string | null | undefined;
  entityId: string | null;
  entityType: string | null;
  entityTable: string | null;
  module: string | null;
  timestamp: string;
  details: Record<string, unknown>;
  /** + campos del contexto de la petición (correlationId, ip, userAgent, sessionId…) */
  [contextField: string]: unknown;
}

type AuditRisk = defineAuditLog.Attributes['risk'];
type AuditOutcome = defineAuditLog.Attributes['outcome'];

// Los campos del contexto de la petición llegan como unknown: a la BD solo van si son string
const _str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

// 'system' u otros ids no-UUID no van a la FK users.user_id
const _toDbUserId = (userId: string | null | undefined): string | null =>
  userId && UUID_REGEX.test(userId) ? userId : null;

const _saveToDatabase = async (entry: AuditEntry): Promise<void> => {
  try {
    // Importación lazy: el repositorio (y los modelos) dependen del logger
    const auditLogRepository = interopDefault(
      require('../../modules/schemas/records/audit/repositories/audit-log.repository') as typeof import('../../modules/schemas/records/audit/repositories/audit-log.repository')
    );
    await auditLogRepository.create({
      action: entry.action,
      description: entry.description,
      category: entry.category,
      // risk/outcome vienen del catálogo AUDIT_ACTIONS (tipado como string); la columna es un ENUM
      risk: (entry.risk ?? 'unknown') as AuditRisk,
      outcome: (entry.outcome ?? 'success') as AuditOutcome,
      http_status: entry.httpStatus ?? null,
      error_code: entry.errorCode ?? null,
      error_message: entry.errorMessage ?? null,
      user_id: _toDbUserId(entry.userId),
      session_id: _str(entry.sessionId),
      correlation_id: _str(entry.correlationId),
      ip: _str(entry.ip),
      user_agent: _str(entry.userAgent),
      fingerprint: _str(entry.fingerprintHash),
      method: _str(entry.method),
      path: _str(entry.path),
      details: entry.details,
      entity_id: entry.entityId ?? null,
      entity_type: entry.entityType ?? null,
      entity_table: entry.entityTable ?? null,
      module: entry.module ?? null,
      source: _str(entry.source) ?? 'http'
    });
  } catch (err) {
    logger.warn('logAudit — error guardando en BD', {
      error: errorMessageModule.errorMessage(err),
      action: entry.action,
      userId: entry.userId
    });
  }
};

// ==============================================
// AUDIT LOG — guardado en S3
// ==============================================

const _saveToS3 = async (entry: AuditEntry): Promise<void> => {
  try {
    // Importación lazy para evitar inicializar S3 si no está configurado
    const S3Util = interopDefault(require('./s3.util') as typeof import('./s3.util'));
    const date = new Date().toISOString().split('T')[0];
    const category = (entry.category ?? 'general').toLowerCase().replaceAll(/\s+/g, '-');
    const fileName = `${entry.action}-${entry.correlationId ?? Date.now()}.json`;
    const s3Key = `audit-logs/${date}/${category}/${fileName}`;

    await S3Util.s3Client.send(
      new PutObjectCommand({
        Bucket: S3Util.bucketName,
        Key: s3Key,
        Body: Buffer.from(JSON.stringify(entry, null, 2)),
        ContentType: 'application/json',
        StorageClass: 'STANDARD_IA'
      })
    );
  } catch (err) {
    logger.warn('logAudit — error guardando en S3', {
      error: errorMessageModule.errorMessage(err),
      action: entry.action,
      userId: entry.userId
    });
  }
};

// ==============================================
// AUDIT ALERT — creación de alerta para Superadmin
// ==============================================

const _createAlert = async (entry: AuditEntry): Promise<void> => {
  try {
    const auditAlertRepository = interopDefault(require('../../modules/schemas/records/audit/repositories/audit-alert.repository') as typeof import('../../modules/schemas/records/audit/repositories/audit-alert.repository'));
    await auditAlertRepository.create({
      audit_log_id: null,
      action: entry.action,
      category: entry.category ?? null,
      risk: (entry.risk ?? 'high') as AuditRisk,
      user_id: _toDbUserId(entry.userId),
      entity_id: entry.entityId ?? null,
      entity_type: entry.entityType ?? null,
      message: entry.description ?? entry.action
    });
  } catch (err) {
    logger.warn('logAudit — error creando audit alert', {
      error: errorMessageModule.errorMessage(err),
      action: entry.action
    });
  }
};

// ==============================================
// LOG AUDIT — función principal
// ==============================================

/**
 * Registra una acción de auditoría en 3 destinos:
 *   1. Archivo local  (audit-YYYY-MM-DD.log)
 *   2. Base de datos  (tabla audit_logs)
 *   3. S3             (audit-logs/{fecha}/{categoria}/{accion}-{correlationId}.json)
 *
 * El contexto HTTP (ip, correlationId, fingerprint, etc.) se obtiene
 * automáticamente desde AsyncLocalStorage — no es necesario pasarlo
 * en cada llamada desde los services.
 *
 * @param {string} action      - Clave de AUDIT_ACTIONS — ej: 'PROFILE_REFERENCE_CREATED'
 * @param {string|null} userId - ID del usuario que ejecuta la acción (null en rutas públicas)
 * @param {Object} [details]   - Datos adicionales específicos de la acción
 * @param {Object} [opts]      - Opciones de resultado
 * @param {string} [opts.outcome='success']  - 'success' | 'failure' | 'warning' | 'attempt'
 * @param {number} [opts.httpStatus]         - Código HTTP de la respuesta (ej: 422, 500)
 * @param {string} [opts.errorCode]          - Código de error (ej: 'VALIDATION_ERROR')
 * @param {string} [opts.errorMessage]       - Mensaje de error legible
 * @param {Object} [opts.context]            - Contexto manual (para tests o casos especiales)
 *
 * @example  Éxito (comportamiento por defecto — compatible con código existente)
 *   logAudit('PROFILE_REFERENCE_CREATED', userId, { personId });
 *
 * @example  Falla de negocio
 *   logAudit('PROFILE_REFERENCE_CREATED', userId, { personId }, {
 *     outcome:      'failure',
 *     httpStatus:   409,
 *     errorCode:    'CONFLICT',
 *     errorMessage: 'Ya existe una referencia con ese contacto',
 *   });
 *
 * @example  Error del sistema desde el error middleware
 *   logAudit('SYSTEM_ERROR', userId, { path, method }, {
 *     outcome:      'failure',
 *     httpStatus:   500,
 *     errorCode:    'INTERNAL_ERROR',
 *     errorMessage: err.message,
 *   });
 */
// [RF-OPS-01] | CA-03 | Log de auditoría con timestamp UTC
// via toISOString(). Retención mínima 5 años (Circular
// ADC-2007 SFC) vía CloudWatch (1827 días) y S3.
// [RF-AUTH-01] | CA-06, CA-07 | Escribe en BD + S3.
// Cubre: LOGIN_FAILED, ACCOUNT_BLOCKED, MFA_FAILED,
// IP, user_agent, fingerprint, correlation_id.
const logAudit = (
  action: string,
  userId: string | null | undefined,
  details: Record<string, unknown> = {},
  opts: LogAuditOptions = {}
): void => {
  const {
    outcome = 'success',
    httpStatus = null,
    errorCode = null,
    errorMessage = null,
    context = null,
    entityId = null,
    entityType = null,
    entityTable = null
  } = opts;

  const { getSafe } = interopDefault(require('./request-context.util') as typeof import('./request-context.util'));
  const auditContext = context ?? getSafe();

  const { AUDIT_ACTIONS } = interopDefault(require('../constants/auditActions/index') as typeof import('../constants/auditActions/index'));
  type ActionMeta = { description: string; category: string; module?: string | null; risk: string };
  const actionMeta: ActionMeta = (AUDIT_ACTIONS as Record<string, ActionMeta | undefined>)[action] ?? {
    description: action,
    category: 'Sin categoría',
    module: null,
    risk: 'unknown'
  };

  const auditEntry: AuditEntry = {
    action,
    description: actionMeta.description,
    category: actionMeta.category,
    risk: actionMeta.risk,
    outcome,
    httpStatus,
    errorCode,
    errorMessage,
    userId,
    entityId,
    entityType,
    entityTable,
    module: actionMeta.module ?? null,
    timestamp: new Date().toISOString(),
    details,
    ...auditContext
  };

  auditLogger.info('AUDIT', auditEntry);

  setImmediate(() => {
    const saves = [_saveToDatabase(auditEntry), _saveToS3(auditEntry)];

    const { AUDIT_ALERT_TRIGGER_ACTIONS } = interopDefault(require('../constants/auditActions/audit-alert-triggers') as typeof import('../constants/auditActions/audit-alert-triggers'));
    if (AUDIT_ALERT_TRIGGER_ACTIONS.has(action)) {
      saves.push(_createAlert(auditEntry));
    }

    Promise.allSettled(saves);
  });
};

// ==============================================
// HTTP LOGGER MIDDLEWARE
// ==============================================

// Nivel de log para una respuesta HTTP según su status code:
//   400/404/422 → info  (el usuario lo resuelve solo: corrige input, recurso ausente)
//   resto ≥ 400 → warn  (5xx + 401/403/409/429: admin/seguridad/infra resuelve la causa raíz)
//   < 400       → info  (respuesta esperada)
const USER_RESOLVABLE_HTTP_STATUSES = new Set([400, 404, 422]);
const _resolveHttpLogLevel = (status: number) => {
  if (USER_RESOLVABLE_HTTP_STATUSES.has(status)) {
    return 'info';
  }
  return status >= 400 ? 'warn' : 'info';
};

const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const logData = {
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.userId
    };

    logger[_resolveHttpLogLevel(res.statusCode)]('HTTP Request', logData);
  });

  next();
};

// ==============================================
// EXPORTS
// ==============================================

export default {
  logger,
  logAudit,
  httpLogger,
  sanitizeForLog,
  SENSITIVE_FIELDS
};
