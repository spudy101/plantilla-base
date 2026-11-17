import cron from 'node-cron';
import loggerUtilModule from '../../../../../shared/utils/logger.util';
const { logger, logAudit } = loggerUtilModule;
import requestContext from '../../../../../shared/utils/request-context.util';
import modelsModule from '../../../../../shared/models';
const { SystemGlobalConfig, AuditLog, sequelize } = modelsModule;
import { Op } from 'sequelize';
import errorMessageModule from '../../../../../shared/utils/error-message.util';

const { errorMessage } = errorMessageModule;


// [RF-AUTH-01] | CA-07 | Retención mínima 5 años
// en BD (hot). Archivado S3 STANDARD_IA posterior.
// Configurable via audit_retention_hot_years.
// Cumple Circular ADC-2007 SFC.
const DEFAULT_HOT_YEARS = 5;
const PURGE_AUDIT_META = { entityType: 'AuditLog', entityTable: 'audit_logs' };

// Cron mensual: día 1 a las 07:00. La purga destructiva queda DESACTIVADA por defecto
// (enableDbPurge:false) — solo corre el aviso de retención. Activar la purga requiere
// invocación manual con { enableDbPurge: true } (operación destructiva, aprobación del dev).
const RETENTION_CRON = '0 7 1 * *';

/**
 * Worker de archivado de auditoría (RF-ADM-03).
 *
 * Terraform gestiona el S3 lifecycle (Standard-IA → Glacier) de forma declarativa.
 * Este worker complementa desde la aplicación:
 *   1. Loguea cuántos registros de BD están próximos a vencer el período caliente,
 *      para que el Superadmin sea consciente de cuándo ocurrirá la purga.
 *   2. Purga de BD (solo con opts.enableDbPurge = true): elimina registros que
 *      superaron el período caliente. Requiere aprobación explícita del desarrollador
 *      por ser una operación destructiva.
 */
const run = async (opts: { enableDbPurge?: boolean } = {}) => {
  try {
    const config = await SystemGlobalConfig.findOne({ where: { is_active: true } });
    const hotYears = config?.audit_retention_hot_years ?? DEFAULT_HOT_YEARS;

    await _logExpiringRecords(hotYears);

    if (opts.enableDbPurge) {
      await _purgeExpiredFromDb(hotYears);
    }
  } catch (err) {
    logger.error('audit-archive.worker — error en ejecución', { error: errorMessage(err) });
  }
};

async function _logExpiringRecords(hotYears: number) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - hotYears + 1);

  const expiringCount = await AuditLog.count({
    where: { createdAt: { [Op.lte]: cutoff } }
  });

  if (expiringCount > 0) {
    logger.warn('audit-archive.worker — registros próximos a vencer período caliente', {
      count: expiringCount,
      hotYears,
      cutoffDate: cutoff.toISOString()
    });
  } else {
    logger.info('audit-archive.worker — sin registros próximos a vencer', { hotYears });
  }
}

/**
 * Elimina de BD los registros que vencieron el período caliente.
 * Usa SET LOCAL para autorizar la operación ante el trigger de inmutabilidad.
 */
async function _purgeExpiredFromDb(hotYears: number) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - hotYears);

  const count = await AuditLog.count({
    where: { createdAt: { [Op.lt]: cutoff } }
  });

  if (count === 0) {
    logger.info('audit-archive.worker — sin registros vencidos para purgar');
    return;
  }

  logger.warn('audit-archive.worker — iniciando purga de BD', { count, cutoffDate: cutoff.toISOString() });

  // SFC/RF-ADM-03: la purga destructiva de auditoría debe quedar auditada (inicio).
  logAudit(
    'AUDIT_LOG_PURGE_EXECUTED',
    'system',
    { status: 'initiated', candidateCount: count, cutoffDate: cutoff.toISOString(), hotYears },
    PURGE_AUDIT_META
  );

  await sequelize.transaction(async t => {
    await sequelize.query("SET LOCAL app.allow_audit_purge = 'true'", { transaction: t });
    await AuditLog.destroy({
      where: { createdAt: { [Op.lt]: cutoff } },
      force: true,
      transaction: t
    });
  });

  logger.info('audit-archive.worker — purga completada', { purged: count });

  // SFC/RF-ADM-03: confirmación de la purga ejecutada (fin) — quién/cuántos/cutoff.
  logAudit(
    'AUDIT_LOG_PURGE_EXECUTED',
    'system',
    { status: 'completed', purgedCount: count, cutoffDate: cutoff.toISOString(), hotYears },
    PURGE_AUDIT_META
  );
}

/**
 * Registra el cron mensual de retención de auditoría (RF-ADM-03 CA-3).
 * La purga del caliente la gobierna el Superadministrador vía la config global
 * `audit_hot_purge_enabled` (default false). Cuando está activa, el worker borra
 * de la BD los logs que superaron `audit_retention_hot_years` — la copia permanece
 * en S3 (frío). Con la config apagada (o ausente) solo avisa cuántos vencerán.
 */
function iniciar() {
  cron.schedule(RETENTION_CRON, () =>
    requestContext.runAsWorker('audit-archive.retention', async () => {
      logger.info('Ejecutando worker: retención/archivado de auditoría');
      const config = await SystemGlobalConfig.findOne({ where: { is_active: true } });
      await run({ enableDbPurge: config?.audit_hot_purge_enabled === true });
    })
  );
  logger.info('Worker de retención de auditoría iniciado exitosamente');
}

export default { run, iniciar };
