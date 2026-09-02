/**
 * Audit Log — HTTP Router
 *
 * GET /audit-log/buildings/:id  → list of action log entries for a building
 * GET /audit-log                → full log (all entities)
 */

const express = require('express');
const AuditLogService = require('./auditLogService');

const router = express.Router();

// GET /audit-log/buildings/:id — action history for a specific building
router.get('/buildings/:id', (req, res) => {
  res.json(AuditLogService.getByEntityId(req.params.id));
});

// GET /audit-log — full log
router.get('/', (req, res) => {
  res.json(AuditLogService.getAll());
});

module.exports = router;
