// modules/admin/privacy-policy/services/privacy-policy-admin.service.js
//
// Lógica de negocio del mantenedor de Políticas de Privacidad.
//
// Flujo de createVersion:
//   1. Validar que la versión no exista
//   2. Construir la S3 key con el número de versión (ej: legal/privacy-policy-v1.1.pdf)
//   3. Subir el PDF al bucket PÚBLICO via S3Util.uploadPublicDocument()
//   4. Invalidar caché de CloudFront para que el nuevo PDF sea inmediatamente visible
//   5. Crear el registro en BD con la URL pública y marcarlo is_active = true
//      (el repositorio desactiva automáticamente la versión anterior)

const crypto = require('node:crypto');
const privacyPolicyAdminRepository = require('../../../../schemas/records/legal/repositories/privacy-policy-admin.repository');
const S3Util = require('../../../../../shared/utils/s3.util');
const redisClient = require('../../../../../shared/utils/redis.util');
const AppError = require('../../../../../shared/utils/app-error.util');
const { logger, logAudit } = require('../../../../../shared/utils/logger.util');
const PaginationHelper = require('../../../../../shared/utils/pagination.util');
const NotificationCreationService = require('../../../../schemas/notification/services/notification-creation.service');
const {
  ListPrivacyPoliciesResponseDTO,
  PrivacyPolicyDetailResponseDTO,
  PrivacyPolicyCreatedResponseDTO
} = require('../dtos/privacy-policy-admin.dto');

class PrivacyPolicyAdminService {
  // ============================================================
  // LIST — paginado con filtros
  // ============================================================

  /**
   * Lista todas las versiones de la política con paginación.
   *
   * Query params soportados:
   *   page, limit, sortBy, order  — paginación estándar
   *   search                      — busca en version y summary
   *   isActive                    — filtra por estado (true/false)
   *
   * @param {Object} query   - req.query
   * @param {string} userId  - ID del admin que consulta (para auditoría)
   */
  async listVersions(query, userId) {
    const paginationParams = PaginationHelper.getPaginationParams(query);
    const filters = PaginationHelper.buildFilters(query, ['isActive']);
    const searchTerm = query.search || null;

    const { rows, count } = await privacyPolicyAdminRepository.findAllPaginated(filters, paginationParams, searchTerm);

    const metadata = {
      totalItems: count,
      page: paginationParams.page,
      limit: paginationParams.limit,
      sortBy: paginationParams.sortBy,
      order: paginationParams.order,
      filters: searchTerm ? { search: searchTerm, ...filters } : filters
    };

    logAudit(
      'PRIVACY_POLICY_LIST_VIEWED',
      userId,
      {
        totalItems: count,
        page: paginationParams.page
      },
      { entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }
    );

    return ListPrivacyPoliciesResponseDTO(rows, metadata);
  }

  // ============================================================
  // DETAIL — una versión por ID con URL del PDF
  // ============================================================

  /**
   * Retorna el detalle de una versión incluyendo la URL pública del PDF.
   * La URL ya es pública via CloudFront — no se genera presigned URL.
   *
   * @param {string} privacyPolicyId - UUID de la política
   * @param {string} userId          - ID del admin (para auditoría)
   */
  async getVersionDetail(privacyPolicyId, userId) {
    const policy = await privacyPolicyAdminRepository.findById(privacyPolicyId);
    if (!policy) {
      throw AppError.notFound('Versión de política de privacidad no encontrada');
    }

    logAudit(
      'PRIVACY_POLICY_DETAIL_VIEWED',
      userId,
      { version: policy.version },
      { entityId: privacyPolicyId, entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }
    );

    return PrivacyPolicyDetailResponseDTO(policy);
  }

  // ============================================================
  // CREATE — nueva versión con upload a S3 público
  // ============================================================

  /**
   * Publica una nueva versión de la política de privacidad.
   *
   * Pasos:
   *   1. Validar que la versión no exista en BD
   *   2. Subir el PDF al bucket público con key predecible
   *   3. Invalidar caché CloudFront
   *   4. Crear registro en BD (desactiva la versión anterior automáticamente)
   *
   * @param {Object} data
   * @param {string}   data.version        - Ej: "1.1", "2.0"
   * @param {Buffer}   data.fileBuffer     - Buffer del PDF subido via multer
   * @param {string}   data.originalName   - Nombre original del archivo (para validación)
   * @param {string}   [data.summary]      - Resumen de cambios (opcional)
   * @param {Date}     [data.effectiveDate] - Fecha de entrada en vigor (default: ahora)
   * @param {string}   userId              - ID del admin que crea la versión
   */
  async createVersion(data, userId) {
    const { version, fileBuffer, _originalName, summary, effectiveDate } = data;

    // 1. Verificar que la versión no exista
    const existing = await privacyPolicyAdminRepository.findByVersion(version);
    if (existing) {
      throw AppError.conflict(`La versión ${version} ya existe`);
    }

    // 2. Subir PDF al bucket público
    //    Key predecible: legal/privacy-policy-v{version}.pdf
    //    Ejemplo: legal/privacy-policy-v1.1.pdf
    const sanitizedVersion = version.replaceAll('.', '-'); // 1.1 → 1-1 (safe para URL)
    const s3Key = `legal/privacy-policy-v${sanitizedVersion}.pdf`;

    const documentUrl = await S3Util.uploadPublicDocument(fileBuffer, s3Key, 'application/pdf');

    // 3. Invalidar caché CloudFront (no bloquea si falla)
    await S3Util.invalidateCloudFront(`/${s3Key}`);

    // [RF-LP-01] | CA-01 | Invalida cache Redis al publicar nueva versión legal
    await redisClient.del('cache:privacy-policy:active');

    // 4. Crear registro en BD
    //    El repositorio desactiva la versión anterior automáticamente
    const documentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const policy = await privacyPolicyAdminRepository.createVersion({
      version,
      document_url: documentUrl,
      document_hash: documentHash,
      summary: summary || null,
      effective_date: effectiveDate || new Date()
    });

    logAudit(
      'PRIVACY_POLICY_VERSION_CREATED',
      userId,
      {
        version,
        documentUrl,
        s3Key
      },
      { entityId: policy.privacy_policy_id, entityType: 'PrivacyPolicy', entityTable: 'privacy_policies' }
    );

    // RF-ADM-04: notificar a todos los usuarios activos en background
    setImmediate(() => {
      NotificationCreationService.crearNotificacion({
        tipoNotificacion: 'PRIVACY_POLICY_UPDATE',
        userId: null, // null = notificación global
        metadata: {
          nuevaVersion: version,
          fechaVigencia: policy.effective_date?.toISOString?.()?.split('T')[0] ?? version,
          resumenCambios: summary || 'Hemos realizado mejoras en nuestra política para proteger mejor tus datos.',
          documentUrl
        }
      }).catch(err =>
        logger.warn('Error enviando notificación de actualización de política', {
          error: err.message,
          version
        })
      );
    });

    return PrivacyPolicyCreatedResponseDTO(policy);
  }
}

module.exports = new PrivacyPolicyAdminService();
