const { DataTypes } = require('sequelize');
const { database } = require('../../../../../shared/constants');

module.exports = sequelize => {
  const Department = sequelize.define(
    'Department',
    {
      department_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      country_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      // Código DANE numérico 2 dígitos (ej: '05' = Antioquia, '11' = Bogotá D.C.)
      // Requerido para reportes DIAN (Formato 1026 y otros)
      dane_code: {
        type: DataTypes.STRING(2),
        allowNull: true,
        comment: 'Código DANE numérico del departamento (2 dígitos). Requerido para reportes DIAN.'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'departments',
      schema: database.schema,
      timestamps: true
    }
  );

  Department.associate = models => {
    Department.belongsTo(models.Country, {
      foreignKey: 'country_id',
      as: 'country',
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  };

  return Department;
};
