import type definePrivacyPolicy from '../../../../schemas/records/legal/models/privacy-policy.model';
// modules/admin/privacy-policy/dtos/privacy-policy-admin.dto.ts

import componentsCatalogDtoModule from '../../../../../shared/dtos/kyc/components-catalog.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

// ============================================================
// COMPONENTE BASE — un ítem de la lista o el detalle completo
// ============================================================

function PrivacyPolicyItemDTO(policy: definePrivacyPolicy.Instance) {
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

function ListPrivacyPoliciesResponseDTO(policies: definePrivacyPolicy.Instance[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(policies) ? policies.map(PrivacyPolicyItemDTO) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

// ============================================================
// DETAIL — incluye la URL pública del PDF
// ============================================================

function PrivacyPolicyDetailResponseDTO(policy: definePrivacyPolicy.Instance) {
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

function PrivacyPolicyCreatedResponseDTO(policy: definePrivacyPolicy.Instance) {
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

export default {
  ListPrivacyPoliciesResponseDTO,
  PrivacyPolicyDetailResponseDTO,
  PrivacyPolicyCreatedResponseDTO
};
