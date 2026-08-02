// tests/jest.setup.env.js
// Se ejecuta antes de cada archivo de test (setupFiles). Fija el entorno de test.
//
// Estrategia:
//   1. Carga `.env` si existe (desarrollo local — respeta tu config real).
//   2. Rellena SOLO como fallback (`??=`) las variables que `shared/constants/config.js`
//      exige al arrancar, con valores dummy válidos. Esto permite correr `npm test` en
//      un clone recién clonado o en CI, SIN necesidad de crear un `.env`.
//
// Los tests que necesitan llaves reales (jwt.util, encryption.util) generan las suyas
// propias; estos dummies solo sirven para que la validación de config no aborte.

require('dotenv').config();

process.env.NODE_ENV = 'test';

// ── Base de datos (en test el dialecto real es SQLite en memoria, ver config/database.js) ──
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_NAME ??= 'test_db';
process.env.DB_USER ??= 'test_user';
process.env.DB_PASSWORD ??= 'test_password';
process.env.DB_DIALECT ??= 'postgres';

// ── Cifrado (longitudes exactas exigidas por config.js) ──
process.env.AES_KEY ??= '0'.repeat(64); // 32 bytes hex
process.env.AES_IV ??= '0'.repeat(32); //  16 bytes hex
process.env.HASH_PEPPER ??= 'test-pepper-0000000000000000000000000000'; // >= 32 chars

// ── JWT RS256 (par efímero solo para test si no hay uno en el entorno) ──
if (!process.env.JWT_PRIVATE_KEY || !process.env.JWT_PUBLIC_KEY) {
  const { generateKeyPairSync } = require('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_PUBLIC_KEY = publicKey;
}

// ── AWS (los tests mockean los SDK; solo deben existir para pasar la validación) ──
process.env.AWS_REGION ??= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test-access-key-id';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test-secret-access-key';
process.env.BUCKET_NAME ??= 'test-private-bucket';
process.env.S3_PUBLIC_BUCKET_NAME ??= 'test-public-bucket';
process.env.CLOUDFRONT_DISTRIBUTION_ID ??= 'TEST_DISTRIBUTION_ID';
process.env.CLOUDFRONT_BASE_URL ??= 'https://test.cloudfront.net';

// ── Frontend ──
process.env.FRONTEND_RESET_URL ??= 'http://localhost:3000/reset';

// ── Workers apagados en test (evita timers/schedulers colgando la suite) ──
process.env.ENABLE_WORKERS ??= 'false';
