import type { Migration } from '../shared/types/migration';
import constantsModule from '../shared/constants';
const { database } = constantsModule;

const SCHEMA = database.schema;

export default {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // user_biometric_credentials
    // ============================================================
    await queryInterface.createTable(
      { tableName: 'user_biometric_credentials', schema: SCHEMA },
      {
        biometric_credential_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'Usuario dueño de la credencial biométrica'
        },
        user_trusted_device_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: { tableName: 'user_trusted_devices', schema: SCHEMA },
            key: 'user_trusted_device_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'Dispositivo en el que está registrada la huella. Si se elimina el dispositivo, se elimina la credencial.'
        },
        credential_id: {
          type: Sequelize.TEXT,
          allowNull: false,
          unique: true,
          comment: 'ID único generado por el dispositivo móvil (base64url)'
        },
        public_key: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: 'Llave pública ES256 en formato PEM o base64, enviada por el dispositivo en el registro'
        },
        sign_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Contador de firmas — se incrementa en cada uso. Protege contra ataques de replay.'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'Permite desactivar una credencial sin eliminarla'
        },
        last_used_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Último login biométrico exitoso con esta credencial'
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'user_biometric_credentials', schema: SCHEMA }, ['user_id'], {
      name: 'idx_biometric_credentials_user_id'
    });

    await queryInterface.addIndex({ tableName: 'user_biometric_credentials', schema: SCHEMA }, ['user_trusted_device_id'], {
      name: 'idx_biometric_credentials_device_id'
    });

    await queryInterface.addIndex({ tableName: 'user_biometric_credentials', schema: SCHEMA }, ['credential_id'], {
      unique: true,
      name: 'uq_biometric_credentials_credential_id'
    });

    // ============================================================
    // biometric_challenges
    // ============================================================
    await queryInterface.createTable(
      { tableName: 'biometric_challenges', schema: SCHEMA },
      {
        challenge_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true, // null en register/start — aún no sabemos el usuario
          references: {
            model: { tableName: 'users', schema: SCHEMA },
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
          comment: 'Usuario al que pertenece el challenge. Null solo en register/start.'
        },
        challenge: {
          type: Sequelize.TEXT,
          allowNull: false,
          unique: true,
          comment: 'Nonce aleatorio en base64url. Firmado por el dispositivo para probar posesión de la llave privada.'
        },
        type: {
          type: Sequelize.STRING(20),
          allowNull: false,
          comment: 'registration | authentication'
        },
        used: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'true después de ser consumido — impide reutilización (replay attack)'
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: 'TTL del challenge — normalmente 5 minutos desde su creación'
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE
        }
      }
    );

    await queryInterface.addIndex({ tableName: 'biometric_challenges', schema: SCHEMA }, ['user_id'], {
      name: 'idx_biometric_challenges_user_id'
    });

    await queryInterface.addIndex({ tableName: 'biometric_challenges', schema: SCHEMA }, ['challenge'], {
      unique: true,
      name: 'uq_biometric_challenges_challenge'
    });

    await queryInterface.addIndex({ tableName: 'biometric_challenges', schema: SCHEMA }, ['expires_at'], {
      name: 'idx_biometric_challenges_expires_at'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'biometric_challenges', schema: SCHEMA });
    await queryInterface.dropTable({ tableName: 'user_biometric_credentials', schema: SCHEMA });
  }
} satisfies Migration;
