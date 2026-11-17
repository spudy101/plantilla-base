// shared/repositories/append-only.repository.ts
//
// ============================================================
// APPEND-ONLY REPOSITORY — lecturas + inserción (SOLID: L e I)
// ============================================================
// Para tablas donde los registros nunca se modifican ni se borran desde la
// aplicación (ej. `audit_logs`, protegida además por un trigger de BD).
// No hereda `update`/`delete`, así que ningún consumidor puede llamarlos y
// no hace falta sobrescribirlos para lanzar error.
// ============================================================
import type { Attributes, BulkCreateOptions, CreateOptions, CreationAttributes, Model } from 'sequelize';
import ReadRepository from './read.repository';

class AppendOnlyRepository<M extends Model = Model> extends ReadRepository<M> {
  create(data: CreationAttributes<M>, options: CreateOptions<Attributes<M>> = {}): Promise<M> {
    return this.model.create(data, options);
  }

  bulkCreate(data: ReadonlyArray<CreationAttributes<M>>, options: BulkCreateOptions<Attributes<M>> = {}): Promise<M[]> {
    return this.model.bulkCreate(data, options);
  }
}

export default AppendOnlyRepository;
