// modules/admin/privacy-policy/controllers/privacy-policy-admin.controller.js

const PrivacyPolicyAdminService = require('../services/privacy-policy-admin.service');
const ApiResponse = require('../../../../../shared/utils/app-response.util');
const { asyncHandler } = require('../../../../../shared/middlewares/error.middleware');

class PrivacyPolicyAdminController {
  /**
   * GET /admin/api/privacy-policies
   */
  listVersions = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Versiones de política de privacidad obtenidas exitosamente',
      await PrivacyPolicyAdminService.listVersions(req.query, req.user.userId)
    );
  });

  /**
   * GET /admin/api/privacy-policies/:privacyPolicyId
   */
  getVersionDetail = asyncHandler(async (req, res) => {
    return ApiResponse.success(
      res,
      'Detalle de política de privacidad obtenido exitosamente',
      await PrivacyPolicyAdminService.getVersionDetail(req.params.privacyPolicyId, req.user.userId)
    );
  });

  /**
   * POST /admin/api/privacy-policies
   * req.files.policyDocument[0] — igual que institutional email usa req.files.studentCertificate[0]
   */
  createVersion = asyncHandler(async (req, res) => {
    return ApiResponse.created(
      res,
      'Nueva versión de política de privacidad publicada exitosamente',
      await PrivacyPolicyAdminService.createVersion(
        {
          version: req.body.version,
          fileBuffer: req.files.policyDocument[0].buffer,
          originalName: req.files.policyDocument[0].originalname,
          summary: req.body.summary,
          effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined
        },
        req.user.userId
      )
    );
  });
}

module.exports = new PrivacyPolicyAdminController();
