import BaseRepository from '../../../../../shared/repositories/base.repository';
import modelsModule from '../../../../../shared/models';
const { AuditAlert } = modelsModule;
import { Op } from 'sequelize';
import type defineAuditAlert from '../models/audit-alert.model';
import * as queryModule from '../../../../../shared/repositories/query';
const { range, toWhere } = queryModule;
import type { WhereClause } from '../../../../../shared/repositories/query';

class AuditAlertRepository extends BaseRepository<defineAuditAlert.Instance> {
  constructor() {
    super(AuditAlert);
  }

  // (Se eliminó el override de `create`: el try/catch no capturaba rechazos async y además
  // perdía `options`. Se usa BaseRepository.create(data, options); el llamador ya maneja errores.)

  findAllFiltered(
    { acknowledged, dateFrom, dateTo, action, category }: AuditAlertRepository.Filters = {},
    { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {}
  ) {
    const where: WhereClause = {};

    if (typeof acknowledged === 'boolean') {
      where.acknowledged = acknowledged;
    }
    if (action) {
      where.action = action;
    }
    if (category) {
      where.category = category;
    }
    const createdAtRange = range(dateFrom, dateTo);
    if (createdAtRange) {
      where.created_at = createdAtRange;
    }

    return this.model.findAndCountAll({
      where: toWhere(where),
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

  acknowledge(alertId: string, acknowledgedBy: string) {
    return this.model.update(
      {
        acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date()
      },
      { where: { alert_id: alertId, acknowledged: false } }
    );
  }

  acknowledgeBulk(alertIds: string[], acknowledgedBy: string) {
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace AuditAlertRepository {
  export interface Filters {
    acknowledged?: boolean;
    dateFrom?: Date | string;
    dateTo?: Date | string;
    action?: string;
    category?: string;
  }
}

export default new AuditAlertRepository();
