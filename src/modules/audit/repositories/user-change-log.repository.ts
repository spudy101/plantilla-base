// modules/schemas/records/audit/repositories/user-change-log.repository.ts
//
// Cambios sobre una cuenta (email, contraseña, MFA, estado, rol…). Se escribe en la misma unidad de
// trabajo que el cambio que registra (a diferencia de audit_logs): si el cambio se revierte, su registro
// también. origin_session_id lo completa la extensión de Prisma al crear.
import PrismaRepository from '../../../shared/database/prisma.repository';
import { Prisma } from '../../../shared/database/generated/prisma/client';
import type {
  UserChangeLog,
  UserChangeLogChangeType,
  UserChangeLogChangedByRole
} from '../../../shared/database/generated/prisma/client';
import { USER_REF_SELECT } from './user-ref';

const WITH_USERS = {
  user: { select: USER_REF_SELECT },
  changedBy: { select: USER_REF_SELECT }
} satisfies Prisma.UserChangeLogInclude;

export type UserChangeLogWithUsers = Prisma.UserChangeLogGetPayload<{ include: typeof WITH_USERS }>;

const SORTABLE = Object.values(Prisma.UserChangeLogScalarFieldEnum);
const SEARCH_FIELDS = ['changeReason', 'previousValue', 'newValue'];

class UserChangeLogRepository extends PrismaRepository {
  /**
   * Cambios hechos SOBRE el usuario por un tercero (admin/system), para el feed de actividad del
   * cliente. Los que hizo el propio usuario ya están en su rastro de audit_logs. Sin previous/new_value:
   * el feed nunca expone valores.
   */
  async findExternalChangesByUserId(userId: string, { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
    const where: Prisma.UserChangeLogWhereInput = { userId, changedByRole: { in: ['admin', 'system'] } };
    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.userChangeLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: { logId: true, changeType: true, changedByRole: true, originSessionId: true, createdAt: true }
      }),
      db.userChangeLog.count({ where })
    ]);
    return { rows, count };
  }

  /** Listado paginado con el usuario afectado y quién hizo el cambio. */
  async findAllPaginated(
    filters: UserChangeLogRepository.Filters = {},
    pagination: PrismaRepository.PaginationParams = {},
    searchTerm: string | null = null
  ): Promise<PrismaRepository.Page<UserChangeLogWithUsers>> {
    const where: Prisma.UserChangeLogWhereInput = {
      ...(filters.changeType ? { changeType: filters.changeType } : {}),
      ...(filters.changedByRole ? { changedByRole: filters.changedByRole } : {}),
      ...(filters.changedByUserId ? { changedByUserId: filters.changedByUserId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {})
            }
          }
        : {}),
      ...(this.searchWhere(searchTerm, SEARCH_FIELDS) as Prisma.UserChangeLogWhereInput)
    };
    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.userChangeLog.findMany({ where, include: WITH_USERS, ...this.paginationArgs(SORTABLE, pagination) }),
      db.userChangeLog.count({ where })
    ]);
    return { rows, count };
  }

  /** Registra un cambio de usuario. */
  async createLog(logData: UserChangeLogRepository.LogInput): Promise<UserChangeLog> {
    return (await this.db()).userChangeLog.create({
      data: {
        userId: logData.userId,
        changedByUserId: logData.changedByUserId || null,
        changedByRole: logData.changedByRole,
        changeType: logData.changeType,
        previousValue: logData.previousValue || null,
        newValue: logData.newValue || null,
        changeReason: logData.changeReason || null,
        ipAddress: logData.ipAddress || null,
        userAgent: logData.userAgent || null
      }
    });
  }

  /** Cambios de un usuario. */
  findByUserId(userId: string, pagination: PrismaRepository.PaginationParams = {}) {
    return this.findAllPaginated({ userId }, pagination);
  }

  /** Cambios de un tipo. */
  findByChangeType(changeType: UserChangeLogChangeType, pagination: PrismaRepository.PaginationParams = {}) {
    return this.findAllPaginated({ changeType }, pagination);
  }

  /** Cambios hechos por un admin. */
  findByAdminUser(adminUserId: string, pagination: PrismaRepository.PaginationParams = {}) {
    return this.findAllPaginated({ changedByUserId: adminUserId, changedByRole: 'admin' }, pagination);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace UserChangeLogRepository {
  export type Filters = {
    changeType?: UserChangeLogChangeType;
    changedByRole?: UserChangeLogChangedByRole;
    changedByUserId?: string;
    userId?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
  };

  /** Entrada de createLog (camelCase, como la arman los services). */
  export interface LogInput {
    userId: string;
    changedByUserId?: string | null;
    changedByRole: UserChangeLogChangedByRole;
    changeType: UserChangeLogChangeType;
    previousValue?: string | null;
    newValue?: string | null;
    changeReason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
}

export default new UserChangeLogRepository();
