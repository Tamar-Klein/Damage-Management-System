/**
 * Damage Report Management System — Refactored Architecture.
 *
 * Domain-driven design with clear ownership boundaries:
 *   • Buildings domain  — owned by Ministry of Housing team
 *   • Assessments domain — owned by Appraiser team
 *   • Municipal domain   — owned by Local Authorities team
 *   • Users domain       — identity & session management
 *   • Audit Log          — records who did what and when
 *
 * Each domain has:
 *   • Service layer  — business logic + data ownership
 *   • Router         — HTTP API
 *
 * Cross-domain queries use service-layer APIs, never direct field access.
 *
 * Legacy /reports routes are preserved so the existing frontend keeps working.
 */

const express = require('express');
const path = require('path');
const { randomUUID } = require('crypto');

// ── Domain modules ────────────────────────────────────────────────────────────
const store = require('./domains/store');
const BuildingsService = require('./domains/buildings/buildingsService');
const buildingsRouter = require('./domains/buildings/buildingsRouter');
const AssessmentsService = require('./domains/assessments/assessmentsService');
const assessmentsRouter = require('./domains/assessments/assessmentsRouter');
const MunicipalService = require('./domains/municipal/municipalService');
const municipalRouter = require('./domains/municipal/municipalRouter');
const MockNotificationServer = require('./notificationServer');
const usersRouter = require('./domains/users/usersRouter');
const auditLogRouter = require('./domains/auditLog/auditLogRouter');
const AuditLogService = require('./domains/auditLog/auditLogService');
const requireAuth = require('./middleware/requireAuth');
const requireRole = require('./middleware/requireRole');
const requireSettlementAccess = require('./middleware/requireSettlementAccess');
const settlementProcessRouter = require('./domains/settlementProcess/settlementProcessRouter');
const SettlementProcessService = require('./domains/settlementProcess/settlementProcessService');
const logger = require('./logger');

const ROLES = require('./domains/users/usersService').ROLES;

// ── App initialization ────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/generated-pdfs', express.static(path.join(__dirname, 'generated-pdfs')));

// ── Storage initialization ────────────────────────────────────────────────────
function seed(reports) {
  const jerusalemStreets = [
    'רחוב הנביאים', 'רחוב המלך ג\'ורג', 'רחוב יפו', 'רחוב בן יהודה',
    'רחוב אגרון', 'רחוב רחביה', 'רחוב כ"ט בנובמבר', 'רחוב החשמונאים',
    'רחוב בצלאל', 'רחוב שמואל הנביא', 'רחוב עזרא', 'רחוב נחמיה',
    'רחוב הפלמ"ח', 'רחוב קרן היסוד', 'רחוב טשרניחובסקי', 'רחוב גורן',
    'רחוב הרב קוק', 'רחוב ירמיהו', 'רחוב עמק רפאים', 'רחוב אבן גבירול',
  ];
  const damageTypes = [
    'דליפת מים', 'סדק מבני', 'נזק מאש', 'נזק מבני', 'דליפת ביוב',
    'נזק חשמלי', 'נזק מרעידות אדמה', 'נזק ממערכת כיבוי אש',
  ];
  const sampleNames = [
    'דנה כהן', 'יוסי לוי', 'שרה כץ', 'דוד ישראל', 'רחל גולד',
    'משה כסף', 'אסתר בראון', 'אברהם גרין', 'מרים לבן', 'יעקב שחור',
    'חנה כחול', 'יצחק אדום', 'רבקה סגול', 'אהרן כתום', 'לאה ורוד',
    'יוסף אפור', 'נעמי צהוב', 'שמואל כחול-ירוק', 'רות מג\'נטה', 'בנימין ליים',
  ];

  for (let i = 0; i < 20; i++) {
    const isEligible = i < 10;
    const streetNumber = Math.floor(Math.random() * 100) + 1;
    // Distribute buildings across the three MUNICIPALITY user settlements
    const settlement = i < 8 ? 'ירושלים' : i < 14 ? 'צפת' : 'טבריה';
    const address = `${jerusalemStreets[i]} ${streetNumber}, ${settlement}`;
    const damageType = damageTypes[Math.floor(Math.random() * damageTypes.length)];
    reports.push({
      id: randomUUID(),
      reporterName: sampleNames[i],
      address,
      settlementId: settlement,
      damageType,
      description: `תיאור נזק בכתובת ${address}`,
      status: isEligible ? 'REHABILITATION_COMPLETED' : (i < 15 ? 'REHABILITATION_IN_PROGRESS' : 'IN_REVIEW'),
      hasDamagePhotos: true,
      hasEngineerReport: isEligible,
      eligibilityChecked: isEligible,
      socialApproval: i % 3 === 0,
      apartmentCount: Math.floor(Math.random() * 30) + 1,
      familyEmail: `family${i + 1}@example.com`,
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
}

store.initialize(seed);
MockNotificationServer.initialize();

// ── Domain API routes ─────────────────────────────────────────────────────────

app.use('/auth', usersRouter);
app.use('/audit-log', auditLogRouter);
app.use('/buildings', buildingsRouter);
app.use('/assessments', assessmentsRouter);
app.use('/municipal', municipalRouter);
app.use('/settlement-processes', settlementProcessRouter);

// ── System Health ─────────────────────────────────────────────────────────────
app.get('/system-health', requireAuth, (req, res) => {
  const processes = SettlementProcessService.getAll();

  // Settlement process counts
  const completed  = processes.filter(p => p.status === 'COMPLETED').length;
  const processing = processes.filter(p => p.status === 'PROCESSING').length;

  // Average duration (ms → seconds) for COMPLETED processes only
  let avgDurationSec = null;
  const completedWithDuration = processes.filter(
    p => p.status === 'COMPLETED' && p.startedAt && p.completedAt
  );
  if (completedWithDuration.length > 0) {
    const totalMs = completedWithDuration.reduce(
      (sum, p) => sum + (new Date(p.completedAt) - new Date(p.startedAt)), 0
    );
    avgDurationSec = Math.round(totalMs / completedWithDuration.length / 100) / 10;
  }

  // Notifications
  const notifications = MockNotificationServer.getAllNotifications();
  const notifSuccessful = notifications.filter(n => n.status === 'SENT').length;
  const notifFailed     = notifications.filter(n => n.status === 'FAILED').length;

  // Retry count — count log entries with event NOTIFICATION_RETRY_STARTED
  let retryCount = 0;
  try {
    const fs   = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, 'logs', 'settlement-process.log');
    if (fs.existsSync(logFile)) {
      const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
      retryCount = lines.reduce((count, line) => {
        try {
          const entry = JSON.parse(line);
          return entry.event === 'NOTIFICATION_RETRY_STARTED' ? count + 1 : count;
        } catch { return count; }
      }, 0);
    }
  } catch (_) { /* log file not available — retry count stays 0 */ }

  res.json({
    settlementProcesses: { completed, processing },
    notifications: { successful: notifSuccessful, failed: notifFailed, retryCount },
    performance: { avgSettlementDurationSec: avgDurationSec },
  });
});

// ── Legacy /reports routes (frontend compatibility) ───────────────────────────
//
// The frontend uses /reports for everything.  These routes delegate to the
// appropriate domain service, ensuring all cross-domain rules are enforced.
//
// ORDER MATTERS: specific sub-routes before the generic /:id catch-all.

// GET /reports — full list (Buildings domain, includes cross-domain data for UI)
// MUNICIPALITY users see only their own settlement's buildings
app.get('/reports', requireAuth, (req, res) => {
  const user = req.currentUser;
  const settlementId = user.role === ROLES.MUNICIPALITY ? user.settlementId : null;
  res.json(BuildingsService.getAllBuildingsFullView(settlementId));
});

// POST /reports — create new building (MINISTRY only)
app.post('/reports', requireAuth, requireRole(ROLES.MINISTRY), (req, res) => {
  const result = BuildingsService.createBuilding(req.body || {});
  if (!result.success) return res.status(400).json({ error: result.error });
  res.status(201).json(result.building);
});

// GET /reports/:id/appraiser-assessment — Assessments domain API
// APPRAISER and MINISTRY only (no settlement restriction)
app.get('/reports/:id/appraiser-assessment', requireAuth, requireRole(ROLES.MINISTRY, ROLES.APPRAISER), (req, res) => {
  const assessment = AssessmentsService.getAssessment(req.params.id);
  if (assessment === null) {
    const exists = store._getAll().some((r) => r.id === req.params.id);
    if (!exists) return res.status(404).json({ error: `Report with id "${req.params.id}" not found.` });
    return res.json(null);
  }
  res.json(assessment);
});

// PUT /reports/:id/appraiser-assessment — Assessments domain API
// Allowed: MINISTRY, APPRAISER
app.put('/reports/:id/appraiser-assessment', requireAuth, requireRole(ROLES.MINISTRY, ROLES.APPRAISER), (req, res) => {
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

// GET /reports/:id/municipal-approval — Municipal domain API
// MUNICIPALITY users can only see their own settlement's buildings
app.get('/reports/:id/municipal-approval', requireAuth, requireSettlementAccess, (req, res) => {
  const approval = MunicipalService.getApproval(req.params.id);
  if (approval === null) {
    const exists = store._getAll().some((r) => r.id === req.params.id);
    if (!exists) return res.status(404).json({ error: `Report with id "${req.params.id}" not found.` });
    return res.json(null);
  }
  res.json(approval);
});

// PUT /reports/:id/municipal-approval — Municipal domain API
// Allowed: MINISTRY, MUNICIPALITY (settlement-scoped for MUNICIPALITY)
app.put('/reports/:id/municipal-approval', requireAuth, requireRole(ROLES.MINISTRY, ROLES.MUNICIPALITY), requireSettlementAccess, (req, res) => {
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
});

// POST /reports/:id/open-budget — log budget request
// Allowed: MINISTRY only
app.post('/reports/:id/open-budget', requireAuth, requireRole(ROLES.MINISTRY), (req, res) => {
  const building = BuildingsService.getBuilding(req.params.id);
  if (!building) {
    return res.status(404).json({ error: `Report with id "${req.params.id}" not found.` });
  }
  AuditLogService.log({
    userId: req.currentUser.id,
    userName: req.currentUser.fullName,
    action: AuditLogService.ACTION_TYPES.BUDGET_OPENED,
    entityType: 'building',
    entityId: req.params.id,
  });
  res.json({ success: true });
});

// PATCH /reports/:id/status — Buildings domain (MINISTRY only, settlement-scoped)
app.patch('/reports/:id/status', requireAuth, requireRole(ROLES.MINISTRY), requireSettlementAccess, (req, res) => {
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
  // Return full view for legacy compatibility
  res.json(BuildingsService.getFullBuildingView(req.params.id));
});

// PATCH /reports/:id — Buildings domain (MINISTRY only, settlement-scoped)
app.patch('/reports/:id', requireAuth, requireRole(ROLES.MINISTRY), requireSettlementAccess, (req, res) => {
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
  res.json(BuildingsService.getFullBuildingView(req.params.id));
});

// GET /reports/:id — full building view (settlement-scoped)
app.get('/reports/:id', requireAuth, requireSettlementAccess, (req, res) => {
  const building = BuildingsService.getFullBuildingView(req.params.id);
  if (!building) return res.status(404).json({ error: `Report with id "${req.params.id}" not found.` });
  res.json(building);
});

// ── Notifications (shared infrastructure) ────────────────────────────────────

app.post('/notifications/send', async (req, res) => {
  const { buildingId, email, subject, body, idempotencyKey } = req.body || {};
  const processId = req.headers['x-process-id'] || null;

  if (!buildingId || !email || !subject || !body) {
    return res.status(400).json({
      error: 'Missing required fields: buildingId, email, subject, body',
    });
  }

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 5000;
  let lastResult = null;

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        logger.info('NOTIFICATION_RETRY_STARTED', { processId, buildingId, attempt });
      }
      try {
        lastResult = await Promise.race([
          MockNotificationServer.sendNotification(
            buildingId, email, subject, body, idempotencyKey
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
          ),
        ]);

        if (lastResult && (lastResult.status === 'SENT' || lastResult.status === 'ALREADY_SENT')) {
          logger.info('NOTIFICATION_ATTEMPT_SUCCEEDED', { processId, buildingId, attempt, status: lastResult.status });
          break;
        }
        logger.warn('NOTIFICATION_ATTEMPT_FAILED', { processId, buildingId, attempt, status: lastResult && lastResult.status });
      } catch (err) {
        logger.warn('NOTIFICATION_ATTEMPT_ERROR', { processId, buildingId, attempt, error: err.message });
        if (attempt === MAX_RETRIES) {
          lastResult = { status: 'FAILED', messageId: null };
        }
      }
    }
    res.json(lastResult || { status: 'FAILED', messageId: null });
  } catch (err) {
    logger.error('NOTIFICATION_UNHANDLED_ERROR', { processId, buildingId, error: err.message });
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.get('/notifications', (req, res) => {
  try {
    res.json(MockNotificationServer.getAllNotifications());
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

app.get('/notifications/mode', (req, res) => {
  try {
    res.json({ mode: MockNotificationServer.getMode(), modes: MockNotificationServer.getModes() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get notification mode' });
  }
});

app.post('/notifications/mode', (req, res) => {
  try {
    MockNotificationServer.setMode((req.body || {}).mode);
    res.json({ mode: MockNotificationServer.getMode() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set notification mode' });
  }
});

// ── Fallback 404 ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Refactored] Damage Reports server at http://localhost:${PORT}`);
  console.log(`  Buildings domain:    /buildings`);
  console.log(`  Assessments domain:  /assessments`);
  console.log(`  Municipal domain:    /municipal`);
  console.log(`  Users/Auth:          /auth`);
  console.log(`  Audit Log:           /audit-log`);
  console.log(`  Legacy frontend:     /reports  (forwards to domains)`);
});
