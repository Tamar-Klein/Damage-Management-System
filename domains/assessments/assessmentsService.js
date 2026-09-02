/**
 * Assessments Domain — owned by the Appraiser team.
 *
 * Owns:  report.appraiserAssessment
 * Exposes a service API consumed by other domains.
 * Other domains must NOT read or write appraiserAssessment directly.
 */

const store = require('../store');

const VALID_SEVERITIES = ['קל', 'בינוני', 'חמור'];

const AssessmentsService = {
  /**
   * Returns the appraiser assessment for a building, or null if none exists.
   * @param {string} buildingId
   * @returns {{ damageSeverity, notes, inspectionDate, requiresFollowUp, savedAt } | null}
   */
  getAssessment(buildingId) {
    const report = store._findById(buildingId);
    if (!report) return null;
    return report.appraiserAssessment || null;
  },

  /**
   * Returns the damage severity for a building, or null if no assessment exists.
   * @param {string} buildingId
   * @returns {string | null}
   */
  getDamageSeverity(buildingId) {
    const assessment = this.getAssessment(buildingId);
    return assessment ? assessment.damageSeverity : null;
  },

  /**
   * Returns true if an approved assessment exists with a non-severe damage level.
   * Used by the Buildings domain to determine settlement readiness.
   * @param {string} buildingId
   * @returns {boolean}
   */
  hasAcceptableAssessment(buildingId) {
    const assessment = this.getAssessment(buildingId);
    if (!assessment) return false;
    return ['קל', 'בינוני'].includes(assessment.damageSeverity);
  },

  /**
   * Save or update the appraiser assessment for a building.
   * Only this domain may write to appraiserAssessment.
   * @param {string} buildingId
   * @param {{ damageSeverity, notes, inspectionDate, requiresFollowUp }} data
   * @returns {{ success: boolean, assessment?: object, error?: string }}
   */
  saveAssessment(buildingId, { damageSeverity, notes, inspectionDate, requiresFollowUp }) {
    const report = store._findById(buildingId);
    if (!report) {
      return { success: false, error: `Building "${buildingId}" not found` };
    }

    if (!damageSeverity || !VALID_SEVERITIES.includes(damageSeverity)) {
      return {
        success: false,
        error: `"damageSeverity" must be one of: ${VALID_SEVERITIES.join(', ')}`,
      };
    }
    if (!inspectionDate || !String(inspectionDate).trim()) {
      return { success: false, error: '"inspectionDate" is required' };
    }

    report.appraiserAssessment = {
      damageSeverity,
      notes: notes ? String(notes).trim() : '',
      inspectionDate: String(inspectionDate).trim(),
      requiresFollowUp: requiresFollowUp === true || requiresFollowUp === 'true',
      savedAt: new Date().toISOString(),
    };

    store._save();
    return { success: true, assessment: report.appraiserAssessment };
  },

  /**
   * Returns a list of all buildings with a summary of their assessment status.
   * Used by the Appraiser portal to display the list of buildings.
   * @returns {Array<{ id, address, reporterName, status, hasAssessment, damageSeverity }>}
   */
  getBuildingSummariesForPortal() {
    return store._getAll().map((r) => ({
      id: r.id,
      address: r.address,
      reporterName: r.reporterName,
      status: r.status,
      hasAssessment: !!r.appraiserAssessment,
      damageSeverity: r.appraiserAssessment ? r.appraiserAssessment.damageSeverity : null,
    }));
  },
};

module.exports = AssessmentsService;
