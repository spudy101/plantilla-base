const ExcelJS = require('exceljs');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const auditLogRepository = require('../../../../schemas/records/audit/repositories/audit-log.repository');
const { AuditLogListDTO, AuditLogDTO } = require('../dtos/admin-audit-log.dto');
const { User, Person } = require('../../../../../shared/models');
const { Op } = require('sequelize');

const EXPORT_LIMIT = 50000;

const CSV_COLUMNS = [
  'audit_log_id',
  'action',
  'description',
  'category',
  'risk',
  'outcome',
  'http_status',
  'error_code',
  'user_id',
  'session_id',
  'entity_id',
  'entity_type',
  'correlation_id',
  'ip',
  'method',
  'path',
  'source',
  'created_at'
];

class AdminAuditLogService {
  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new AdminAuditLogService({ auditLogRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps = {}) {
    this.auditLogRepository = deps.auditLogRepository ?? auditLogRepository;
  }

  async list(query, adminUserId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const where = _buildWhere(query);

    const { rows, count } = await this.auditLogRepository.findPaginatedWithExecutor(
      where,
      {
        limit: paginationParams.limit,
        offset: paginationParams.offset,
        sortBy: PaginationHelper.toSnakeCase(paginationParams.sortBy),
        order: paginationParams.order
      },
      [_includeExecutor()]
    );

    const activeFilters = PaginationHelper.buildFilters(query, [
      'dateFrom',
      'dateTo',
      'action',
      'userId',
      'sessionId',
      'category',
      'module',
      'outcome',
      'risk',
      'ip',
      'correlationId',
      'entityId',
      'entityType',
      'source'
    ]);

    logAudit(
      'AUDIT_LOG_LISTED',
      adminUserId,
      { totalItems: count, filters: Object.keys(activeFilters) },
      { entityType: 'AuditLog', entityTable: 'audit_logs' }
    );

    return {
      data: rows.map(r => AuditLogListDTO(r)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order,
        filters: Object.keys(activeFilters).length > 0 ? activeFilters : undefined
      })
    };
  }

  async getById(auditLogId, adminUserId) {
    const record = await this.auditLogRepository.findByIdFull(auditLogId, [_includeExecutor()]);
    if (!record) {
      throw AppError.notFound('Log de auditoría no encontrado');
    }

    logAudit(
      'AUDIT_LOG_VIEWED',
      adminUserId,
      { auditLogId },
      { entityId: auditLogId, entityType: 'AuditLog', entityTable: 'audit_logs' }
    );

    return AuditLogDTO(record);
  }

  async exportToResponse(res, query, adminUserId, format = 'csv') {
    const where = _buildWhere(query);

    const rows = await this.auditLogRepository.findAllForExport(where, EXPORT_LIMIT);

    const truncated = rows.length === EXPORT_LIMIT;

    logAudit(
      'AUDIT_LOG_EXPORTED',
      adminUserId,
      { format, count: rows.length, truncated },
      { entityType: 'AuditLog', entityTable: 'audit_logs' }
    );

    logger.info('AdminAuditLogService.export', { adminUserId, format, count: rows.length, truncated });

    if (format === 'xlsx') {
      return _streamXlsx(res, rows, truncated);
    }
    return _streamCsv(res, rows, truncated);
  }
}

function _buildWhere(query) {
  const where = {};
  const {
    dateFrom,
    dateTo,
    action,
    userId,
    sessionId,
    category,
    module: moduleFilter,
    outcome,
    risk,
    ip,
    correlationId,
    entityId,
    entityType,
    source
  } = query;

  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) {
      where.created_at[Op.gte] = dateFrom;
    }
    if (dateTo) {
      where.created_at[Op.lte] = dateTo;
    }
  }
  if (action) {
    where.action = action;
  }
  if (userId) {
    where.user_id = userId;
  }
  if (sessionId) {
    where.session_id = sessionId;
  }
  if (category) {
    where.category = category;
  }
  if (moduleFilter) {
    where.module = moduleFilter;
  }
  if (outcome) {
    where.outcome = outcome;
  }
  if (risk) {
    where.risk = risk;
  }
  if (ip) {
    where.ip = ip;
  }
  if (correlationId) {
    where.correlation_id = correlationId;
  }
  if (entityId) {
    where.entity_id = entityId;
  }
  if (entityType) {
    where.entity_type = entityType;
  }
  if (source) {
    where.source = source;
  }

  return where;
}

function _escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function _streamCsv(res, rows, truncated) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
  if (truncated) {
    res.setHeader('X-Export-Truncated', 'true');
  }

  res.write('﻿'); // BOM para Excel
  res.write(`${CSV_COLUMNS.join(',')}\n`);

  for (const row of rows) {
    const line = CSV_COLUMNS.map(col => _escapeCsv(row[col])).join(',');
    res.write(`${line}\n`);
  }

  res.end();
}

async function _streamXlsx(res, rows, truncated) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.xlsx"');
  if (truncated) {
    res.setHeader('X-Export-Truncated', 'true');
  }

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const sheet = workbook.addWorksheet('Audit Logs');

  sheet.columns = CSV_COLUMNS.map(col => ({ header: col, key: col, width: 25 }));

  for (const row of rows) {
    const data = {};
    for (const col of CSV_COLUMNS) {
      data[col] = row[col] ?? '';
    }
    sheet.addRow(data).commit();
  }

  await workbook.commit();
}

function _includeExecutor() {
  return {
    model: User,
    as: 'executor',
    required: false,
    attributes: ['user_id', 'username'],
    include: [{ model: Person, as: 'person', attributes: ['first_name', 'last_name'] }]
  };
}

module.exports = new AdminAuditLogService();
module.exports.AdminAuditLogService = AdminAuditLogService;
