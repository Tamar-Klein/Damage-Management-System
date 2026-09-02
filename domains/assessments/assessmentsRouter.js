/**
 * Assessments Domain — HTTP Router
 *
 * Mounts under /assessments (see server-refactored.js).
 * All write operations on appraiserAssessment go through this router exclusively.
 *
 * Access rules:
 *   • All routes require authentication.
 *   • Write routes (PUT) are restricted to MINISTRY and APPRAISER roles.
 *   • APPRAISER and MINISTRY users can access all buildings (no settlement restriction).
 */

const express = require('express');
const AssessmentsService = require('./assessmentsService');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const AuditLogService = require('../auditLog/auditLogService');

const ROLES = require('../users/usersService').ROLES;

const router = express.Router();

// All assessments routes require authentication
router.use(requireAuth);

// GET /assessments/buildings — list all buildings with their assessment status
// Accessible to MINISTRY and APPRAISER (no settlement restriction)
router.get('/buildings', requireRole(ROLES.MINISTRY, ROLES.APPRAISER), (req, res) => {
  res.json(AssessmentsService.getBuildingSummariesForPortal());
});

// GET /assessments/buildings/:id — get the assessment for a specific building
// Accessible to MINISTRY and APPRAISER
router.get('/buildings/:id', requireRole(ROLES.MINISTRY, ROLES.APPRAISER), (req, res) => {
  const assessment = AssessmentsService.getAssessment(req.params.id);
  if (assessment === null) {
    const all = require('../store')._getAll();
    const exists = all.some((r) => r.id === req.params.id);
    if (!exists) {
      return res.status(404).json({ error: `Building "${req.params.id}" not found` });
    }
    return res.json(null);
  }
  res.json(assessment);
});

// PUT /assessments/buildings/:id — save or update the appraiser assessment
// Allowed: MINISTRY, APPRAISER
router.put('/buildings/:id', requireRole(ROLES.MINISTRY, ROLES.APPRAISER), (req, res) => {
  const result = AssessmentsService.saveAssessment(req.params.id, req.body || {});
  if (!result.success) {
    const status = result.error.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  AuditLogService.log({
    userId: req.currentUser.id,
    userName: req.currentUser.fullName,
    action: AuditLogService.ACTION_TYPES.ASSESSMENT_SAVED,
    entityType: 'building',
    entityId: req.params.id,
  });
  res.json(result.assessment);
});

module.exports = router;
