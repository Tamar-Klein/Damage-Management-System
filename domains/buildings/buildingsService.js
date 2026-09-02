/**
 * Buildings Domain — owned by the Ministry of Housing team.
 *
 * Owns:
 *   - Core building/report data (reporterName, address, damageType, description,
 *     status, hasDamagePhotos, hasEngineerReport, eligibilityChecked,
 *     socialApproval, apartmentCount, familyEmail, pdfUrl, createdAt)
 *   - Rehabilitation process (status transitions)
 *   - Return-home package generation
 *   - National dashboard (settlement readiness)
 *
 * Cross-domain data (appraiserAssessment, municipalApproval) is accessed ONLY
 * through the service APIs of the Assessments and Municipal domains.
 * This module never reads those fields directly from the store.
 */

const store = require('../store');
const AssessmentsService = require('../assessments/assessmentsService');
const MunicipalService = require('../municipal/municipalService');
const ReturnHomePackageService = require('../../returnHomePackageService');

const VALID_STATUSES = ['NEW', 'IN_REVIEW', 'REHABILITATION_IN_PROGRESS', 'REHABILITATION_COMPLETED'];

const booleanFlag = (value) =>
  value === true || value === 'true' || value === 'on';

// ── Internal helpers ──────────────────────────────────────────────────────────

function toPublicView(report) {
  // Returns the building's own data.
  // appraiserAssessment and municipalApproval are intentionally NOT included here —
  // callers that need cross-domain data should compose it themselves or use
  // getFullBuildingView().
  return {
    id: report.id,
    reporterName: report.reporterName,
    address: report.address,
    settlementId: report.settlementId || null,
    damageType: report.damageType,
    description: report.description,
    status: report.status,
    hasDamagePhotos: report.hasDamagePhotos,
    hasEngineerReport: report.hasEngineerReport,
    eligibilityChecked: report.eligibilityChecked,
    socialApproval: report.socialApproval,
    apartmentCount: report.apartmentCount,
    familyEmail: report.familyEmail,
    pdfUrl: report.pdfUrl || null,
    createdAt: report.createdAt,
  };
}

function canBeginRehabilitation(report) {
  return report.hasDamagePhotos && report.hasEngineerReport && report.eligibilityChecked;
}

function isSocialApprovalRequired(report) {
  return Number(report.apartmentCount || 0) > 24;
}

function canOpenBudget(report) {
  return (
    canBeginRehabilitation(report) &&
    (!isSocialApprovalRequired(report) || report.socialApproval)
  );
}

function canGenerateReturnHomePackage(report) {
  return (
    report.hasEngineerReport &&
    report.eligibilityChecked &&
    report.status === 'REHABILITATION_COMPLETED'
  );
}

// ── Settlement readiness ──────────────────────────────────────────────────────
// Consumes Assessments and Municipal service APIs — no direct field access.

function isReadyForSettlement(report) {
  if (!canOpenBudget(report)) return false;
  if (!report.pdfUrl) return false;
  // Cross-domain queries via service APIs:
  if (!AssessmentsService.hasAcceptableAssessment(report.id)) return false;
  if (!MunicipalService.isApproved(report.id)) return false;
  return true;
}

function settlementBlockers(report) {
  const blockers = { needsAppraiser: false, needsMunicipal: false, other: false };
  if (!AssessmentsService.hasAcceptableAssessment(report.id)) {
    blockers.needsAppraiser = true;
  }
  if (!MunicipalService.isApproved(report.id)) {
    blockers.needsMunicipal = true;
  }
  if (!canOpenBudget(report) || !report.pdfUrl) {
    blockers.other = true;
  }
  return blockers;
}

// ── Public service API ────────────────────────────────────────────────────────

const BuildingsService = {
  /**
   * Returns all buildings. If settlementId is provided, filters to that settlement only.
   * Used by MINISTRY/APPRAISER (no filter) and MUNICIPALITY (filtered to their settlement).
   * @param {string|null} settlementId
   */
  getAllBuildings(settlementId = null) {
    let all = store._getAll().slice();
    if (settlementId) all = all.filter((r) => r.settlementId === settlementId);
    return all
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(toPublicView);
  },

  getBuilding(id) {
    const report = store._findById(id);
    if (!report) return null;
    return toPublicView(report);
  },

  /**
   * Full view for detail page — composes building data with cross-domain data
   * fetched through the domain service APIs.
   */
  getFullBuildingView(id) {
    const report = store._findById(id);
    if (!report) return null;

    const building = toPublicView(report);

    // Cross-domain data fetched through APIs:
    building.appraiserAssessment = AssessmentsService.getAssessment(id);
    building.municipalApproval = MunicipalService.getApproval(id);

    return building;
  },

  /**
   * Full view for list — same as getFullBuildingView but for all buildings.
   * The frontend list page needs appraiserAssessment and municipalApproval
   * to compute settlement readiness badges.
   * @param {string|null} settlementId — when set, restricts to that settlement only
   */
  getAllBuildingsFullView(settlementId = null) {
    let all = store._getAll().slice();
    if (settlementId) all = all.filter((r) => r.settlementId === settlementId);
    return all
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((report) => {
        const building = toPublicView(report);
        building.appraiserAssessment = AssessmentsService.getAssessment(report.id);
        building.municipalApproval = MunicipalService.getApproval(report.id);
        return building;
      });
  },

  createBuilding({
    reporterName, address, damageType, description,
    hasDamagePhotos, hasEngineerReport, eligibilityChecked,
    socialApproval, apartmentCount, familyEmail,
  }) {
    const missing = [];
    if (!reporterName || !String(reporterName).trim()) missing.push('reporterName');
    if (!address || !String(address).trim()) missing.push('address');
    if (!damageType || !String(damageType).trim()) missing.push('damageType');
    if (!description || !String(description).trim()) missing.push('description');
    if (missing.length > 0) {
      return { success: false, error: `Missing required field(s): ${missing.join(', ')}` };
    }

    const countValue = apartmentCount !== undefined && apartmentCount !== null && apartmentCount !== ''
      ? Number(apartmentCount) : 0;
    if (!Number.isInteger(countValue) || countValue < 0) {
      return { success: false, error: '"apartmentCount" must be a non-negative integer' };
    }

    const newReport = {
      id: store._newId(),
      reporterName: String(reporterName).trim(),
      address: String(address).trim(),
      damageType: String(damageType).trim(),
      description: String(description).trim(),
      status: 'NEW',
      hasDamagePhotos: booleanFlag(hasDamagePhotos),
      hasEngineerReport: booleanFlag(hasEngineerReport),
      eligibilityChecked: booleanFlag(eligibilityChecked),
      socialApproval: booleanFlag(socialApproval),
      apartmentCount: countValue,
      familyEmail: familyEmail ? String(familyEmail).trim() : null,
      createdAt: new Date().toISOString(),
    };

    store._getAll().push(newReport);
    store._save();
    return { success: true, building: toPublicView(newReport) };
  },

  updateBuildingStatus(id, status) {
    const report = store._findById(id);
    if (!report) return { success: false, error: `Building "${id}" not found` };
    if (!VALID_STATUSES.includes(status)) {
      return { success: false, error: `"status" must be one of: ${VALID_STATUSES.join(', ')}` };
    }
    report.status = status;
    store._save();
    return { success: true, building: toPublicView(report) };
  },

  updateBuilding(id, fields) {
    const report = store._findById(id);
    if (!report) return { success: false, error: `Building "${id}" not found` };

    const {
      reporterName, address, damageType, description,
      hasDamagePhotos, hasEngineerReport, eligibilityChecked,
      socialApproval, apartmentCount, status, familyEmail,
    } = fields;

    if (reporterName !== undefined) {
      if (!String(reporterName).trim()) return { success: false, error: '"reporterName" cannot be empty' };
      report.reporterName = String(reporterName).trim();
    }
    if (address !== undefined) {
      if (!String(address).trim()) return { success: false, error: '"address" cannot be empty' };
      report.address = String(address).trim();
    }
    if (damageType !== undefined) {
      if (!String(damageType).trim()) return { success: false, error: '"damageType" cannot be empty' };
      report.damageType = String(damageType).trim();
    }
    if (description !== undefined) {
      if (!String(description).trim()) return { success: false, error: '"description" cannot be empty' };
      report.description = String(description).trim();
    }
    if (hasDamagePhotos !== undefined) report.hasDamagePhotos = booleanFlag(hasDamagePhotos);
    if (hasEngineerReport !== undefined) report.hasEngineerReport = booleanFlag(hasEngineerReport);
    if (eligibilityChecked !== undefined) report.eligibilityChecked = booleanFlag(eligibilityChecked);
    if (socialApproval !== undefined) report.socialApproval = booleanFlag(socialApproval);
    if (apartmentCount !== undefined) {
      const v = Number(apartmentCount);
      if (!Number.isInteger(v) || v < 0) {
        return { success: false, error: '"apartmentCount" must be a non-negative integer' };
      }
      report.apartmentCount = v;
    }
    if (familyEmail !== undefined) {
      if (familyEmail !== null && familyEmail !== '' && !String(familyEmail).includes('@')) {
        return { success: false, error: '"familyEmail" must be a valid email address' };
      }
      report.familyEmail = familyEmail ? String(familyEmail).trim() : null;
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return { success: false, error: `"status" must be one of: ${VALID_STATUSES.join(', ')}` };
      }
      report.status = status;
    }

    store._save();
    return { success: true, building: toPublicView(report) };
  },

  async generateReturnHomePackage(id, processId = null) {
    const report = store._findById(id);
    if (!report) return { success: false, error: `Building "${id}" not found` };

    if (!ReturnHomePackageService.isEligibleForReturnHomePackage(report)) {
      return {
        success: false,
        error: 'Building is not eligible for return home package. Requirements: engineer report, eligibility checked, and rehabilitation completed status.',
      };
    }

    try {
      const pdfUrl = await ReturnHomePackageService.generateReturnHomePackage(report, processId);
      report.pdfUrl = pdfUrl;
      store._save();
      return { success: true, url: pdfUrl };
    } catch (err) {
      return { success: false, error: 'Failed to generate return home package PDF' };
    }
  },

  // ── National Dashboard API (used by /reports list + settlement summary) ────

  /**
   * Returns settlement readiness for a single building.
   * Delegates to AssessmentsService and MunicipalService via their APIs.
   */
  getSettlementReadiness(id) {
    const report = store._findById(id);
    if (!report) return null;
    return {
      buildingId: id,
      isReady: isReadyForSettlement(report),
      blockers: settlementBlockers(report),
    };
  },

  /**
   * Returns settlement readiness for all buildings.
   */
  getAllSettlementReadiness() {
    return store._getAll().map((report) => ({
      buildingId: report.id,
      isReady: isReadyForSettlement(report),
      blockers: settlementBlockers(report),
    }));
  },

  // Exposed for internal use by other modules that need raw eligibility checks
  // (e.g. the router to decide which fields to include)
  _canOpenBudget: canOpenBudget,
  _canGenerateReturnHomePackage: canGenerateReturnHomePackage,
  _isReadyForSettlement: isReadyForSettlement,
  _settlementBlockers: settlementBlockers,
};

module.exports = BuildingsService;
