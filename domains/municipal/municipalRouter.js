/**
 * Municipal Approvals Domain — HTTP Router
 *
 * Mounts under /municipal (see server-refactored.js).
 * All write operations on municipalApproval go through this router exclusively.
 *
 * Access rules:
 *   • All routes require authentication.
 *   • Write routes (PUT) are restricted to MINISTRY and MUNICIPALITY roles.
 *   • MUNICIPALITY users can only access/approve buildings in their own settlement.
 */

const express = require('express');
const MunicipalService = require('./municipalService');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const requireSettlementAccess = require('../../middleware/requireSettlementAccess');
const AuditLogService = require('../auditLog/auditLogService');

const ROLES = require('../users/usersService').ROLES;

const router = express.Router();

// All municipal routes require authentication
router.use(requireAuth);

// Helper: derive settlement filter from the current user
function settlementFilter(req) {
  const user = req.currentUser;
  return user.role === ROLES.MUNICIPALITY ? user.settlementId : null;
}

// GET /municipal/buildings — list buildings with approval status
// MUNICIPALITY users see only their settlement's buildings
router.get('/buildings', (req, res) => {
  res.json(MunicipalService.getBuildingSummariesForPortal(settlementFilter(req)));
});

// GET /municipal/buildings/:id — get the municipal approval for a building (settlement-scoped)
router.get('/buildings/:id', requireSettlementAccess, (req, res) => {
  const approval = MunicipalService.getApproval(req.params.id);
  if (approval === null) {
    const exists = require('../store')._getAll().some((r) => r.id === req.params.id);
    if (!exists) {
      return res.status(404).json({ error: `Building "${req.params.id}" not found` });
    }
    return res.json(null);
  }
  res.json(approval);
});

// PUT /municipal/buildings/:id — save or update the municipal approval
// Allowed: MINISTRY, MUNICIPALITY (settlement-scoped for MUNICIPALITY)
router.put('/buildings/:id',
  requireRole(ROLES.MINISTRY, ROLES.MUNICIPALITY),
  requireSettlementAccess,
  (req, res) => {
    const result = MunicipalService.saveApproval(req.params.id, req.body || {});
    if (!result.success) {
      const status = result.error.includes('not found') ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    AuditLogService.log({
      userId: req.currentUser.id,
      userName: req.currentUser.fullName,
      action: AuditLogService.ACTION_TYPES.MUNICIPAL_SAVED,
      entityType: 'building',
      entityId: req.params.id,
    });
    res.json(result.approval);
  }
);

module.exports = router;
