const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const City = sequelize.define(
    'City',
    {
      city_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Código DANE numérico 3 dígitos (ej: '001' = capital del departamento)
      // Requerido para reportes DIAN (Formato 1026 y otros)
      dane_code: {
        type: DataTypes.STRING(3),
        allowNull: true,
        comment: 'Código DANE numérico del municipio (3 dígitos). Requerido para reportes DIAN.'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'cities',
      schema: database.schema,
      timestamps: true
    }
  );

  City.associate = models => {
    City.belongsTo(models.Department, {
      foreignKey: 'department_id',
      as: 'department',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    });
  };

  return City;
};
