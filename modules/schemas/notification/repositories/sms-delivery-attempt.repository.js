const { Op } = require('sequelize');
const BaseRepository = require('../../../../shared/repositories/base.repository');
const { SmsDeliveryAttempt } = require('../../../../shared/models');

const PERCENT_SCALE = 10000;
const PCT_DIVISOR = 100;

class SmsDeliveryAttemptRepository extends BaseRepository {
  constructor() {
    super(SmsDeliveryAttempt, {});
  }

  createAttempt({ userId, phoneHash, provider = 'aws_sms', purpose }) {
    return this.model.create({
      user_id: userId || null,
      phone_hash: phoneHash,
      provider,
      purpose,
      status: 'pending',
      retry_count: 0
    });
  }

  async markSent(smsAttemptId, { providerMessageId = null } = {}) {
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

  async markFailed(smsAttemptId, { lastError, retryCount } = {}) {
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

  findAllPaginated({ status = null, provider = null, purpose = null, from = null, to = null } = {}, paginationParams) {
    const where = {};

    if (status) {
      where.status = status;
    }
    if (provider) {
      where.provider = provider;
    }
    if (purpose) {
      where.purpose = purpose;
    }
    if (from || to) {
      where.created_at = {};
      if (from) {
        where.created_at[Op.gte] = new Date(from);
      }
      if (to) {
        where.created_at[Op.lte] = new Date(to);
      }
    }

    return this.model.findAndCountAll({
      where,
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['created_at', 'DESC']],
      distinct: true
    });
  }

  async getStats({ from = null, to = null } = {}) {
    const where = {};
    if (from || to) {
      where.created_at = {};
      if (from) {
        where.created_at[Op.gte] = new Date(from);
      }
      if (to) {
        where.created_at[Op.lte] = new Date(to);
      }
    }

    const rows = await this.model.findAll({
      where,
      attributes: ['status', [this.model.sequelize.fn('COUNT', this.model.sequelize.col('sms_attempt_id')), 'count']],
      group: ['status'],
      raw: true
    });

    const stats = { pending: 0, sent: 0, failed: 0 };
    for (const row of rows) {
      stats[row.status] = Number.parseInt(row.count, 10);
    }
    stats.total = stats.pending + stats.sent + stats.failed;
    stats.successRate = stats.total > 0 ? Math.round((stats.sent / stats.total) * PERCENT_SCALE) / PCT_DIVISOR : null;

    return stats;
  }
}

module.exports = new SmsDeliveryAttemptRepository();
