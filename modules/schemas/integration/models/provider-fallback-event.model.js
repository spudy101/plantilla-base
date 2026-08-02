const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

// Historial de ventanas de fallback: cada vez que el circuit breaker de un producto se ABRE se
// crea una fila (started_at); al CERRARSE se completa (ended_at + duración). Da el "tiempo de
// caída" y el historial de indisponibilidad por proveedor que consume el dashboard.
module.exports = sequelize => {
  const ProviderFallbackEvent = sequelize.define(
    'ProviderFallbackEvent',
    {
      fallback_event_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      provider: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Proveedor/servicio (ej: aws_ses, aws_sns, aws_sms, aws_s3)'
      },

      circuit_product: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: 'Código de producto en el circuit breaker (ej: ses, sns, aws_sms)'
      },

      started_at: {
        type: DataTypes.DATE,
        allowNull: false
      },

      ended_at: {
        type: DataTypes.DATE,
        allowNull: true
      },

      affected_processes_count: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Best-effort: procesos que quedaron en fallo durante la ventana'
      },

      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      }
    },
    {
      tableName: 'provider_fallback_events',
      schema: database.schema,
      timestamps: true,
      underscored: true
    }
  );

  return ProviderFallbackEvent;
};
