const { Op } = require('sequelize');
const BaseRepository = require('../../../../shared/repositories/base.repository');
const { ProviderFallbackEvent } = require('../../../../shared/models');

const MATCH_WINDOW_MS = 5000;

class ProviderFallbackEventRepository extends BaseRepository {
  constructor() {
    super(ProviderFallbackEvent, {});
  }

  openFallback({ provider, circuitProduct, startedAt, metadata = null }) {
    return this.model.create({
      provider,
      circuit_product: circuitProduct,
      started_at: startedAt,
      ended_at: null,
      metadata
    });
  }

  async closeFallback({ provider, startedAt, endedAt, affectedCount }) {
    const event = await this.model.findOne({
      where: {
        provider,
        started_at: startedAt ? { [Op.gte]: new Date(Number(startedAt) - MATCH_WINDOW_MS) } : { [Op.ne]: null },
        ended_at: null
      },
      order: [['started_at', 'DESC']]
    });

    if (!event) {
      return null;
    }

    return event.update({
      ended_at: endedAt,
      affected_processes_count: affectedCount
    });
  }

  findOpenByProvider(provider) {
    return this.model.findOne({
      where: { provider, ended_at: null },
      order: [['started_at', 'DESC']]
    });
  }

  countActive() {
    return this.model.count({ where: { ended_at: null } });
  }

  findRecent(limit = 20) {
    return this.model.findAll({ order: [['started_at', 'DESC']], limit });
  }

  findAllPaginated({ provider = null, activeOnly = false, from = null, to = null } = {}, paginationParams) {
    const where = {};

    if (provider) {
      where.provider = provider;
    }
    if (activeOnly) {
      where.ended_at = null;
    }
    if (from || to) {
      where.started_at = {};
      if (from) {
        where.started_at[Op.gte] = new Date(from);
      }
      if (to) {
        where.started_at[Op.lte] = new Date(to);
      }
    }

    return this.model.findAndCountAll({
      where,
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['started_at', 'DESC']],
      distinct: true
    });
  }
}

module.exports = new ProviderFallbackEventRepository();
