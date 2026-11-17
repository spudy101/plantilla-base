import type defineNotificationType from '../models/notification-type.model';
// ============================================================
// NOTIFICATION CONTENT UTIL
// ============================================================
// Funciones puras para generación de contenido y prioridades.
// Absorbe notificationPriority.util.js — sin lógica de negocio,
// sin repositorios, reutilizable en cualquier contexto.

const PRIORITY_SCORES = {
  low: 3,
  normal: 5,
  high: 8,
  urgent: 10
};

const DEFAULT_PRIORITY_SCORE = PRIORITY_SCORES.normal;

class NotificationContentUtil {
  // ============================================================
  // CONTENT GENERATION
  // ============================================================

  /**
   * Genera título y cuerpo usando templates del notification_type
   * @param {Object} notificationType - Tipo de notificación con templates
   * @param {Object} metadata         - Datos para reemplazar variables
   * @returns {{ title, body, emailSubject, emailBody }}
   */
  static generarContenido(
    notificationType: Pick<
      defineNotificationType.Attributes,
      'title_template' | 'body_template' | 'email_subject_template' | 'email_body_template'
    >,
    metadata: unknown
  ) {
    const title = this.reemplazarVariables(notificationType.title_template, metadata);
    const body = this.reemplazarVariables(notificationType.body_template, metadata);

    let emailSubject = '';
    let emailBody = '';

    if (notificationType.email_subject_template) {
      emailSubject = this.reemplazarVariables(notificationType.email_subject_template, metadata);
    }

    if (notificationType.email_body_template) {
      emailBody = this.reemplazarVariables(notificationType.email_body_template, metadata);
    }

    return { title, body, emailSubject, emailBody };
  }

  /**
   * Reemplaza variables {{variable}} con valores de metadata
   * @param {string} template - Template con variables
   * @param {Object} data     - Datos para reemplazar
   * @returns {string}
   */
  static reemplazarVariables(template: string | null | undefined, data: unknown) {
    if (!template) {
      return '';
    }

    return template.replaceAll(/\{\{(\w+)\}\}/g, (match: string, variable: string) => {
      const value = (data as Record<string, unknown> | null | undefined)?.[variable];
      return value === null || value === undefined ? match : String(value);
    });
  }

  // ============================================================
  // PRIORITY MAPPING
  // (absorbido de notificationPriority.util.js)
  // ============================================================

  /**
   * Mapea prioridad string → número para ordenamiento en BD
   * @param {'low'|'normal'|'high'|'urgent'} priority
   * @returns {number}
   */
  static mapPriority(priority: string | null | undefined) {
    return (priority && (PRIORITY_SCORES as Record<string, number>)[priority]) || DEFAULT_PRIORITY_SCORE;
  }
}

export default NotificationContentUtil;
