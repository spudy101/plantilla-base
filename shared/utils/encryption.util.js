// src/utils/encryption.util.js
// ACTUALIZADO: correcciones de seguridad importantes
//
// Cambios:
//   1. encrypt() ahora usa IV ALEATORIO por operación (no el IV fijo del .env)
//      Formato de salida: `${ivHex}:${ciphertextHex}` (self-contained)
//   2. decrypt() detecta automáticamente si recibe formato nuevo o legado
//   3. AES_IV del .env ya NO se usa para cifrado (solo compatibilidad legado)
//   4. Algoritmo cambiado a AES-256-GCM (AEAD — integridad garantizada)
//      para nuevos cifrados. CBC mantenido para decrypt legado.
//   5. generateHmac() → nueva firma para timestamp validation en mobile
//      (reemplaza el AES-encrypt del timestamp)
//
// IMPORTANTE PARA EL MOBILE:
//   El x-timestamp ya no se envía cifrado con AES.
//   El mobile envía:
//     - Header x-timestamp: <unix ms en texto plano>
//     - Header x-signature: HMAC-SHA256(timestamp + ':' + method + ':' + path, HMAC_SECRET)
//   El HMAC_SECRET se configura en Secrets Manager y el mobile lo obtiene
//   de forma segura en el primer login o a través del backend.

const crypto = require('node:crypto');
const { encryption } = require('../constants');

const AES_KEY = Buffer.from(encryption.aesKey, 'hex'); // 32 bytes
const ALGORITHM = encryption.algorithm; // Viene de ENCRYPTION_ALGORITHM (.env) o default 'aes-256-gcm'
const LEGACY_ALGO = 'aes-256-cbc'; // Para descifrar datos existentes en BD — siempre fijo
const API_KEY_RANDOM_BYTES = 12;
const FORMATE_TYPE = 3;

// El IV del .env ya no se usa para cifrado nuevo.
// Se mantiene solo para descifrar datos legado que tenían IV fijo.
const LEGACY_IV = Buffer.from(encryption.aesIv, 'hex'); // 16 bytes

class EncryptionUtil {
  // ============================================================
  // CIFRADO/DESCIFRADO DE CAMPOS SENSIBLES EN BD
  // ============================================================

  /**
   * Cifra datos con AES-256-GCM usando un IV aleatorio por operación.
   * Formato de salida: `${iv}:${authTag}:${ciphertext}` (todo en hex)
   *
   * Este formato es self-contained: para descifrar solo necesitas la llave.
   * No necesitas el IV del .env.
   *
   * Uso: cifrar nationalId, números de cuenta, datos sensibles en BD.
   *
   * @param {string} data - Texto plano a cifrar
   * @returns {string}    - `ivHex:authTagHex:ciphertextHex`
   */
  static encrypt(data) {
    if (data === null || data === undefined) {
      return data;
    }

    const iv = crypto.randomBytes(API_KEY_RANDOM_BYTES); // GCM recomienda 12 bytes
    const cipher = crypto.createCipheriv(ALGORITHM, AES_KEY, iv);

    const ciphertext = Buffer.concat([cipher.update(String(data), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  /**
   * Descifra datos. Detecta automáticamente formato nuevo (GCM) o legado (CBC).
   *
   * Formato nuevo (GCM):  `ivHex:authTagHex:ciphertextHex` (3 partes con ':')
   * Formato legado (CBC): `ciphertextHex` (sin separadores, IV fijo del .env)
   *
   * @param {string} encryptedData
   * @returns {string} Texto plano
   */
  static decrypt(encryptedData) {
    if (!encryptedData) {
      return encryptedData;
    }

    const parts = encryptedData.split(':');

    // Formato nuevo: iv:authTag:ciphertext
    if (parts.length === FORMATE_TYPE) {
      return EncryptionUtil._decryptGcm(parts[0], parts[1], parts[2]);
    }

    // Formato legado: ciphertext solo (IV fijo del .env, AES-CBC)
    return EncryptionUtil._decryptLegacyCbc(encryptedData);
  }

  /**
   * @private
   */
  static _decryptGcm(ivHex, authTagHex, ciphertextHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, AES_KEY, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /**
   * @private — Solo para datos existentes en BD con formato antiguo
   */
  static _decryptLegacyCbc(ciphertextHex) {
    const decipher = crypto.createDecipheriv(LEGACY_ALGO, AES_KEY, LEGACY_IV);
    return decipher.update(ciphertextHex, 'hex', 'utf8') + decipher.final('utf8');
  }

  // ============================================================
  // HMAC — validación de requests desde mobile (anti-replay)
  // ============================================================

  /**
   * Genera un HMAC-SHA256 para firmar requests del mobile.
   *
   * El mobile llama a esta función con su HMAC_SECRET para generar
   * la firma del header x-signature.
   *
   * Firma sobre: `${timestamp}:${method}:${path}`
   * Ejemplo:     `1736000000000:POST:/api/v1/transactions`
   *
   * @param {string|number} timestamp - Unix ms (Date.now())
   * @param {string} method           - HTTP method en mayúsculas
   * @param {string} path             - Path de la URL (sin query string)
   * @param {string} secret           - HMAC_SECRET del Secrets Manager
   * @returns {string} HMAC en hex
   */
  static generateRequestHmac(timestamp, method, path, secret) {
    const payload = `${timestamp}:${method.toUpperCase()}:${path}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verifica un HMAC de request.
   * Usa comparación en tiempo constante para evitar timing attacks.
   *
   * @param {string} received  - HMAC recibido en x-signature
   * @param {string} expected  - HMAC calculado localmente
   * @returns {boolean}
   */
  static verifyRequestHmac(received, expected) {
    if (!received || !expected) {
      return false;
    }
    try {
      const a = Buffer.from(received, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length) {
        return false;
      }
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // ============================================================
  // UTILIDADES GENERALES
  // ============================================================

  /**
   * Descifra silenciosamente — retorna el valor original si falla (datos no cifrados o nulos).
   * Usar en DTOs donde el hook afterFind puede no haberse ejecutado en modelos anidados.
   */
  static safeDecrypt(value) {
    if (!value) {
      return value;
    }
    try {
      return EncryptionUtil.decrypt(value);
    } catch {
      return value;
    }
  }

  /**
   * Genera un hash SHA-256 (para referencias, no para contraseñas).
   */
  static generateHash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(String(data)).digest('hex');
  }

  /**
   * Genera un HMAC genérico.
   */
  static generateHmac(data, secret, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, secret).update(String(data)).digest('hex');
  }

  /**
   * Genera un string aleatorio seguro en hex.
   */
  static generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

module.exports = EncryptionUtil;
