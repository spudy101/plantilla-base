// shared/constants/domain-enums.js
//
// Enums de dominio (estados, catálogos cerrados). Única fuente de verdad: los modelos Sequelize los usan para
// definir sus ENUM y los services los leen desde aquí (SOLID: D — los services no importan modelos
// solo para leer un enum).

const NOTIFICATION_PROCESSING_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PARTIAL_FAILURE: 'partial_failure',
  FAILED: 'failed'
});

const APPROVAL_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
});

const USER_SESSION_STATUS = Object.freeze({
  ACTIVE: 'active',
  CLOSED: 'closed'
});

// Bitácora de llamadas a proveedores (integration_api_logs): producto y resultado.
const INTEGRATION_PRODUCTS = Object.freeze(['ses', 's3', 'sns', 'aws_sms']);
const INTEGRATION_RESULTS = Object.freeze(['success', 'failed', 'circuit_open']);

module.exports = {
  NOTIFICATION_PROCESSING_STATUS,
  APPROVAL_REQUEST_STATUS,
  USER_SESSION_STATUS,
  INTEGRATION_PRODUCTS,
  INTEGRATION_RESULTS
};
