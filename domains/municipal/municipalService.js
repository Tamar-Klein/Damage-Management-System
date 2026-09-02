/**
 * Municipal Approvals Domain — owned by the Local Authorities team.
 *
 * Owns:  report.municipalApproval
 * Exposes a service API consumed by other domains.
 * Other domains must NOT read or write municipalApproval directly.
 */

const store = require('../store');

const MunicipalService = {
  /**
   * Returns the municipal approval for a building, or null if none exists.
   * @param {string} buildingId
   * @returns {{ waterSupplyOk, electricitySupplyOk, accessRoadsOpen,
   *             environmentalHazardsCleared, notes, approved, savedAt } | null}
   */
  getApproval(buildingId) {
    const report = store._findById(buildingId);
    if (!report) return null;
    return report.municipalApproval || null;
  },

  /**
   * Returns true if the local authority has approved the building.
   * Used by the Buildings domain to determine settlement readiness.
   * @param {string} buildingId
   * @returns {boolean}
   */
  isApproved(buildingId) {
    const approval = this.getApproval(buildingId);
    return !!(approval && approval.approved);
  },

  /**
   * Save or update the municipal approval for a building.
   * Only this domain may write to municipalApproval.
   * @param {string} buildingId
   * @param {{ waterSupplyOk, electricitySupplyOk, accessRoadsOpen,
   *           environmentalHazardsCleared, notes, approved }} data
   * @returns {{ success: boolean, approval?: object, error?: string }}
   */
  saveApproval(buildingId, {
    waterSupplyOk,
    electricitySupplyOk,
    accessRoadsOpen,
    environmentalHazardsCleared,
    notes,
    approved,
  }) {
    const report = store._findById(buildingId);
    if (!report) {
      return { success: false, error: `Building "${buildingId}" not found` };
    }

    report.municipalApproval = {
      waterSupplyOk: waterSupplyOk === true || waterSupplyOk === 'true',
      electricitySupplyOk: electricitySupplyOk === true || electricitySupplyOk === 'true',
      accessRoadsOpen: accessRoadsOpen === true || accessRoadsOpen === 'true',
      environmentalHazardsCleared: environmentalHazardsCleared === true || environmentalHazardsCleared === 'true',
      notes: notes ? String(notes).trim() : '',
      approved: approved === true || approved === 'true',
      savedAt: new Date().toISOString(),
    };

    store._save();
    return { success: true, approval: report.municipalApproval };
  },

  /**
   * Returns a list of all buildings with a summary of their approval status.
   * If settlementId is provided, restricts to that settlement only.
   * Used by the Municipal portal to display the list of buildings.
   * @param {string|null} settlementId
   * @returns {Array<{ id, address, reporterName, settlementId, status, hasApproval, approved }>}
   */
  getBuildingSummariesForPortal(settlementId = null) {
    let all = store._getAll();
    if (settlementId) all = all.filter((r) => r.settlementId === settlementId);
    return all.map((r) => ({
      id: r.id,
      address: r.address,
      reporterName: r.reporterName,
      settlementId: r.settlementId || null,
      status: r.status,
      hasApproval: !!r.municipalApproval,
      approved: !!(r.municipalApproval && r.municipalApproval.approved),
    }));
  },
};

module.exports = MunicipalService;
