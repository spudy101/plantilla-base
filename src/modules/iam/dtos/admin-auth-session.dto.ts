import type { SessionWithDeviceAndUser } from '../repositories/user-session.repository';
import type { AuditLogWithExecutor } from '../../audit/repositories/audit-log.repository';
import componentsAuthModule from './auth-components.dto';
const { UserSessionComponent } = componentsAuthModule;
import componentsCatalogDtoModule from '../../catalogs/dtos/catalog-components.dto';
const { MetadataDTO } = componentsCatalogDtoModule;

type SessionRow = SessionWithDeviceAndUser;
type AttemptRow = AuditLogWithExecutor;

function SessionDTO(session: SessionRow) {
  const device = session.device || null;
  return {
    ...UserSessionComponent.build(session),
    userId: session.userId,
    device: device
      ? {
          deviceId: device.userTrustedDeviceId,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          browser: device.browser || null,
          os: device.os || null,
          status: device.status
        }
      : null
  };
}

function SessionListDTO(rows: SessionRow[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(s => SessionDTO(s)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

function _buildExecutorRef(executor: AttemptRow['executor']) {
  if (!executor) {
    return null;
  }
  return {
    userId: executor.userId,
    username: executor.username,
    fullName: [executor.person?.firstName, executor.person?.lastName].filter(Boolean).join(' ') || null
  };
}

function AuthAttemptDTO(log: AttemptRow) {
  return {
    auditLogId: log.auditLogId,
    action: log.action,
    description: log.description || null,
    outcome: log.outcome,
    risk: log.risk,
    userId: log.userId || null,
    user: _buildExecutorRef(log.executor),
    ipAddress: log.ip || null,
    userAgent: log.userAgent || null,
    timestamp: log.createdAt,
    errorMessage: log.errorMessage || null
  };
}

function AuthAttemptListDTO(rows: AttemptRow[], metadata: Parameters<typeof MetadataDTO.build>[0]) {
  return {
    data: Array.isArray(rows) ? rows.map(l => AuthAttemptDTO(l)) : [],
    metadata: MetadataDTO.build(metadata)
  };
}

export default {
  SessionDTO,
  SessionListDTO,
  AuthAttemptDTO,
  AuthAttemptListDTO
};
