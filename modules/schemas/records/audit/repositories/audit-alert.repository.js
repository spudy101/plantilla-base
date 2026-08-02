const BaseRepository = require('../../../../../shared/repositories/base.repository');
const { AuditAlert } = require('../../../../../shared/models');
const { Op } = require('sequelize');

class AuditAlertRepository extends BaseRepository {
  constructor() {
    super(AuditAlert);
  }

  create(data) {
    try {
      return this.model.create(data);
    } catch {
      return null;
    }
  }

  findAllFiltered({ acknowledged, dateFrom, dateTo, action, category } = {}, { limit = 20, offset = 0 } = {}) {
    const where = {};

    if (typeof acknowledged === 'boolean') {
      where.acknowledged = acknowledged;
    }
    if (action) {
      where.action = action;
    }
    if (category) {
      where.category = category;
    }
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) {
        where.created_at[Op.gte] = dateFrom;
      }
      if (dateTo) {
        where.created_at[Op.lte] = dateTo;
      }
    }

    return this.model.findAndCountAll({
      where,
      include: [
        {
          association: 'actor',
          required: false,
          attributes: ['user_id', 'username'],
          include: [{ association: 'person', attributes: ['first_name', 'last_name'] }]
        },
        {
          association: 'acknowledgedByUser',
          required: false,
          attributes: ['user_id', 'username'],
          include: [{ association: 'person', attributes: ['first_name', 'last_name'] }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });
  }

  acknowledge(alertId, acknowledgedBy) {
    return this.model.update(
      {
        acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date()
      },
      { where: { alert_id: alertId, acknowledged: false } }
    );
  }

  acknowledgeBulk(alertIds, acknowledgedBy) {
    return this.model.update(
      {
        acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date()
      },
      { where: { alert_id: { [Op.in]: alertIds }, acknowledged: false } }
    );
  }

  countPending() {
    return this.model.count({ where: { acknowledged: false } });
  }
}

module.exports = new AuditAlertRepository();
