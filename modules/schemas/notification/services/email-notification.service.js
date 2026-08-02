const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const { logger, logAudit } = require('../../../../shared/utils/logger.util');
const { notifications, aws } = require('../../../../shared/constants');
const { withRetry } = require('../../../../shared/utils/retry.util');
const CircuitBreaker = require('../../../../shared/utils/circuit-breaker.util');
const ProviderApiLogger = require('../../../../shared/utils/integration-api-logger.util');
const { resolveAwsGate, awsErrorCode } = require('../../../../shared/utils/aws-provider-meta.util');
const MaskingUtil = require('../../../../shared/utils/masking.util');
const emailSuppressionService = require('./email-suppression.service');

// Límite de tamaño del mensaje raw de SES (SendRawEmailCommand): 10 MB incluyendo adjuntos en base64.
const SES_RAW_MAX_BYTES = 10 * 1024 * 1024;

class EmailNotificationService {
  // Lazy getter: SESClient se instancia la primera vez que se usa,
  // no al hacer require(). Esto evita que aws.region sea undefined
  // en tests donde los mocks aún no están listos al momento del require().
  get sesClient() {
    if (!this._sesClient) {
      this._sesClient = new SESClient({
        region: aws.region,
        credentials: {
          accessKeyId: aws.accessKeyId,
          secretAccessKey: aws.secretAccessKey
        },
        requestTimeout: 30_000
      });
    }
    return this._sesClient;
  }

  /**
   * Envía un email usando los templates de un notification_type
   * @param {string} destinatario       - Email del destinatario
   * @param {Object} notificationType   - Objeto con los templates del notification_type
   * @param {Object} datos              - Datos para reemplazar en los templates
   * @param {string} [notificationId]   - Para correlacionar el log de integración con la notificación
   */
  async enviarNotificacion(destinatario, notificationType, datos, notificationId = null) {
    try {
      // El soporte de email lo define la CATEGORÍA del tipo (fuente de verdad).
      const category = notificationType.category || null;
      if (!(category?.supports_email ?? true)) {
        logger.warn('La categoría de la notificación no soporta email', {
          notificationType: notificationType.code
        });
        return null;
      }

      if (!notificationType.email_subject_template || !notificationType.email_body_template) {
        logger.warn('El tipo de notificación no tiene templates de email configurados', {
          notificationType: notificationType.code
        });
        return null;
      }

      const asunto = this._reemplazarVariables(notificationType.email_subject_template, datos);
      const contenido = this._reemplazarVariables(notificationType.email_body_template, datos);
      const cuerpoHtml = this._envolverEnLayout(contenido, category, datos);

      // Los adjuntos (ej: un PDF de comprobante) viajan en metadata.attachments y son específicos
      // del envío, no del tipo: el mismo diseño de email se reutiliza lleve o no adjunto. Si hay
      // adjuntos válidos se usa la ruta raw (SendRawEmail); si no, el envío simple de siempre.
      const adjuntos = this._resolverAdjuntos(datos);
      if (adjuntos.length > 0) {
        return await this.enviarEmailConAdjuntos(destinatario, asunto, cuerpoHtml, adjuntos, notificationId);
      }

      return await this.enviarEmail(destinatario, asunto, cuerpoHtml, '', notificationId);
    } catch (error) {
      logger.warn('Error al enviar notificación por email', {
        error: error.message,
        destinatario,
        notificationType: notificationType.code
      });
      throw error;
    }
  }

  /**
   * Envía un email usando AWS SES
   * @param {string} destinatario - Email del destinatario
   * @param {string} asunto       - Asunto del email
   * @param {string} cuerpoHtml   - Cuerpo del email en HTML
   * @param {string} cuerpoTexto  - Cuerpo del email en texto plano (opcional)
   * @param {string} [notificationId] - Para correlacionar el log de integración con la notificación
   */
  async enviarEmail(destinatario, asunto, cuerpoHtml, cuerpoTexto = '', notificationId = null) {
    // Suppression list: si la dirección acumuló rebotes duros no se envía (protege la reputación
    // de envío de SES). No es un error de envío — se omite silenciosamente y se audita.
    if (await emailSuppressionService.isSuppressed(destinatario)) {
      logger.warn('[EmailNotification] Envío omitido: dirección suprimida por rebotes duros', {
        destinatario: MaskingUtil.maskEmail(destinatario)
      });
      logAudit(
        'EMAIL_SUPPRESSED_SEND_SKIPPED',
        'system',
        { maskedEmail: MaskingUtil.maskEmail(destinatario), notificationId },
        { entityType: 'EmailBounceSuppression', entityTable: 'email_bounce_suppressions' }
      );
      return null;
    }

    const allowed = await CircuitBreaker.canCall('ses');
    if (!allowed) {
      throw new Error('Servicio de email no disponible temporalmente (circuit breaker abierto)');
    }

    const { integrationId, unitCost } = await resolveAwsGate('aws_ses');
    const startTime = Date.now();
    try {
      const params = {
        Source: notifications.ses.fromEmail,
        Destination: { ToAddresses: [destinatario] },
        Message: {
          Subject: { Data: asunto, Charset: 'UTF-8' },
          Body: {
            Html: { Data: cuerpoHtml, Charset: 'UTF-8' },
            ...(cuerpoTexto && {
              Text: { Data: cuerpoTexto, Charset: 'UTF-8' }
            })
          }
        }
      };

      const command = new SendEmailCommand(params);
      const response = await withRetry(() => this.sesClient.send(command), {
        maxRetries: 3,
        baseDelayMs: 1000,
        label: 'SES[enviarEmail]'
      });

      await CircuitBreaker.recordSuccess('ses');
      ProviderApiLogger.log({
        product: 'ses',
        endpoint: 'SES:SendEmailCommand',
        result: 'success',
        responseTimeMs: Date.now() - startTime,
        integrationId,
        unitCost,
        notificationId
      });
      logger.info('Email enviado exitosamente', { destinatario, messageId: response.MessageId });
      return response;
    } catch (error) {
      await CircuitBreaker.recordFailure('ses');
      ProviderApiLogger.log({
        product: 'ses',
        endpoint: 'SES:SendEmailCommand',
        result: 'failed',
        responseTimeMs: Date.now() - startTime,
        integrationId,
        errorCode: awsErrorCode(error),
        errorMessage: error.message,
        notificationId
      });
      logger.warn('Error al enviar email (reintentos agotados)', { error: error.message, destinatario, asunto });
      throw error;
    }
  }

  /**
   * Envía un email con uno o más archivos adjuntos usando SES SendRawEmailCommand.
   * Ruta general para adjuntos (PDF, imágenes, etc.). Para emails sin adjunto usar enviarEmail().
   *
   * @param {string} destinatario - Email del destinatario
   * @param {string} asunto       - Asunto del email
   * @param {string} cuerpoHtml   - Cuerpo HTML del email
   * @param {Array<{ filename: string, contentType: string, base64: string }>} adjuntos - ya normalizados
   * @param {string} [notificationId] - Para correlacionar el log de integración con la notificación
   */
  async enviarEmailConAdjuntos(destinatario, asunto, cuerpoHtml, adjuntos, notificationId = null) {
    // Suppression list: misma protección de reputación que enviarEmail (rebotes duros → no se envía).
    if (await emailSuppressionService.isSuppressed(destinatario)) {
      logger.warn('[EmailNotification] Envío con adjuntos omitido: dirección suprimida por rebotes duros', {
        destinatario: MaskingUtil.maskEmail(destinatario)
      });
      logAudit(
        'EMAIL_SUPPRESSED_SEND_SKIPPED',
        'system',
        { maskedEmail: MaskingUtil.maskEmail(destinatario), notificationId },
        { entityType: 'EmailBounceSuppression', entityTable: 'email_bounce_suppressions' }
      );
      return null;
    }

    const allowed = await CircuitBreaker.canCall('ses');
    if (!allowed) {
      throw new Error('Servicio de email no disponible temporalmente (circuit breaker abierto)');
    }

    const rawEmail = this._construirMimeConAdjuntos(destinatario, asunto, cuerpoHtml, adjuntos);
    if (Buffer.byteLength(rawEmail) > SES_RAW_MAX_BYTES) {
      throw new Error('El email con adjuntos supera el límite de 10 MB de SES');
    }

    const command = new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(rawEmail) } });
    const { integrationId, unitCost } = await resolveAwsGate('aws_ses');
    const startTime = Date.now();
    try {
      const response = await withRetry(() => this.sesClient.send(command), {
        maxRetries: 3,
        baseDelayMs: 1000,
        label: 'SES[enviarEmailConAdjuntos]'
      });
      await CircuitBreaker.recordSuccess('ses');
      ProviderApiLogger.log({
        product: 'ses',
        endpoint: 'SES:SendRawEmailCommand',
        result: 'success',
        responseTimeMs: Date.now() - startTime,
        integrationId,
        unitCost,
        notificationId
      });
      logger.info('Email con adjuntos enviado exitosamente', {
        destinatario,
        adjuntos: adjuntos.length,
        messageId: response.MessageId
      });
      return response;
    } catch (error) {
      await CircuitBreaker.recordFailure('ses');
      ProviderApiLogger.log({
        product: 'ses',
        endpoint: 'SES:SendRawEmailCommand',
        result: 'failed',
        responseTimeMs: Date.now() - startTime,
        integrationId,
        errorCode: awsErrorCode(error),
        errorMessage: error.message,
        notificationId
      });
      logger.warn('Error al enviar email con adjuntos (reintentos agotados)', { error: error.message, destinatario });
      throw error;
    }
  }

  /**
   * Wrapper retrocompatible: envía un email con un único PDF adjunto.
   * @param {string} destinatario
   * @param {string} asunto
   * @param {string} cuerpoHtml
   * @param {Buffer} pdfBuffer
   * @param {string} pdfFilename
   */
  enviarEmailConPdf(destinatario, asunto, cuerpoHtml, pdfBuffer, pdfFilename) {
    const adjuntos = [
      { filename: pdfFilename, contentType: 'application/pdf', base64: pdfBuffer.toString('base64') }
    ];
    return this.enviarEmailConAdjuntos(destinatario, asunto, cuerpoHtml, adjuntos);
  }

  /**
   * Construye el mensaje MIME multipart/mixed (cuerpo HTML + N adjuntos), todo en base64 para
   * transportar UTF-8 y binarios sin corromperse.
   * @private
   */
  _construirMimeConAdjuntos(destinatario, asunto, cuerpoHtml, adjuntos) {
    const boundary = `BaseProjectMIME${Date.now()}`;
    const from = notifications.ses.fromEmail;
    const asuntoEncoded = `=?UTF-8?B?${Buffer.from(asunto).toString('base64')}?=`;

    const parts = [
      `From: ${from}`,
      `To: ${destinatario}`,
      `Subject: ${asuntoEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(cuerpoHtml, 'utf-8').toString('base64'),
      ''
    ];

    for (const adj of adjuntos) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${adj.contentType}`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${adj.filename}"`,
        '',
        adj.base64,
        ''
      );
    }

    parts.push(`--${boundary}--`);
    return parts.join('\r\n');
  }

  /**
   * Extrae y normaliza los adjuntos de la metadata de la notificación. Cada adjunto puede venir como
   * { filename, contentType, content }, donde content es un Buffer o un string ya en base64 (lo
   * habitual cuando la metadata llega como JSON). Los inválidos (sin filename o sin contenido) se
   * descartan. Extensión futura: soportar `url` para descargar el binario antes de adjuntar.
   * @private
   */
  _resolverAdjuntos(datos) {
    const raw = datos?.attachments;
    if (!Array.isArray(raw) || raw.length === 0) {
      return [];
    }
    return raw.map(a => this._normalizarAdjunto(a)).filter(Boolean);
  }

  /** @private */
  _normalizarAdjunto(adjunto) {
    if (!adjunto || !adjunto.filename) {
      return null;
    }

    let base64 = null;
    if (Buffer.isBuffer(adjunto.content)) {
      base64 = adjunto.content.toString('base64');
    } else if (typeof adjunto.content === 'string' && adjunto.content.length > 0) {
      // Se asume ya codificado en base64 (una metadata JSON no puede transportar un Buffer).
      base64 = adjunto.content;
    }

    if (!base64) {
      logger.warn('Adjunto de email ignorado: sin contenido válido', { filename: adjunto.filename });
      return null;
    }

    return {
      filename: adjunto.filename,
      contentType: adjunto.contentType || 'application/octet-stream',
      base64
    };
  }

  /**
   * Envuelve el contenido (fragmento) de un tipo dentro del layout base de su categoría.
   * El layout debe contener el placeholder {{content}}. Compatibilidad: si la categoría no tiene
   * layout, o si el contenido ya es un documento HTML completo (los templates heredados lo son),
   * se devuelve el contenido tal cual sin envolver.
   * @private
   */
  _envolverEnLayout(contenido, category, datos) {
    const layout = category?.email_layout_template;
    const yaEsDocumento = /<!doctype|<html/i.test(contenido);

    if (!layout || yaEsDocumento) {
      return contenido;
    }

    // split/join en vez de replace para evitar la interpretación de $-patterns si el contenido
    // trae '$'. Luego se resuelven las variables restantes del layout (ej: {{logoUrl}}).
    const html = layout.split('{{content}}').join(contenido);
    return this._reemplazarVariables(html, datos);
  }

  /**
   * Reemplaza variables {{variable}} en un template
   * @private
   */
  _reemplazarVariables(template, datos) {
    if (!template) {
      return '';
    }
    return template.replaceAll(/\{\{(\w+)\}\}/g, (match, variable) => {
      return datos[variable] ?? match;
    });
  }
}

module.exports = new EmailNotificationService();
