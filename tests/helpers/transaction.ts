// tests/helpers/transaction.ts
//
// Doble de `sequelize.transaction()` para tests que mockean shared/models. El Unit of Work usa la forma
// gestionada (`transaction(options, work)`); esto reproduce lo que hace Sequelize con ella: ejecuta
// `work(tx)`, llama a `tx.commit()` si termina bien y a `tx.rollback()` si lanza (y relanza). Así las
// aserciones sobre commit/rollback del `tx` falso siguen diciendo lo mismo que antes.
//
//   sequelize.transaction.mockImplementation(managedTransaction(tx));

interface FakeTransaction {
  commit?: () => unknown;
  rollback?: () => unknown;
}

type Work = (tx: unknown) => unknown;

export function managedTransaction<T extends FakeTransaction>(tx: T) {
  return async (optionsOrWork?: unknown, maybeWork?: unknown): Promise<unknown> => {
    const work = (typeof optionsOrWork === 'function' ? optionsOrWork : maybeWork) as Work | undefined;
    if (!work) {
      return tx; // forma manual (ya no la usa la app; se mantiene por compatibilidad)
    }
    try {
      const result = await work(tx);
      await tx.commit?.();
      return result;
    } catch (error) {
      await tx.rollback?.();
      throw error;
    }
  };
}

export default { managedTransaction };
