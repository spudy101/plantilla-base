const { database } = require('../shared/constants');

const SCHEMA = database.schema;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { tableName: 'user_trusted_devices', schema: SCHEMA },
      {
        user_trusted_device_id: {
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
          comment: 'Usuario propietario del dispositivo'
        },

        // ── Identificación ───────────────────────────────────────
        fingerprint_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
          comment: 'SHA-256 del User-Agent normalizado (sin IP)'
        },
        device_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'Generado automáticamente desde User-Agent, editable por el usuario'
        },

        // ── Estado ───────────────────────────────────────────────
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'pending',
          comment: 'pending | trusted | blocked'
        },

        // ── Info de red y geo ────────────────────────────────────
        ip_address: {
          type: Sequelize.STRING(45), // cubre IPv4 e IPv6
          allowNull: true,
          comment: 'IP desde la que se registró el dispositivo por primera vez'
        },
        city: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Ciudad geolocalizada desde ip_address'
        },
        country: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'País geolocalizado desde ip_address'
        },
        country_code: {
          type: Sequelize.STRING(5),
          allowNull: true,
          comment: 'Código ISO del país (ej: CL, AR, US)'
        },

        // ── Info del User-Agent ──────────────────────────────────
        browser: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Navegador parseado del User-Agent (ej: Chrome, Safari)'
        },
        os: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Sistema operativo parseado del User-Agent (ej: Windows, iOS)'
        },
        device_type: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'desktop',
          comment: 'mobile | tablet | desktop'
        },
        hmac_secret: {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment:
            'Secret HMAC único por dispositivo cifrado AES-256-GCM — entregado al mobile en el login para firmar requests anti-replay'
        },

        // ── Aprobación ───────────────────────────────────────────
        approved_by_device_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'user_trusted_devices', schema: SCHEMA },
            key: 'user_trusted_device_id'
          },
          onUpdate: 'SET NULL',
          onDelete: 'SET NULL',
          comment: 'Dispositivo TRUSTED desde el que se aprobó este dispositivo'
        },
        approved_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Fecha en que un dispositivo trusted aprobó este dispositivo'
        },

        // ── Bloqueo ──────────────────────────────────────────────
        blocked_by_device_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: { tableName: 'user_trusted_devices', schema: SCHEMA },
            key: 'user_trusted_device_id'
          },
          onUpdate: 'SET NULL',
          onDelete: 'SET NULL',
          comment: 'Dispositivo TRUSTED que ejecutó el bloqueo'
        },
        blocked_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Fecha en que el dispositivo fue bloqueado'
        },

        // ── Timestamps de actividad ──────────────────────────────
        trusted_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Fecha en que el dispositivo pasó a estado trusted (null si aún es pending)'
        },
        last_seen_at: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: 'Último acceso detectado desde este dispositivo'
        },

        // ── Trazabilidad de sesión. OJO: el dispositivo se registra DURANTE el login, antes de que la
        //    sesión exista — y de hecho es su padre (user_sessions.device_id apunta acá). origin_session_id
        //    queda null por diseño; el correlationId es el que ata la fila al request de login ──
        origin_session_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: 'session_id de auth que registró el dispositivo'
        },
        origin_correlation_id: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'correlationId del request que registró el dispositivo'
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

    // ── Índices ──────────────────────────────────────────────────

    // Evita duplicados: un mismo dispositivo no puede registrarse dos veces por usuario
    await queryInterface.addIndex({ tableName: 'user_trusted_devices', schema: SCHEMA }, ['user_id', 'fingerprint_hash'], {
      unique: true,
      name: 'uq_user_trusted_devices_user_fingerprint'
    });

    await queryInterface.addIndex({ tableName: 'user_trusted_devices', schema: SCHEMA }, ['user_id'], {
      name: 'idx_user_trusted_devices_user_id'
    });

    await queryInterface.addIndex({ tableName: 'user_trusted_devices', schema: SCHEMA }, ['fingerprint_hash'], {
      name: 'idx_user_trusted_devices_fingerprint_hash'
    });

    await queryInterface.addIndex({ tableName: 'user_trusted_devices', schema: SCHEMA }, ['last_seen_at'], {
      name: 'idx_user_trusted_devices_last_seen_at'
    });

    // Índice para consultar rápido todos los PENDING de un usuario
    await queryInterface.addIndex({ tableName: 'user_trusted_devices', schema: SCHEMA }, ['user_id', 'status'], {
      name: 'idx_user_trusted_devices_user_status'
    });

    await queryInterface.addIndex({ tableName: 'user_trusted_devices', schema: SCHEMA }, ['origin_session_id'], {
      name: 'idx_user_trusted_devices_origin_session_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ tableName: 'user_trusted_devices', schema: SCHEMA });
  }
};
