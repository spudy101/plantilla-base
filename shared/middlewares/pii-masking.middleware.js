// shared/middlewares/pii-masking.middleware.js

const MaskingUtil = require('../utils/masking.util');

/**
 * [RF-USR-01] | CA-06 | Red de seguridad de enmascaramiento PII.
 *
 * El enmascaramiento manda en la capa DTO (cada DTO enmascara en origen con MaskingUtil). Esta es
 * la segunda línea: ApiResponse.success() pasa TODA respuesta por `apply()`, de modo que un DTO
 * nuevo que olvide enmascarar no filtra el dato. Las máscaras son idempotentes
 * (`maskDocumentId('*******1234') === '*******1234'`), así que aplicar las dos capas no degrada
 * lo que el DTO ya enmascaró.
 *
 * Opt-out por ruta con `allowUnmasked()`: solo el flujo de registro, donde el usuario está
 * ingresando/confirmando sus propios datos y necesita verlos completos.
 */
class PiiMaskingMiddleware {
  /**
   * Marca la ruta como exenta: su respuesta sale con la PII completa.
   * Se monta en la cadena de la ruta, antes del controller.
   */
  static allowUnmasked() {
    return (req, res, next) => {
      res.locals.piiUnmasked = true;
      next();
    };
  }

  static isUnmasked(res) {
    return res?.locals?.piiUnmasked === true;
  }

  /**
   * Enmascara el payload de salida salvo que la ruta esté exenta.
   * Lo invoca ApiResponse.success(); no se monta como middleware de Express.
   */
  static apply(res, payload) {
    if (payload === null || payload === undefined || PiiMaskingMiddleware.isUnmasked(res)) {
      return payload;
    }
    return MaskingUtil.redactPayload(payload);
  }
}

module.exports = PiiMaskingMiddleware;
