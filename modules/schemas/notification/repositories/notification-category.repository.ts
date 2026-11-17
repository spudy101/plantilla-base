// modules/schemas/notification/repositories/notification-category.repository.ts
//
// Categorías de notificación: fuente de verdad de canales (push/email/sms), DND y layout de email.
// El horario de no molestar por defecto (TIME) entra y sale como texto 'HH:MM:SS' (prisma-time).
import PrismaRepository from '../../../../shared/repositories/prisma.repository';
import { Prisma } from '../../../../shared/database/generated/prisma/client';
import type { NotificationCategory } from '../../../../shared/database/generated/prisma/client';
import { fromTime, toTime } from '../../../../shared/database/prisma-time';

type TimeFields = 'defaultQuietHoursStart' | 'defaultQuietHoursEnd';
/** Fila de categoría con el horario por defecto como texto. */
export type NotificationCategoryRow = Omit<NotificationCategory, TimeFields> & {
  defaultQuietHoursStart: string | null;
  defaultQuietHoursEnd: string | null;
};
/** Datos de alta/edición con el horario por defecto como texto. */
export type NotificationCategoryInput = Omit<Prisma.NotificationCategoryUncheckedUpdateManyInput, TimeFields> & {
  defaultQuietHoursStart?: string | null;
  defaultQuietHoursEnd?: string | null;
};

export function toCategoryRow(row: NotificationCategory): NotificationCategoryRow {
  return { ...row, defaultQuietHoursStart: fromTime(row.defaultQuietHoursStart), defaultQuietHoursEnd: fromTime(row.defaultQuietHoursEnd) };
}

function toData(data: NotificationCategoryInput) {
  const { defaultQuietHoursStart, defaultQuietHoursEnd, ...rest } = data;
  return {
    ...rest,
    ...(defaultQuietHoursStart !== undefined ? { defaultQuietHoursStart: toTime(defaultQuietHoursStart) } : {}),
    ...(defaultQuietHoursEnd !== undefined ? { defaultQuietHoursEnd: toTime(defaultQuietHoursEnd) } : {})
  };
}

const LIST = { sortable: Object.values(Prisma.NotificationCategoryScalarFieldEnum), searchFields: ['name', 'code', 'description'] };

class NotificationCategoryRepository extends PrismaRepository {
  async findById(notificationCategoryId: string): Promise<NotificationCategoryRow | null> {
    const row = await (await this.db()).notificationCategory.findUnique({ where: { notificationCategoryId } });
    return row && toCategoryRow(row);
  }

  async findByCode(code: string): Promise<NotificationCategoryRow | null> {
    const row = await (await this.db()).notificationCategory.findUnique({ where: { code } });
    return row && toCategoryRow(row);
  }

  async codeExists(code: string): Promise<boolean> {
    return (await (await this.db()).notificationCategory.count({ where: { code } })) > 0;
  }

  /** Categorías activas ordenadas para pintar la pantalla de preferencias del usuario. */
  async findAllActive(): Promise<NotificationCategoryRow[]> {
    const rows = await (await this.db()).notificationCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
    return rows.map(toCategoryRow);
  }

  /** Listado paginado para el admin. Filtros: isActive, isCritical. */
  async findAllPaginated(
    filters: PrismaRepository.Filters = {},
    pagination: PrismaRepository.PaginationParams = {},
    searchTerm: string | null = null
  ): Promise<PrismaRepository.Page<NotificationCategoryRow>> {
    const { where, page } = this.listQuery(filters, pagination, searchTerm, LIST);
    if (filters.isCritical !== undefined) {
      where.isCritical = filters.isCritical;
    }
    const db = await this.db();
    const [rows, count] = await Promise.all([
      db.notificationCategory.findMany({ where: where as Prisma.NotificationCategoryWhereInput, ...page }),
      db.notificationCategory.count({ where: where as Prisma.NotificationCategoryWhereInput })
    ]);
    return { rows: rows.map(toCategoryRow), count };
  }

  async create(data: NotificationCategoryInput & { code: string; name: string }): Promise<NotificationCategoryRow> {
    const row = await (await this.db()).notificationCategory.create({ data: toData(data) as Prisma.NotificationCategoryUncheckedCreateInput });
    return toCategoryRow(row);
  }

  /** null si la fila ya no existe. */
  async update(notificationCategoryId: string, data: NotificationCategoryInput): Promise<NotificationCategoryRow | null> {
    const [row] = await (await this.db()).notificationCategory.updateManyAndReturn({ where: { notificationCategoryId }, data: toData(data) });
    return row ? toCategoryRow(row) : null;
  }

  /** Cantidad de filas borradas (0 si no existía). */
  async delete(notificationCategoryId: string): Promise<number> {
    return (await (await this.db()).notificationCategory.deleteMany({ where: { notificationCategoryId } })).count;
  }
}

export default new NotificationCategoryRepository();
