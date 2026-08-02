// modules/admin/privacy-policy/dtos/privacy-policy-admin.dto.js

const { MetadataDTO } = require('../../../../../shared/dtos/kyc/components-catalog.dto');

// ============================================================
// COMPONENTE BASE — un ítem de la lista o el detalle completo
// ============================================================

function PrivacyPolicyItemDTO(policy) {
  return {
    id: policy.privacy_policy_id,
    version: policy.version,
    isActive: policy.is_active,
    summary: policy.summary || null,
    effectiveDate: policy.effective_date,
    createdAt: policy.createdAt
  };
}

// ============================================================
// LIST — paginado
// ============================================================

function ListPrivacyPoliciesResponseDTO(policies, metadata) {
  return {
    data: Array.isArray(policies) ? policies.map(PrivacyPolicyItemDTO) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

// ============================================================
// DETAIL — incluye la URL pública del PDF
// ============================================================

function PrivacyPolicyDetailResponseDTO(policy) {
  return {
    id: policy.privacy_policy_id,
    version: policy.version,
    isActive: policy.is_active,
    summary: policy.summary || null,
    documentUrl: policy.document_url,
    effectiveDate: policy.effective_date,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  };
}

// ============================================================
// CREATE — respuesta tras publicar nueva versión
// ============================================================

function PrivacyPolicyCreatedResponseDTO(policy) {
  return {
    id: policy.privacy_policy_id,
    version: policy.version,
    isActive: policy.is_active,
    summary: policy.summary || null,
    documentUrl: policy.document_url,
    effectiveDate: policy.effective_date,
    createdAt: policy.createdAt
  };
}

module.exports = {
  ListPrivacyPoliciesResponseDTO,
  PrivacyPolicyDetailResponseDTO,
  PrivacyPolicyCreatedResponseDTO
};
