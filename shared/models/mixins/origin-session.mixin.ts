// ============================================================================
// TRAZABILIDAD DE SESIÓN — mixin central de origin_session_id
// ============================================================================
// Ata cada fila de dominio a la sesión de usuario que la originó (y a su correlationId), como red
// de seguridad del session-trace (índice inverso fila → sesión: ante una reclamación, la fila
// apunta a la sesión, y la sesión a su dispositivo/IP/ventana temporal).
//
// Dos piezas:
//   1. Helpers de columnas — para reusar la MISMA definición en modelos y migraciones sin copiar.
//   2. stampOriginSession() — el hook que las rellena solo. Se registra UNA vez en shared/models
//      (beforeCreate/beforeBulkCreate global), así CUALQUIER modelo que declare la columna la hereda
//      automáticamente: agregar una tabla nueva = declarar la columna, nada más.
//
// Reglas:
//   - Se estampa al CREAR, nunca al actualizar (un retry de admin/worker corre en otro contexto y no
//     debe pisar el origen real).
//   - Un valor explícito del call-site SIEMPRE gana (login/biométrico pasan el sessionId recién
//     creado a mano, cuando el contexto todavía no lo tiene).
//   - null en workers/sistema y en flujos sin sesión (registro público, "olvidé mi contraseña"):
//     por eso las columnas son nullable.
import sequelizeModule from 'sequelize';
const { DataTypes } = sequelizeModule;
import type { Model } from 'sequelize';
import requestContext from '../../utils/request-context.util';

const ORIGIN_CORRELATION_MAX_LENGTH = 128;

// Campos para DEFINICIÓN DE MODELO (sequelize.define). Spread dentro del objeto de atributos.
function originSessionModelFields() {
  return {
    origin_session_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    origin_correlation_id: {
      type: DataTypes.STRING(ORIGIN_CORRELATION_MAX_LENGTH),
      allowNull: true
    }
  };
}

// Campos equivalentes para MIGRACIONES (queryInterface.createTable). Recibe el `Sequelize` del
// migration. Spread dentro del objeto de columnas del createTable.
function originSessionMigrationColumns(Sequelize: Pick<typeof sequelizeModule, 'UUID' | 'STRING'>) {
  return {
    origin_session_id: {
      type: Sequelize.UUID,
      allowNull: true
    },
    origin_correlation_id: {
      type: Sequelize.STRING(ORIGIN_CORRELATION_MAX_LENGTH),
      allowNull: true
    }
  };
}

// Hook central. Rellena origin_session_id/origin_correlation_id desde el contexto de request SI el
// modelo declara esas columnas y no vienen ya seteadas. No-op para modelos sin la columna.
/** Instancia de cualquier modelo: se leen/escriben las columnas de origen si el modelo las declara. */
type OriginStampable = Model & { origin_session_id?: string | null; origin_correlation_id?: string | null };

function stampOriginSession(instance: Model): void {
  const target = instance as OriginStampable;
  const attrs = (target?.constructor as { rawAttributes?: Record<string, unknown> } | undefined)?.rawAttributes;
  if (!attrs || !attrs.origin_session_id) {
    return;
  }

  const origin = requestContext.originFromContext();

  if (target.origin_session_id == null && origin.origin_session_id != null) {
    target.origin_session_id = origin.origin_session_id;
  }
  if (attrs.origin_correlation_id && target.origin_correlation_id == null && origin.origin_correlation_id != null) {
    target.origin_correlation_id = origin.origin_correlation_id;
  }
}

export default {
  originSessionModelFields,
  originSessionMigrationColumns,
  stampOriginSession
};
