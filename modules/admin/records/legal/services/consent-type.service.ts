import type defineConsentType = require('../../../../schemas/records/legal/models/consent-type.model');
import type { AdminAuditContext } from '../../../../../shared/types/audit-context';
import AppError = require('../../../../../shared/utils/app-error.util');
import loggerUtilModule = require('../../../../../shared/utils/logger.util');
const { logger, logAudit } = loggerUtilModule;
import PaginationHelper = require('../../../../../shared/utils/pagination.util');
import componentsCatalogDtoModule = require('../../../../../shared/dtos/kyc/components-catalog.dto');
const { MetadataDTO } = componentsCatalogDtoModule;
import consentTypeRepository = require('../../../../schemas/records/legal/repositories/consent-type.repository');
import NotificationUtil = require('../../../../schemas/notification/services/notification-creation.service');
import constantsModule = require('../../../../../shared/constants');
const { notifications } = constantsModule;
import consentTypeDtoModule = require('../dtos/consent-type.dto');
const { ConsentTypeListDTO, ConsentTypeDTO } = consentTypeDtoModule;

class ConsentTypeService {
  consentTypeRepository: typeof consentTypeRepository;
  NotificationUtil: typeof NotificationUtil;

  /**
   * Dependencias inyectables (SOLID: D). Por defecto se usan las implementaciones
   * reales; en tests u otros contextos se pueden reemplazar:
   *   new ConsentTypeService({ consentTypeRepository: fake })
   * @param {object} [deps]
   */
  constructor(deps: ConsentTypeService.Deps = {}) {
    this.consentTypeRepository = deps.consentTypeRepository ?? consentTypeRepository;
    this.NotificationUtil = deps.NotificationUtil ?? NotificationUtil;
  }

  async list(query: Record<string, unknown>, adminUserId: string) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const { rows, count } = await this.consentTypeRepository.findAllPaginated({}, paginationParams, PaginationHelper.stringParam(query, 'search'));

    logAudit(
      'CONSENT_TYPE_LIST_VIEWED',
      adminUserId,
      { totalItems: count, page: paginationParams.page },
      { entityType: 'ConsentType', entityTable: 'consent_types' }
    );

    return {
      data: rows.map(r => ConsentTypeListDTO(r)),
      metadata: MetadataDTO.build({
        totalItems: count,
        page: paginationParams.page,
        limit: paginationParams.limit,
        sortBy: paginationParams.sortBy,
        order: paginationParams.order
      })
    };
  }

  async getById(consentTypeId: string, adminUserId: string) {
    const record = await this.consentTypeRepository.findById(consentTypeId);
    if (!record) {
      throw AppError.notFound('Tipo de consentimiento no encontrado');
    }

    logAudit(
      'CONSENT_TYPE_DETAIL_VIEWED',
      adminUserId,
      { code: record.code },
      { entityType: 'ConsentType', entityTable: 'consent_types', entityId: consentTypeId }
    );

    return ConsentTypeDTO(record);
  }

  async create(body: ConsentTypeService.CreateInput, auditCtx: AdminAuditContext) {
    const existing = await this.consentTypeRepository.findOne({ code: body.code });
    if (existing) {
      throw AppError.conflict(`Ya existe un tipo de consentimiento con el código "${body.code}"`);
    }

    const record = await this.consentTypeRepository.create({
      code: body.code.toUpperCase(),
      name: body.name,
      description: body.description || null,
      is_mandatory: body.isMandatory !== false,
      is_revocable: body.isRevocable === true,
      is_active: true
    });

    logAudit(
      'CONSENT_TYPE_CREATED',
      auditCtx.adminUserId,
      { code: record.code, name: record.name },
      { entityType: 'ConsentType', entityTable: 'consent_types', entityId: record.consent_type_id }
    );

    logger.info('ConsentTypeService.create', { code: record.code, adminUserId: auditCtx.adminUserId });
    this._notifyAdmin('creado', record, auditCtx);
    return ConsentTypeDTO(record);
  }

  async update(consentTypeId: string, body: Partial<Pick<ConsentTypeService.CreateInput, 'name' | 'description' | 'isActive'>>, auditCtx: AdminAuditContext) {
    const record = await this.consentTypeRepository.findById(consentTypeId);
    if (!record) {
      throw AppError.notFound('Tipo de consentimiento no encontrado');
    }

    const updated = await record.update({
      name: body.name ?? record.name,
      description: body.description !== undefined ? body.description : record.description,
      is_active: body.isActive !== undefined ? body.isActive : record.is_active
    });

    logAudit(
      'CONSENT_TYPE_UPDATED',
      auditCtx.adminUserId,
      { consentTypeId, changes: body },
      { entityType: 'ConsentType', entityTable: 'consent_types', entityId: consentTypeId }
    );

    this._notifyAdmin('actualizado', updated, auditCtx);
    return ConsentTypeDTO(updated);
  }

  /** @private — push de confirmación al administrador que realizó la acción */
  _notifyAdmin(accion: string, record: Pick<defineConsentType.Instance, 'consent_type_id' | 'code' | 'name'>, auditCtx: AdminAuditContext) {
    setImmediate(() => {
      this.NotificationUtil.crearNotificacion({
        tipoNotificacion: 'CONSENT_TYPE_ADMIN_ACTION',
        userId: auditCtx.adminUserId,
        relatedEntity: { type: 'ConsentType', id: record.consent_type_id },
        metadata: {
          accion,
          code: record.code,
          logoUrl: notifications.ses.logoUrl
        }
      }).catch(err =>
        logger.warn('Error enviando notificación admin consent-type', {
          error: err.message,
          accion
        })
      );
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace ConsentTypeService {
  export interface CreateInput {
    code: string;
    name: string;
    description?: string | null;
    isMandatory?: boolean;
    isRevocable?: boolean;
    isActive?: boolean;
  }

  /** Dependencias inyectables (SOLID: D); sin ellas se usan las instancias reales. */
  export interface Deps {
    consentTypeRepository?: typeof consentTypeRepository;
    NotificationUtil?: typeof NotificationUtil;
  }
}

export = Object.assign(new ConsentTypeService(), { ConsentTypeService });
