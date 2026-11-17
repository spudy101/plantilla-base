// shared/repositories/base.repository.ts
//
// CRUD completo = lecturas (ReadRepository) + escrituras.
// Es la clase base por defecto para los repositorios del proyecto.
import type {
  Attributes,
  BulkCreateOptions,
  CreateOptions,
  CreationAttributes,
  DestroyOptions,
  InstanceUpdateOptions,
  Model,
  UpdateOptions,
  WhereOptions
} from 'sequelize';
import ReadRepository from './read.repository';

class BaseRepository<M extends Model = Model> extends ReadRepository<M> {
  // ─── Writes ───────────────────────────────────────────────────────────────

  create(data: CreationAttributes<M>, options: CreateOptions<Attributes<M>> = {}): Promise<M> {
    return this.model.create(data, options);
  }

  /** Actualiza por id. Devuelve la instancia actualizada o null si no existe. Acepta { transaction }. */
  async update(
    id: unknown,
    data: Partial<Attributes<M>>,
    options: InstanceUpdateOptions<Attributes<M>> = {}
  ): Promise<M | null> {
    const instance = await this.findById(id, options);
    if (!instance) {
      return null;
    }
    return instance.update(data, options);
  }

  delete(id: unknown, options: Omit<DestroyOptions<Attributes<M>>, 'where'> = {}): Promise<number> {
    return this.model.destroy({
      where: { [this.model.primaryKeyAttribute]: id } as WhereOptions<Attributes<M>>,
      ...options
    });
  }

  bulkCreate(data: ReadonlyArray<CreationAttributes<M>>, options: BulkCreateOptions<Attributes<M>> = {}): Promise<M[]> {
    return this.model.bulkCreate(data, options);
  }

  bulkUpdate(
    data: Partial<Attributes<M>>,
    criteria: WhereOptions<Attributes<M>>,
    options: Omit<UpdateOptions<Attributes<M>>, 'where'> = {}
  ): Promise<[affectedCount: number]> {
    return this.model.update(data, { where: criteria, ...options });
  }

  bulkDelete(criteria: WhereOptions<Attributes<M>>, options: Omit<DestroyOptions<Attributes<M>>, 'where'> = {}): Promise<number> {
    return this.model.destroy({ where: criteria, ...options });
  }
}

export default BaseRepository;
