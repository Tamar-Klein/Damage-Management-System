/**
 * Audit Log — records who did what and when.
 *
 * Fields per entry:
 *   id          — unique identifier
 *   userId      — the user who performed the action
 *   userName    — full name of the user (denormalized for easy display)
 *   action      — what was done (see ACTION_TYPES below)
 *   entityType  — type of entity affected ('building' | 'assessment' | 'municipalApproval')
 *   entityId    — id of the affected entity (usually the building id)
 *   timestamp   — ISO string
 */

const { randomUUID } = require('crypto');

const ACTION_TYPES = {
  ASSESSMENT_SAVED:                'עדכון שמאות',
  MUNICIPAL_SAVED:                 'אישור/דחיית מבנה',
  BUDGET_OPENED:                   'פתיחת בקשת תקציב',
  STATUS_UPDATED:                  'עדכון סטטוס מבנה',
  BUILDING_UPDATED:                'עדכון פרטי מבנה',
  RETURN_HOME_PACKAGE_GENERATED:   'יצירת תיק אכלוס',
};

// In-memory store (sufficient for this sprint — no persistence needed)
let auditLog = [];

const AuditLogService = {
  ACTION_TYPES,

  /**
   * Record an action.
   * @param {{ userId, userName, action, entityType, entityId }} entry
   */
  log({ userId, userName, action, entityType, entityId }) {
    const entry = {
      id: randomUUID(),
      userId,
      userName,
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
    };
    auditLog.push(entry);
    return entry;
  },

  /**
   * Return all log entries for a specific entity, most recent first.
   * @param {string} entityId
   */
  getByEntityId(entityId) {
    return auditLog
      .filter((e) => e.entityId === entityId)
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  /**
   * Return all log entries, most recent first.
   */
  getAll() {
    return auditLog.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },
};

module.exports = AuditLogService;
