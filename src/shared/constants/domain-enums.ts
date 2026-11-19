// shared/constants/domain-enums.ts
//
// Enums de dominio (estados, catálogos cerrados). La fuente de verdad es el schema de Prisma
// (`enum NotificationProcessingStatus`, `enum ApprovalRequestStatus`…, que en la base son tipos ENUM):
// acá se reexponen con las claves UPPER_SNAKE_CASE que usan los services, tomando los valores del
// cliente generado (shared/database/generated/prisma/enums — solo constantes, sin cliente ni conexión).
// Si el schema agrega o quita un valor, `Exhaustive` rompe el typecheck hasta actualizar este archivo.
//
// Los services leen los enums desde aquí (SOLID: D — no importan el cliente de Prisma para un enum).
import {
  ApprovalRequestStatus as PrismaApprovalRequestStatus,
  NotificationProcessingStatus as PrismaNotificationProcessingStatus,
  UserSessionStatus as PrismaUserSessionStatus
} from '../database/generated/prisma/enums';

/** `true` solo si las constantes cubren todos los valores del enum de Prisma `E`. */
type Exhaustive<Values, E> = [E] extends [Values] ? ([Values] extends [E] ? true : never) : never;
const exhaustive = <Values, E>(check: Exhaustive<Values, E>) => check;

const NOTIFICATION_PROCESSING_STATUS = Object.freeze({
  PENDING: PrismaNotificationProcessingStatus.pending,
  PROCESSING: PrismaNotificationProcessingStatus.processing,
  COMPLETED: PrismaNotificationProcessingStatus.completed,
  PARTIAL_FAILURE: PrismaNotificationProcessingStatus.partial_failure,
  FAILED: PrismaNotificationProcessingStatus.failed
} as const);

const APPROVAL_REQUEST_STATUS = Object.freeze({
  PENDING: PrismaApprovalRequestStatus.pending,
  APPROVED: PrismaApprovalRequestStatus.approved,
  REJECTED: PrismaApprovalRequestStatus.rejected,
  EXPIRED: PrismaApprovalRequestStatus.expired
} as const);

const USER_SESSION_STATUS = Object.freeze({
  ACTIVE: PrismaUserSessionStatus.active,
  CLOSED: PrismaUserSessionStatus.closed
} as const);

type ValueOf<T> = T[keyof T];
exhaustive<ValueOf<typeof NOTIFICATION_PROCESSING_STATUS>, PrismaNotificationProcessingStatus>(true);
exhaustive<ValueOf<typeof APPROVAL_REQUEST_STATUS>, PrismaApprovalRequestStatus>(true);
exhaustive<ValueOf<typeof USER_SESSION_STATUS>, PrismaUserSessionStatus>(true);

const DomainEnums = {
  NOTIFICATION_PROCESSING_STATUS,
  APPROVAL_REQUEST_STATUS,
  USER_SESSION_STATUS
};

// eslint-disable-next-line @typescript-eslint/no-namespace, @typescript-eslint/no-redeclare
declare namespace DomainEnums {
  type NotificationProcessingStatus = ValueOf<typeof NOTIFICATION_PROCESSING_STATUS>;
  type ApprovalRequestStatus = ValueOf<typeof APPROVAL_REQUEST_STATUS>;
  type UserSessionStatus = ValueOf<typeof USER_SESSION_STATUS>;
}

export default DomainEnums;
