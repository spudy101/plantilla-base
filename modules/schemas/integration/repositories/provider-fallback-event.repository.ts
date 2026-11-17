import { Op } from 'sequelize';
import BaseRepository from '../../../../shared/repositories/base.repository';
import ReadRepository from '../../../../shared/repositories/read.repository';
import modelsModule from '../../../../shared/models';
const { ProviderFallbackEvent } = modelsModule;
import type defineProviderFallbackEvent from '../models/provider-fallback-event.model';
import * as queryModule from '../../../../shared/repositories/query';
const { dateRange, toWhere } = queryModule;
import type { WhereClause } from '../../../../shared/repositories/query';

const MATCH_WINDOW_MS = 5000;

class ProviderFallbackEventRepository extends BaseRepository<defineProviderFallbackEvent.Instance> {
  constructor() {
    super(ProviderFallbackEvent, {});
  }

  openFallback({
    provider,
    circuitProduct,
    startedAt,
    metadata = null
  }: {
    provider: string;
    circuitProduct: string;
    startedAt: Date;
    metadata?: unknown;
  }) {
    return this.model.create({
      provider,
      circuit_product: circuitProduct,
      started_at: startedAt,
      ended_at: null,
      metadata
    });
  }

  async closeFallback({
    provider,
    startedAt,
    endedAt,
    affectedCount
  }: {
    provider: string;
    startedAt?: Date | number | null;
    endedAt: Date;
    affectedCount: number | null;
  }) {
    const where: WhereClause = {
      provider,
      started_at: startedAt ? { [Op.gte]: new Date(Number(startedAt) - MATCH_WINDOW_MS) } : { [Op.ne]: null },
      ended_at: null
    };
    const event = await this.model.findOne({
      where: toWhere(where),
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

  findOpenByProvider(provider: string) {
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

  override findAllPaginated(
    {
      provider = null,
      activeOnly = false,
      from = null,
      to = null
    }: { provider?: string | null; activeOnly?: boolean; from?: string | Date | null; to?: string | Date | null } = {},
    paginationParams: ReadRepository.PaginationParams = {}
  ) {
    const where: WhereClause = {};

    if (provider) {
      where.provider = provider;
    }
    if (activeOnly) {
      where.ended_at = null;
    }
    const startedAtRange = dateRange(from, to);
    if (startedAtRange) {
      where.started_at = startedAtRange;
    }

    return this.model.findAndCountAll({
      where: toWhere(where),
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['started_at', 'DESC']],
      distinct: true
    });
  }
}

export default new ProviderFallbackEventRepository();
