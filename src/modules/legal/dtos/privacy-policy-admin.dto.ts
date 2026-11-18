import type { PrivacyPolicy } from '../../../shared/database/generated/prisma/client';
// modules/admin/privacy-policy/dtos/privacy-policy-admin.dto.ts

import componentsCatalogDtoModule from '../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

// ============================================================
// COMPONENTE BASE — un ítem de la lista o el detalle completo
// ============================================================

function PrivacyPolicyItemDTO(policy: PrivacyPolicy) {
  return {
    id: policy.privacyPolicyId,
    version: policy.version,
    isActive: policy.isActive,
    summary: policy.summary || null,
    effectiveDate: policy.effectiveDate,
    createdAt: policy.createdAt
  };
}

// ============================================================
// LIST — paginado
// ============================================================

function ListPrivacyPoliciesResponseDTO(policies: PrivacyPolicy[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(policies) ? policies.map(PrivacyPolicyItemDTO) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

// ============================================================
// DETAIL — incluye la URL pública del PDF
// ============================================================

function PrivacyPolicyDetailResponseDTO(policy: PrivacyPolicy) {
  return {
    id: policy.privacyPolicyId,
    version: policy.version,
    isActive: policy.isActive,
    summary: policy.summary || null,
    documentUrl: policy.documentUrl,
    effectiveDate: policy.effectiveDate,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  };
}

// ============================================================
// CREATE — respuesta tras publicar nueva versión
// ============================================================

function PrivacyPolicyCreatedResponseDTO(policy: PrivacyPolicy) {
  return {
    id: policy.privacyPolicyId,
    version: policy.version,
    isActive: policy.isActive,
    summary: policy.summary || null,
    documentUrl: policy.documentUrl,
    effectiveDate: policy.effectiveDate,
    createdAt: policy.createdAt
  };
}

export default {
  ListPrivacyPoliciesResponseDTO,
  PrivacyPolicyDetailResponseDTO,
  PrivacyPolicyCreatedResponseDTO
};
