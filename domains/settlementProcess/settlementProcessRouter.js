/**
 * Settlement Process Domain — HTTP Router
 *
 * POST /settlement-processes        — create a new process (PROCESSING)
 * POST /settlement-processes/:id/complete — mark as COMPLETED
 * GET  /settlement-processes        — list all processes (newest first)
 */

const express = require('express');
const SettlementProcessService = require('./settlementProcessService');
const requireAuth = require('../../middleware/requireAuth');
const logger = require('../../logger');

const router = express.Router();

router.use(requireAuth);

// POST /settlement-processes
router.post('/', (req, res) => {
  const { settlementName, eligibleCount } = req.body || {};
  const entry = SettlementProcessService.create({
    settlementName: settlementName || '',
    startedBy: req.currentUser.fullName,
  });
  logger.info('SETTLEMENT_PROCESS_STARTED', {
    processId: entry.id,
    settlementName: entry.settlementName,
    startedBy: entry.startedBy,
    eligibleCount: eligibleCount || null,
  });
  res.status(201).json(entry);
});

// POST /settlement-processes/:id/complete
router.post('/:id/complete', (req, res) => {
  const entry = SettlementProcessService.complete(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Process not found' });
  logger.info('SETTLEMENT_PROCESS_COMPLETED', {
    processId: entry.id,
    settlementName: entry.settlementName,
    startedBy: entry.startedBy,
    completedAt: entry.completedAt,
  });
  res.json(entry);
});

// GET /settlement-processes
router.get('/', (req, res) => {
  res.json(SettlementProcessService.getAll());
});

module.exports = router;
