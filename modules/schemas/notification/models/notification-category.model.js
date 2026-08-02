const { DataTypes } = require('sequelize');
const { database } = require('../../../../shared/constants');

// Categoría (grupo) de notificaciones — la capa que gestiona el admin y a la que apuntan las
// preferencias del usuario. Es la FUENTE DE VERDAD de los canales (email/sms/push), del "no molestar"
// (quiet hours / DND) y de la presentación base del email (email_layout_template con placeholder
// {{content}}). Cada NotificationType (evento) pertenece a una categoría y solo aporta su contenido.

module.exports = sequelize => {
  const NotificationCategory = sequelize.define(
    'NotificationCategory',
    {
      notification_category_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },

      code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
      },

      name: {
        type: DataTypes.STRING(200),
        allowNull: false
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      // ── Canales soportados por la categoría (mandan sobre el envío) ──
      supports_push: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      supports_email: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      supports_sms: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      // ── No molestar (DND) ──
      // allow_dnd=false → el usuario NO puede silenciar esta categoría (se ignora su quiet hours).
      allow_dnd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },

      // is_critical=true → emergencia: ignora quiet hours y no es silenciable por el usuario.
      is_critical: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },

      default_quiet_hours_start: {
        type: DataTypes.TIME,
        allowNull: true
      },

      default_quiet_hours_end: {
        type: DataTypes.TIME,
        allowNull: true
      },

      priority: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'normal'
      },

      // Layout HTML+CSS base del email. Debe contener el placeholder {{content}} donde se inyecta
      // el email_body_template (fragmento) del NotificationType. Si es null, el body del tipo se
      // envía tal cual (compatibilidad con los tipos cuyo body ya es un documento HTML completo).
      email_layout_template: {
        type: DataTypes.TEXT,
        allowNull: true
      },

      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'notification_categories',
      schema: database.schema,
      timestamps: true
    }
  );

  NotificationCategory.associate = models => {
    NotificationCategory.hasMany(models.NotificationType, {
      foreignKey: 'notification_category_id',
      as: 'notification_types',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    NotificationCategory.hasMany(models.UserNotificationPreference, {
      foreignKey: 'notification_category_code',
      sourceKey: 'code',
      as: 'user_preferences',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return NotificationCategory;
};
