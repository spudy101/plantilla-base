import sequelizeModule = require('sequelize');
const { fn, col } = sequelizeModule;
import BaseRepository = require('../../../../shared/repositories/base.repository');
import ReadRepository = require('../../../../shared/repositories/read.repository');
import modelsModule = require('../../../../shared/models');
const { SmsDeliveryAttempt } = modelsModule;
import type defineSmsDeliveryAttempt = require('../models/sms-delivery-attempt.model');
import queryModule = require('../../../../shared/repositories/query');
const { dateRange, toWhere } = queryModule;
import type { WhereClause } from '../../../../shared/repositories/query';

const PERCENT_SCALE = 10000;
const PCT_DIVISOR = 100;

class SmsDeliveryAttemptRepository extends BaseRepository<defineSmsDeliveryAttempt.Instance> {
  constructor() {
    super(SmsDeliveryAttempt, {});
  }

  createAttempt({
    userId,
    phoneHash,
    provider = 'aws_sms',
    purpose
  }: {
    userId?: string | null;
    phoneHash: string;
    provider?: string;
    purpose: defineSmsDeliveryAttempt.Attributes['purpose'];
  }) {
    return this.model.create({
      user_id: userId || null,
      phone_hash: phoneHash,
      provider,
      purpose,
      status: 'pending',
      retry_count: 0
    });
  }

  async markSent(smsAttemptId: string, { providerMessageId = null }: { providerMessageId?: string | null } = {}) {
    const record = await this.model.findByPk(smsAttemptId);
    if (!record) {
      return null;
    }
    return record.update({
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: new Date()
    });
  }

  async markFailed(smsAttemptId: string, { lastError, retryCount }: { lastError?: string | null; retryCount?: number } = {}) {
    const record = await this.model.findByPk(smsAttemptId);
    if (!record) {
      return null;
    }
    return record.update({
      status: 'failed',
      last_error: lastError || null,
      retry_count: retryCount ?? record.retry_count
    });
  }

  override findAllPaginated(
    { status = null, provider = null, purpose = null, from = null, to = null }: SmsDeliveryAttemptRepository.Filters = {},
    paginationParams: ReadRepository.PaginationParams = {}
  ) {
    const where: WhereClause = {};

    if (status) {
      where.status = status;
    }
    if (provider) {
      where.provider = provider;
    }
    if (purpose) {
      where.purpose = purpose;
    }
    const createdAtRange = dateRange(from, to);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }

    return this.model.findAndCountAll({
      where: toWhere(where),
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['created_at', 'DESC']],
      distinct: true
    });
  }

  async getStats({ from = null, to = null }: Pick<SmsDeliveryAttemptRepository.Filters, 'from' | 'to'> = {}) {
    const where: WhereClause = {};
    const createdAtRange = dateRange(from, to);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }

    const rows = await this.aggregate<{ status: defineSmsDeliveryAttempt.Attributes['status']; count: string }>({
      where: toWhere(where),
      attributes: ['status', [fn('COUNT', col('sms_attempt_id')), 'count']],
      group: ['status']
    });

    const stats: { pending: number; sent: number; failed: number; total: number; successRate: number | null } = {
      pending: 0,
      sent: 0,
      failed: 0,
      total: 0,
      successRate: null
    };
    for (const row of rows) {
      stats[row.status] = Number.parseInt(row.count, 10);
    }
    stats.total = stats.pending + stats.sent + stats.failed;
    stats.successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * PERCENT_SCALE) / PCT_DIVISOR : null;

    return stats;
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SmsDeliveryAttemptRepository {
  export type Filters = {
    status?: defineSmsDeliveryAttempt.Attributes['status'] | null;
    provider?: string | null;
    purpose?: defineSmsDeliveryAttempt.Attributes['purpose'] | null;
    from?: string | Date | null;
    to?: string | Date | null;
  };
}

export = new SmsDeliveryAttemptRepository();
