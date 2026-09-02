/**
 * Buildings Domain — HTTP Router
 *
 * Mounts under /buildings (see server-refactored.js).
 *
 * Also provides legacy /reports routes so the existing frontend
 * continues to work without any changes.
 *
 * Access rules:
 *   • All routes require authentication (requireAuth).
 *   • MUNICIPALITY users can only see/modify buildings in their settlement.
 *     - List routes: results are filtered to the user's settlementId.
 *     - Single-resource routes: requireSettlementAccess blocks cross-settlement access.
 *   • MINISTRY and APPRAISER users have full access to all buildings.
 */

const express = require('express');
const BuildingsService = require('./buildingsService');
const requireAuth = require('../../middleware/requireAuth');
const requireRole = require('../../middleware/requireRole');
const requireSettlementAccess = require('../../middleware/requireSettlementAccess');
const AuditLogService = require('../auditLog/auditLogService');
const logger = require('../../logger');

const ROLES = require('../users/usersService').ROLES;

const router = express.Router();

// All buildings routes require authentication
router.use(requireAuth);

// ── Helper: derive settlement filter from the current user ───────────────────
// Returns the user's settlementId if they are MUNICIPALITY, null otherwise.
function settlementFilter(req) {
  const user = req.currentUser;
  return user.role === ROLES.MUNICIPALITY ? user.settlementId : null;
}

// ── Domain API (/buildings/…) ────────────────────────────────────────────────

// GET /buildings — list buildings (filtered for MUNICIPALITY users)
router.get('/', (req, res) => {
  res.json(BuildingsService.getAllBuildings(settlementFilter(req)));
});

// POST /buildings — create a new building (MINISTRY only)
router.post('/', requireRole(ROLES.MINISTRY), (req, res) => {
  const result = BuildingsService.createBuilding(req.body || {});
  if (!result.success) return res.status(400).json({ error: result.error });
  res.status(201).json(result.building);
});

// GET /buildings/settlement-readiness/all — national dashboard (all buildings)
// Must be declared BEFORE /:id to avoid being caught by the catch-all
router.get('/settlement-readiness/all', (req, res) => {
  res.json(BuildingsService.getAllSettlementReadiness());
});

// GET /buildings/:id — get a single building (settlement-scoped)
router.get('/:id', requireSettlementAccess, (req, res) => {
  const building = BuildingsService.getBuilding(req.params.id);
  if (!building) return res.status(404).json({ error: `Building "${req.params.id}" not found` });
  res.json(building);
});

// PATCH /buildings/:id/status — update status (MINISTRY only, settlement-scoped)
router.patch('/:id/status', requireRole(ROLES.MINISTRY), requireSettlementAccess, (req, res) => {
  const result = BuildingsService.updateBuildingStatus(req.params.id, (req.body || {}).status);
  if (!result.success) {
    const status = result.error.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  AuditLogService.log({
    userId: req.currentUser.id,
    userName: req.currentUser.fullName,
    action: AuditLogService.ACTION_TYPES.STATUS_UPDATED,
    entityType: 'building',
    entityId: req.params.id,
  });
  res.json(result.building);
});

// PATCH /buildings/:id — update building fields (MINISTRY only, settlement-scoped)
router.patch('/:id', requireRole(ROLES.MINISTRY), requireSettlementAccess, (req, res) => {
  const result = BuildingsService.updateBuilding(req.params.id, req.body || {});
  if (!result.success) {
    const status = result.error.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  AuditLogService.log({
    userId: req.currentUser.id,
    userName: req.currentUser.fullName,
    action: AuditLogService.ACTION_TYPES.BUILDING_UPDATED,
    entityType: 'building',
    entityId: req.params.id,
  });
  res.json(result.building);
});

// POST /buildings/:id/return-home-package — generate PDF (MINISTRY only, settlement-scoped)
router.post('/:id/return-home-package', requireRole(ROLES.MINISTRY), requireSettlementAccess, async (req, res) => {
  const buildingId = req.params.id;
  const building = BuildingsService.getBuilding(buildingId);
  const settlementName = building ? (building.settlementId || 'לא ידוע') : 'לא ידוע';
  const processId = req.headers['x-process-id'] || null;

  logger.info('BUILDING_PROCESSING_STARTED', { processId, buildingId, settlementName });

  const result = await BuildingsService.generateReturnHomePackage(buildingId, processId);
  if (!result.success) {
    const status = result.error.includes('not found') ? 404 : 400;
    logger.warn('BUILDING_PROCESSING_SKIPPED', { processId, buildingId, settlementName, error: result.error });
    return res.status(status).json({ error: result.error });
  }

  logger.info('PDF_COMPLETED', { processId, buildingId, settlementName, url: result.url });

  AuditLogService.log({
    userId: req.currentUser.id,
    userName: req.currentUser.fullName,
    action: AuditLogService.ACTION_TYPES.RETURN_HOME_PACKAGE_GENERATED,
    entityType: 'building',
    entityId: buildingId,
  });

  // Send notification if the building has a family email
  const updatedBuilding = BuildingsService.getBuilding(buildingId);
  if (updatedBuilding && updatedBuilding.familyEmail) {
    const subject = `אישור חזרה לבית ${updatedBuilding.address}`;
    const body = `שלום,\nאנו שמחים לעדכן כי המבנה שלכם אושר לחזרה לבית.\nתיק האכלוס הוכן בהצלחה.\nבברכה,\nמשרד הבינוי והשיכון`;

    logger.info('NOTIFICATION_SENDING_STARTED', { processId, buildingId, settlementName });

    fetch(`http://localhost:${process.env.PORT || 3000}/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(processId ? { 'X-Process-ID': processId } : {}),
      },
      body: JSON.stringify({
        buildingId: updatedBuilding.id,
        email: updatedBuilding.familyEmail,
        subject,
        body,
        idempotencyKey: updatedBuilding.id,
      }),
    })
      .then((r) => r.json())
      .then((r) => {
        if (r.status === 'SENT' || r.status === 'ALREADY_SENT') {
          logger.info('NOTIFICATION_SENT', { processId, buildingId, settlementName, status: r.status });
        } else {
          logger.warn('NOTIFICATION_FAILED', { processId, buildingId, settlementName, status: r.status });
        }
      })
      .catch((err) => {
        logger.error('NOTIFICATION_ERROR', { processId, buildingId, settlementName, error: err.message });
      });
  }

  logger.info('BUILDING_PROCESSING_COMPLETED', { processId, buildingId, settlementName });
  res.json({ url: result.url });
});

// GET /buildings/:id/settlement-readiness — readiness for one building (settlement-scoped)
router.get('/:id/settlement-readiness', requireSettlementAccess, (req, res) => {
  const readiness = BuildingsService.getSettlementReadiness(req.params.id);
  if (!readiness) return res.status(404).json({ error: `Building "${req.params.id}" not found` });
  res.json(readiness);
});

module.exports = router;
