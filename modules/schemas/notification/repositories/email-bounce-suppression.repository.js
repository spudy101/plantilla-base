const { Op } = require('sequelize');
const BaseRepository = require('../../../../shared/repositories/base.repository');
const { EmailBounceSuppression } = require('../../../../shared/models');

// Persistencia de la suppression list de correo (por email_hash).
class EmailBounceSuppressionRepository extends BaseRepository {
  constructor() {
    super(EmailBounceSuppression, {});
  }

  findByHash(emailHash) {
    return this.model.findOne({ where: { email_hash: emailHash } });
  }

  async isSuppressed(emailHash) {
    const record = await this.model.findOne({
      where: { email_hash: emailHash, status: 'suppressed' },
      attributes: ['email_bounce_suppression_id']
    });
    return record !== null;
  }

  /**
   * Registra un rebote duro para una dirección: crea el registro o incrementa el contador.
   * Al alcanzar el umbral la marca como 'suppressed'. Devuelve el estado resultante.
   * @param {string} emailHash
   * @param {{ userId?: string, errorCode?: string, threshold: number }} params
   * @returns {Promise<{ bounceCount: number, suppressed: boolean, alreadySuppressed: boolean }>}
   */
  async registerHardBounce(emailHash, { userId = null, errorCode = null, threshold }) {
    const [record] = await this.model.findOrCreate({
      where: { email_hash: emailHash },
      defaults: { email_hash: emailHash, user_id: userId, bounce_count: 0, status: 'active' }
    });

    const alreadySuppressed = record.status === 'suppressed';
    const bounceCount = record.bounce_count + 1;
    const reachedThreshold = bounceCount >= threshold;

    await record.update({
      bounce_count: bounceCount,
      user_id: record.user_id || userId,
      last_error_code: errorCode,
      last_bounce_at: new Date(),
      status: reachedThreshold ? 'suppressed' : record.status,
      suppressed_at: reachedThreshold && !alreadySuppressed ? new Date() : record.suppressed_at
    });

    return {
      bounceCount,
      suppressed: reachedThreshold,
      alreadySuppressed
    };
  }

  /**
   * Levanta la supresión de una dirección (des-bloqueo manual): resetea contador y estado.
   * @returns el registro actualizado, o null si no existía.
   */
  async lift(emailHash) {
    const record = await this.model.findOne({ where: { email_hash: emailHash } });
    if (!record) {
      return null;
    }
    return record.update({
      status: 'active',
      bounce_count: 0,
      suppressed_at: null
    });
  }

  findAllPaginated({ status = null } = {}, paginationParams) {
    const where = {};
    if (status) {
      where.status = status;
    }
    return this.model.findAndCountAll({
      where,
      limit: paginationParams.limit,
      offset: paginationParams.offset,
      order: [['last_bounce_at', 'DESC']],
      distinct: true
    });
  }

  async getStats() {
    const { fn, col } = this.model.sequelize;
    const rows = await this.model.findAll({
      where: { status: { [Op.in]: ['active', 'suppressed'] } },
      attributes: ['status', [fn('COUNT', col('email_bounce_suppression_id')), 'count']],
      group: ['status'],
      raw: true
    });

    const stats = { active: 0, suppressed: 0 };
    for (const row of rows) {
      stats[row.status] = Number.parseInt(row.count, 10);
    }
    stats.total = stats.active + stats.suppressed;
    return stats;
  }
}

module.exports = new EmailBounceSuppressionRepository();
