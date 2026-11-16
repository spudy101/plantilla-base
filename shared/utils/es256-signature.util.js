// shared/utils/es256-signature.util.js
//
// Verificación de firmas ES256 (ECDSA P-256 + SHA-256) para credenciales biométricas.
// Puro: sin BD ni estado. Extraído de AuthBiometricService (SOLID: S) — la criptografía
// cambia por razones distintas que el flujo de enrolamiento/login.

const crypto = require('node:crypto');
const { logger } = require('./logger.util');

const ES256_RAW_SIGNATURE_LEN = 64; // firma raw r||s: 32 bytes r + 32 bytes s
const ES256_COMPONENT_LEN = 32; // longitud de r y s individualmente
const DER_POSITIVE_PAD = 0x80; // bit MSB: si está activo, el entero es negativo en DER
const DER_INTEGER_TAG = 0x02; // tag ASN.1 INTEGER
const DER_SEQUENCE_TAG = 0x30; // tag ASN.1 SEQUENCE
const PEM_LINE_LENGTH = 64; // caracteres por línea en PEM

/**
 * Convierte una llave pública DER (base64) a formato PEM.
 * @param {string} base64Der
 * @returns {string}
 */
function derToPem(base64Der) {
  const regex = new RegExp(`.{1,${PEM_LINE_LENGTH}}`, 'g');
  const lines = base64Der.match(regex).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

/**
 * Convierte una firma raw (r||s, 64 bytes) a formato DER.
 * Los dispositivos móviles a veces envían la firma en formato raw.
 * @param {Buffer} rawSignature
 * @returns {Buffer}
 */
function rawToDer(rawSignature) {
  const r = rawSignature.subarray(0, ES256_COMPONENT_LEN);
  const s = rawSignature.subarray(ES256_COMPONENT_LEN, ES256_RAW_SIGNATURE_LEN);

  const encodeInt = buf => {
    // Si el bit más significativo es 1, agregar byte 0x00 para indicar positivo
    const needsPad = buf[0] & DER_POSITIVE_PAD;
    const padded = needsPad ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
    return Buffer.concat([Buffer.from([DER_INTEGER_TAG, padded.length]), padded]);
  };

  const seq = Buffer.concat([encodeInt(r), encodeInt(s)]);
  return Buffer.concat([Buffer.from([DER_SEQUENCE_TAG, seq.length]), seq]);
}

/**
 * Verifica una firma ES256 del challenge con la llave pública registrada.
 *
 * @param {{ publicKey: string, challenge: string, signature: string }} params
 *   - publicKey:  llave pública en base64 (SubjectPublicKeyInfo / DER) o PEM
 *   - challenge:  string base64url que fue firmado
 *   - signature:  firma en base64url (DER o raw r||s de 64 bytes)
 * @returns {boolean} false ante firma inválida o datos corruptos (nunca lanza)
 */
function verifyEs256Signature({ publicKey, challenge, signature }) {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(Buffer.from(challenge, 'base64url'));

    const pemKey = publicKey.startsWith('-----') ? publicKey : derToPem(publicKey);

    const signatureBuffer = Buffer.from(signature, 'base64url');
    const derSignature = signatureBuffer.length === ES256_RAW_SIGNATURE_LEN ? rawToDer(signatureBuffer) : signatureBuffer;

    return verify.verify(pemKey, derSignature);
  } catch (error) {
    logger.info('Biometric signature verification error', { error: error.message });
    return false;
  }
}

module.exports = { verifyEs256Signature, derToPem, rawToDer };
