import { Op } from 'sequelize';
import BaseRepository from '../../../../shared/repositories/base.repository';
import ReadRepository from '../../../../shared/repositories/read.repository';
import * as queryModule from '../../../../shared/repositories/query';
const { toWhere } = queryModule;
import type { WhereClause } from '../../../../shared/repositories/query';
import modelsModule from '../../../../shared/models';
const { ApprovalRequest, User, Person } = modelsModule;
import type defineApprovalRequest from '../models/approval-request.model';
import type defineUser from '../../kyc/iam/models/user.model';

// first_name y last_name viven en Person, no en User.
// Se incluye Person como sub-include para obtenerlos.
const USER_WITH_PERSON_INCLUDE = {
  model: Person,
  as: 'person',
  attributes: ['first_name', 'last_name'],
  required: false
};

const REQUESTER_INCLUDE = {
  model: User,
  as: 'requester',
  attributes: ['user_id', 'username'],
  required: false,
  include: [USER_WITH_PERSON_INCLUDE]
};

class ApprovalRequestRepository extends BaseRepository<defineApprovalRequest.Instance> {
  constructor() {
    super(ApprovalRequest, {
      searchFields: ['operation_key', 'entity_type']
    });
  }

  async findByIdWithUsers(approvalRequestId: string) {
    // Sin includes de User: mismo bug que findAllPaginatedWithUsers al incluir el modelo
    // User dos veces (requester/secondApprover) con sub-include person. Se resuelven aparte.
    const request = await this.model.findOne({ where: { approval_request_id: approvalRequestId } });
    if (!request) {
      return null;
    }
    await this._attachUsers([request]);
    return request;
  }

  async findAllPaginatedWithUsers(
    filters: ApprovalRequestRepository.Filters,
    paginationParams: ReadRepository.PaginationParams,
    searchTerm: string | null
  ) {
    const { limit, offset, sortBy, order } = paginationParams;

    const where: WhereClause = {};
    if (filters.operationKey) {
      where.operation_key = filters.operationKey;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.entityType) {
      where.entity_type = filters.entityType;
    }

    let whereCondition: WhereClause = where;
    if (searchTerm) {
      const searchFields = ['operation_key', 'entity_type'];
      whereCondition = {
        [Op.and]: [where, { [Op.or]: searchFields.map(f => ({ [f]: { [Op.iLike]: `%${searchTerm}%` } })) }]
      };
    }

    const modelAttributes = Object.keys(this.model.rawAttributes);
    const safeSortBy = sortBy && modelAttributes.includes(sortBy) ? sortBy : 'created_at';

    // No se incluye User vía association en esta query. Sequelize genera SQL inválido al
    // incluir el mismo modelo (User) dos veces —requester y secondApprover— cada uno con
    // sub-include person: emite el JOIN anidado a person de secondApprover pero no el de
    // secondApprover, y la cláusula ON referencia un alias ausente del FROM
    // («falta una entrada para la tabla secondApprover en la cláusula FROM»).
    // Se resuelven requester/secondApprover en una query aparte (un solo alias de User).
    const [count, rows] = await Promise.all([
      this.model.count({ where: toWhere(whereCondition) }),
      this.model.findAll({
        where: toWhere(whereCondition),
        limit,
        offset,
        order: [[safeSortBy, order ?? 'DESC']]
      })
    ]);

    await this._attachUsers(rows);

    return { rows, count };
  }

  // Adjunta requester/secondApprover (User + person) a cada fila con una sola query,
  // evitando el bug de Sequelize al incluir el mismo modelo dos veces con sub-include.
  async _attachUsers(rows: defineApprovalRequest.Instance[]) {
    const userIds = [
      ...new Set(rows.flatMap(r => [r.requested_by, r.second_approver_id]).filter((id): id is string => Boolean(id)))
    ];

    let byId = new Map<string, defineUser.Instance>();
    if (userIds.length > 0) {
      const users = await User.findAll({
        where: { user_id: { [Op.in]: userIds } },
        attributes: ['user_id', 'username'],
        include: [USER_WITH_PERSON_INCLUDE]
      });
      byId = new Map(users.map(u => [u.user_id, u]));
    }

    for (const row of rows) {
      row.requester = byId.get(row.requested_by) ?? null;
      row.secondApprover = row.second_approver_id ? byId.get(row.second_approver_id) ?? null : null;
    }
  }

  findPendingByEntityOperation(operationKey: string, entityType: string, entityId: string) {
    return this.model.findOne({
      where: {
        operation_key: operationKey,
        entity_type: entityType,
        entity_id: entityId,
        status: ApprovalRequest.STATUS.PENDING
      }
    });
  }

  // Una sola query batch para anotar pendientes sobre una lista de entidades.
  findPendingByEntityIds(entityType: string, entityIds: string[]) {
    if (!Array.isArray(entityIds) || entityIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.model.findAll({
      where: {
        entity_type: entityType,
        entity_id: { [Op.in]: entityIds },
        status: ApprovalRequest.STATUS.PENDING
      },
      include: [REQUESTER_INCLUDE]
    });
  }

  // Pendientes ya vencidas (para el worker de expiración).
  findExpired(now: Date) {
    return this.model.findAll({
      where: {
        status: ApprovalRequest.STATUS.PENDING,
        expires_at: { [Op.ne]: null, [Op.lt]: now }
      }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ApprovalRequestRepository {
  export interface Filters {
    operationKey?: string;
    status?: defineApprovalRequest.Attributes['status'];
    entityType?: string;
  }
}

export default new ApprovalRequestRepository();
