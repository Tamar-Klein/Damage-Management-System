(function () {
  const booleanFlag = (value) =>
    value === true || value === 'true' || value === 'on' || value === 1 || value === '1';

  const BudgetEligibilityService = {
    hasDamageImages(report) {
      return booleanFlag(report?.hasDamagePhotos);
    },

    hasEngineerReport(report) {
      return booleanFlag(report?.hasEngineerReport);
    },

    isEligibilityChecked(report) {
      return booleanFlag(report?.eligibilityChecked);
    },

    isSocialApprovalRequired(report) {
      return Number(report?.apartmentCount || 0) > 24;
    },

    hasSocialApproval(report) {
      return booleanFlag(report?.socialApproval);
    },

    canBeginRehabilitation(report) {
      return (
        this.hasDamageImages(report) &&
        this.hasEngineerReport(report) &&
        this.isEligibilityChecked(report)
      );
    },

    canOpenBudget(report) {
      return (
        this.canBeginRehabilitation(report) &&
        (!this.isSocialApprovalRequired(report) || this.hasSocialApproval(report))
      );
    },

    canGenerateReturnHomePackage(report) {
      return (
        this.hasEngineerReport(report) &&
        this.isEligibilityChecked(report) &&
        report.status === 'REHABILITATION_COMPLETED'
      );
    },

    // Sprint 3: Settlement readiness — all conditions must be met
    isReadyForSettlement(report) {
      // Existing conditions
      if (!this.hasDamageImages(report)) return false;
      if (!this.hasEngineerReport(report)) return false;
      if (!this.isEligibilityChecked(report)) return false;
      if (this.isSocialApprovalRequired(report) && !this.hasSocialApproval(report)) return false;
      if (!this.canOpenBudget(report)) return false;
      if (!report.pdfUrl) return false;

      // New conditions from national platform
      if (!report.appraiserAssessment) return false;
      if (!['קל', 'בינוני'].includes(report.appraiserAssessment.damageSeverity)) return false;
      if (!report.municipalApproval || !report.municipalApproval.approved) return false;

      return true;
    },

    // Returns which conditions are blocking settlement readiness
    settlementBlockers(report) {
      const blockers = { needsAppraiser: false, needsMunicipal: false, other: false };
      if (!report.appraiserAssessment) {
        blockers.needsAppraiser = true;
      }
      if (!report.municipalApproval || !report.municipalApproval.approved) {
        blockers.needsMunicipal = true;
      }
      if (
        !this.hasDamageImages(report) ||
        !this.hasEngineerReport(report) ||
        !this.isEligibilityChecked(report) ||
        (this.isSocialApprovalRequired(report) && !this.hasSocialApproval(report)) ||
        !this.canOpenBudget(report) ||
        !report.pdfUrl ||
        (report.appraiserAssessment && !['קל', 'בינוני'].includes(report.appraiserAssessment.damageSeverity))
      ) {
        blockers.other = true;
      }
      return blockers;
    },
  };

  window.BudgetEligibilityService = BudgetEligibilityService;
})();
