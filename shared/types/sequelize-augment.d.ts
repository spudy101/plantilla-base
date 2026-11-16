// shared/types/sequelize-augment.d.ts
//
// Propiedades que Sequelize 6 asigna en runtime pero no declara en sus tipos.

declare module 'sequelize' {
  interface Transaction {
    /** 'commit' | 'rollback' una vez cerrada; undefined mientras está abierta. */
    readonly finished?: 'commit' | 'rollback';
  }
}

export {};
