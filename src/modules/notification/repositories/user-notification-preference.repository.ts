// modules/schemas/kyc/person/repositories/user-notification-preference.repository.ts
//
// Preferencias de notificación del usuario: una global (notificationCategoryCode = null) y overrides
// por categoría. El horario de no molestar (TIME) entra y sale como texto 'HH:MM:SS' (prisma-time).
// origin_session_id lo completa la extensión de Prisma al crear.
import PrismaRepository from '../../../shared/database/prisma.repository';
import type { NotificationCategory, Prisma, UserNotificationPreference } from '../../../shared/database/generated/prisma/client';
import { fromTime, toTime } from '../../../shared/database/prisma-time';
import { toCategoryRow } from './notification-category.repository';
import type { NotificationCategoryRow } from './notification-category.repository';

type TimeFields = 'quietHoursStart' | 'quietHoursEnd';
/** Preferencia con el horario de no molestar como texto. */
export type PreferenceRow = Omit<UserNotificationPreference, TimeFields> & {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};
export type PreferenceWithCategoryRow = PreferenceRow & { notificationCategory: NotificationCategoryRow | null };

/** Preferencias tal como llegan del DTO de entrada; undefined = no se toca. */
export interface PreferenceInput {
  allowPush?: boolean;
  allowEmail?: boolean;
  allowSms?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

function toRow(row: UserNotificationPreference): PreferenceRow {
  return { ...row, quietHoursStart: fromTime(row.quietHoursStart), quietHoursEnd: fromTime(row.quietHoursEnd) };
}

function toData({ quietHoursStart, quietHoursEnd, ...flags }: PreferenceInput) {
  return {
    ...flags,
    ...(quietHoursStart !== undefined ? { quietHoursStart: toTime(quietHoursStart) } : {}),
    ...(quietHoursEnd !== undefined ? { quietHoursEnd: toTime(quietHoursEnd) } : {})
  };
}

class UserNotificationPreferenceRepository extends PrismaRepository {
  private async findOne(userId: string, notificationCategoryCode: string | null): Promise<PreferenceRow | null> {
    const row = await (await this.db()).userNotificationPreference.findFirst({ where: { userId, notificationCategoryCode } });
    return row && toRow(row);
  }

  /** Preferencia de la categoría; si no hay, la global. */
  async findByUserAndCategory(userId: string, notificationCategoryCode: string | null): Promise<PreferenceRow | null> {
    return (await this.findOne(userId, notificationCategoryCode)) ?? this.findOne(userId, null);
  }

  findGlobalByUser(userId: string): Promise<PreferenceRow | null> {
    return this.findOne(userId, null);
  }

  /** Todas las del usuario (global + por categoría), con su categoría. */
  async findAllByUser(userId: string): Promise<PreferenceWithCategoryRow[]> {
    const rows = await (await this.db()).userNotificationPreference.findMany({
      where: { userId },
      include: { notificationCategory: true },
      // Igual que Sequelize: ASC deja la global (null) al final en Postgres
      orderBy: { notificationCategoryCode: { sort: 'asc', nulls: 'last' } }
    });
    return rows.map(r => ({
      ...toRow(r),
      notificationCategory: r.notificationCategory && toCategoryRow(r.notificationCategory as NotificationCategory)
    }));
  }

  /** Filas por id (hidratación del session-trace). */
  async findByIds(ids: readonly string[]): Promise<PreferenceRow[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await (await this.db()).userNotificationPreference.findMany({ where: { userNotificationPreferenceId: { in: [...ids] } } });
    return rows.map(toRow);
  }

  /** Crea la preferencia global con valores explícitos (alta de usuario). */
  async createGlobal(userId: string, data: PreferenceInput): Promise<PreferenceRow> {
    const row = await (await this.db()).userNotificationPreference.create({
      data: { userId, notificationCategoryCode: null, ...toData(data) } as Prisma.UserNotificationPreferenceUncheckedCreateInput
    });
    return toRow(row);
  }

  /** Crea o actualiza la preferencia global del usuario. */
  upsertGlobalPreference(userId: string, data: PreferenceInput): Promise<PreferenceRow> {
    return this.upsert(userId, null, data);
  }

  /** Crea o actualiza la preferencia de una categoría. */
  upsertCategoryPreference(userId: string, notificationCategoryCode: string, data: PreferenceInput): Promise<PreferenceRow> {
    return this.upsert(userId, notificationCategoryCode, data);
  }

  // La UNIQUE (user_id, notification_category_code) no sirve para upsert con la global: en Postgres
  // NULL ≠ NULL. Se busca y luego se actualiza o crea, de forma atómica.
  private upsert(userId: string, notificationCategoryCode: string | null, input: PreferenceInput): Promise<PreferenceRow> {
    const data = toData(input);
    return this.atomic(async db => {
      const existing = await db.userNotificationPreference.findFirst({ where: { userId, notificationCategoryCode } });
      const row = existing
        ? await db.userNotificationPreference.update({ where: { userNotificationPreferenceId: existing.userNotificationPreferenceId }, data })
        : await db.userNotificationPreference.create({
            data: { userId, notificationCategoryCode, ...data } as Prisma.UserNotificationPreferenceUncheckedCreateInput
          });
      return toRow(row);
    });
  }

  /** Elimina el override de una categoría (vuelve a regir la global); devuelve cuántas filas borró. */
  async deleteCategoryPreference(userId: string, notificationCategoryCode: string): Promise<number> {
    return (await (await this.db()).userNotificationPreference.deleteMany({ where: { userId, notificationCategoryCode } })).count;
  }

  async userAllowsPush(userId: string, notificationCategoryCode: string | null): Promise<boolean> {
    return (await this.findByUserAndCategory(userId, notificationCategoryCode))?.allowPush ?? true;
  }

  async userAllowsEmail(userId: string, notificationCategoryCode: string | null): Promise<boolean> {
    return (await this.findByUserAndCategory(userId, notificationCategoryCode))?.allowEmail ?? true;
  }
}

export default new UserNotificationPreferenceRepository();
