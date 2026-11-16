// shared/constants/domain-enums.ts
//
// Enums de dominio (estados, catálogos cerrados). Única fuente de verdad: los modelos Sequelize los usan para
// definir sus ENUM y los services los leen desde aquí (SOLID: D — los services no importan modelos
// solo para leer un enum).
//
// `as const` + Object.freeze: el valor es inmutable en runtime y el tipo es la unión literal exacta,
// así `DomainEnums.NotificationProcessingStatus` es 'pending' | 'processing' | … y no `string`.

const NOTIFICATION_PROCESSING_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PARTIAL_FAILURE: 'partial_failure',
  FAILED: 'failed'
} as const);

const APPROVAL_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
} as const);

const USER_SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  CLOSED: 'closed'
} as const);

// Bitácora de llamadas a proveedores (integration_api_logs): producto y resultado.
const INTEGRATION_PRODUCTS = Object.freeze(['ses', 's3', 'sns', 'aws_sms'] as const);
const INTEGRATION_RESULTS = Object.freeze(['success', 'failed', 'circuit_open'] as const);

const DomainEnums = {
  NOTIFICATION_PROCESSING_STATUS,
  APPROVAL_REQUEST_STATUS,
  USER_SESSION_STATUS,
  INTEGRATION_PRODUCTS,
  INTEGRATION_RESULTS
};

type ValueOf<T> = T[keyof T];

// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-redeclare
declare namespace DomainEnums {
  type NotificationProcessingStatus = ValueOf<typeof NOTIFICATION_PROCESSING_STATUS>;
  type ApprovalRequestStatus = ValueOf<typeof APPROVAL_REQUEST_STATUS>;
  type UserSessionStatus = ValueOf<typeof USER_SESSION_STATUS>;
  type IntegrationProduct = (typeof INTEGRATION_PRODUCTS)[number];
  type IntegrationResult = (typeof INTEGRATION_RESULTS)[number];
}

export = DomainEnums;
