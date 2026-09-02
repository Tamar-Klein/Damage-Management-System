/**
 * Damage Report Management System — minimal MVP backend.
 *
 * Storage: in-memory array (resets when the process restarts).
 *
 * Entity: DamageReport
 *   - id            (unique, server-generated)
 *   - reporterName  (string, required)
 *   - address       (string, required)
 *   - damageType    (string, required)
 *   - description   (string, required)
 *   - status        ("NEW" | "IN_REVIEW")
 *   - familyEmail   (string, optional)
 *   - createdAt      (bonus, useful for sorting the list)
 *
 * APIs:
 *   GET    /reports             -> list all reports
 *   POST   /reports             -> create a new report (status defaults to NEW)
 *   GET    /reports/:id         -> get one report
 *   PATCH  /reports/:id/status  -> update only the status field
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const ReturnHomePackageService = require('./returnHomePackageService');
const MockNotificationServer = require('./notificationServer');

const app = express();
app.use(express.json());

// Serve the static frontend (public/index.html, app.js)
app.use(express.static(path.join(__dirname, 'public')));

// Serve generated PDFs
app.use('/generated-pdfs', express.static(path.join(__dirname, 'generated-pdfs')));

// ---- File-backed storage --------------------------------------------------
const STORAGE_FILE = path.join(__dirname, 'reports.json');
const VALID_STATUSES = ['NEW', 'IN_REVIEW', 'REHABILITATION_IN_PROGRESS', 'REHABILITATION_COMPLETED'];
let reports = [];

function loadReports() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) return null;
    const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.error('Failed to load reports:', err);
    return null;
  }
}

function saveReports() {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save reports:', err);
  }
}


// Seed with example reports so the list isn't empty on first run.
function seed() {
  const jerusalemStreets = [
    'רחוב הנביאים', 'רחוב המלך ג\'ורג', 'רחוב יפו', 'רחוב בן יהודה',
    'רחוב אגרון', 'רחוב רחביה', 'רחוב כ\"ט בנובמבר', 'רחוב החשמונאים',
    'רחוב בצלאל', 'רחוב שמואל הנביא', 'רחוב עזרא', 'רחוב נחמיה',
    'רחוב הפלמ\"ח', 'רחוב קרן היסוד', 'רחוב טשרניחובסקי', 'רחוב גורן',
    'רחוב הרב קוק', 'רחוב ירמיהו', 'רחוב עמק רפאים', 'רחוב אבן גבירול'
  ];

  const damageTypes = [
    'דליפת מים', 'סדק מבני', 'נזק מאש', 'נזק מבני', 'דליפת ביוב',
    'נזק חשמלי', 'נזק מרעידות אדמה', 'נזק ממערכת כיבוי אש'
  ];

  const sampleNames = [
    'דנה כהן', 'יוסי לוי', 'שרה כץ', 'דוד ישראל', 'רחל גולד',
    'משה כסף', 'אסתר בראון', 'אברהם גרין', 'מרים לבן', 'יעקב שחור',
    'חנה כחול', 'יצחק אדום', 'רבקה סגול', 'אהרן כתום', 'לאה ורוד',
    'יוסף אפור', 'נעמי צהוב', 'שמואל כחול-ירוק', 'רות מג\'נטה', 'בנימין ליים'
  ];

  for (let i = 0; i < 20; i++) {
    const isEligible = i < 10; // First 10 are eligible for return home package
    const streetNumber = Math.floor(Math.random() * 100) + 1;
    const address = `${jerusalemStreets[i]} ${streetNumber}, ירושלים`;
    const damageType = damageTypes[Math.floor(Math.random() * damageTypes.length)];
    
    reports.push({
      id: randomUUID(),
      reporterName: sampleNames[i],
      address: address,
      damageType: damageType,
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

const persistedReports = loadReports();
if (persistedReports) {
  reports = persistedReports;
} else {
  seed();
  saveReports();
}

// Initialize notification server
MockNotificationServer.initialize();

// ---- Helpers ----------------------------------------------------------------
function findReportOr404(req, res) {
  const report = reports.find((r) => r.id === req.params.id);
  if (!report) {
    res.status(404).json({ error: `Report with id "${req.params.id}" not found.` });
    return null;
  }
  return report;
}

// ---- Routes -------------------------------------------------------------

// GET /reports — view all reports (most recent first)
app.get('/reports', (req, res) => {
  const sorted = [...reports].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(sorted);
});

// POST /reports — create a new report
app.post('/reports', (req, res) => {
  const {
    reporterName,
    address,
    damageType,
    description,
    hasDamagePhotos,
    hasEngineerReport,
    eligibilityChecked,
    socialApproval,
    apartmentCount,
    familyEmail,
  } = req.body || {};

  const missing = [];
  if (!reporterName || !reporterName.trim()) missing.push('reporterName');
  if (!address || !address.trim()) missing.push('address');
  if (!damageType || !damageType.trim()) missing.push('damageType');
  if (!description || !description.trim()) missing.push('description');

  const countValue = apartmentCount !== undefined && apartmentCount !== null && apartmentCount !== ''
    ? Number(apartmentCount)
    : 0;
  if (
    apartmentCount !== undefined && apartmentCount !== null && apartmentCount !== '' &&
    (!Number.isInteger(countValue) || countValue < 0)
  ) {
    return res.status(400).json({
      error: '"apartmentCount" must be a non-negative integer',
    });
  }

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Missing required field(s): ${missing.join(', ')}`,
    });
  }

  const booleanFlag = (value) => value === true || value === 'true' || value === 'on';

  const newReport = {
    id: randomUUID(),
    reporterName: reporterName.trim(),
    address: address.trim(),
    damageType: damageType.trim(),
    description: description.trim(),
    status: 'NEW',
    hasDamagePhotos: booleanFlag(hasDamagePhotos),
    hasEngineerReport: booleanFlag(hasEngineerReport),
    eligibilityChecked: booleanFlag(eligibilityChecked),
    socialApproval: booleanFlag(socialApproval),
    apartmentCount: countValue,
    familyEmail: familyEmail ? familyEmail.trim() : null,
    createdAt: new Date().toISOString(),
  };

  reports.push(newReport);
  saveReports();
  res.status(201).json(newReport);
});

// GET /reports/:id — view report details
app.get('/reports/:id', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;
  res.json(report);
});

// PATCH /reports/:id/status — change status
app.patch('/reports/:id/status', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;

  const { status } = req.body || {};
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `"status" must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  report.status = status;
  saveReports();
  res.json(report);
});

// PATCH /reports/:id — update report fields
app.patch('/reports/:id', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;

  const {
    reporterName,
    address,
    damageType,
    description,
    hasDamagePhotos,
    hasEngineerReport,
    eligibilityChecked,
    socialApproval,
    apartmentCount,
    status,
    familyEmail,
  } = req.body || {};

  const booleanFlag = (value) => value === true || value === 'true' || value === 'on';

  if (reporterName !== undefined) {
    if (!reporterName || !String(reporterName).trim()) {
      return res.status(400).json({ error: '"reporterName" cannot be empty' });
    }
    report.reporterName = String(reporterName).trim();
  }
  if (address !== undefined) {
    if (!address || !String(address).trim()) {
      return res.status(400).json({ error: '"address" cannot be empty' });
    }
    report.address = String(address).trim();
  }
  if (damageType !== undefined) {
    if (!damageType || !String(damageType).trim()) {
      return res.status(400).json({ error: '"damageType" cannot be empty' });
    }
    report.damageType = String(damageType).trim();
  }
  if (description !== undefined) {
    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: '"description" cannot be empty' });
    }
    report.description = String(description).trim();
  }
  if (hasDamagePhotos !== undefined) {
    report.hasDamagePhotos = booleanFlag(hasDamagePhotos);
  }
  if (hasEngineerReport !== undefined) {
    report.hasEngineerReport = booleanFlag(hasEngineerReport);
  }
  if (eligibilityChecked !== undefined) {
    report.eligibilityChecked = booleanFlag(eligibilityChecked);
  }
  if (socialApproval !== undefined) {
    report.socialApproval = booleanFlag(socialApproval);
  }
  if (apartmentCount !== undefined) {
    const countValue = Number(apartmentCount);
    if (!Number.isInteger(countValue) || countValue < 0) {
      return res.status(400).json({
        error: '"apartmentCount" must be a non-negative integer',
      });
    }
    report.apartmentCount = countValue;
  }
  if (familyEmail !== undefined) {
    if (familyEmail !== null && familyEmail !== '' && !String(familyEmail).includes('@')) {
      return res.status(400).json({
        error: '"familyEmail" must be a valid email address',
      });
    }
    report.familyEmail = familyEmail ? String(familyEmail).trim() : null;
  }
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `"status" must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }
    report.status = status;
  }

  saveReports();
  res.json(report);
});

// GET /reports/:id/appraiser-assessment — get appraiser assessment for a report
app.get('/reports/:id/appraiser-assessment', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;
  res.json(report.appraiserAssessment || null);
});

// PUT /reports/:id/appraiser-assessment — save or update appraiser assessment
app.put('/reports/:id/appraiser-assessment', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;

  const { damageSeverity, notes, inspectionDate, requiresFollowUp } = req.body || {};

  const VALID_SEVERITIES = ['קל', 'בינוני', 'חמור'];
  if (!damageSeverity || !VALID_SEVERITIES.includes(damageSeverity)) {
    return res.status(400).json({
      error: `"damageSeverity" must be one of: ${VALID_SEVERITIES.join(', ')}`,
    });
  }
  if (!inspectionDate || !inspectionDate.trim()) {
    return res.status(400).json({ error: '"inspectionDate" is required' });
  }

  report.appraiserAssessment = {
    damageSeverity,
    notes: notes ? String(notes).trim() : '',
    inspectionDate: inspectionDate.trim(),
    requiresFollowUp: requiresFollowUp === true || requiresFollowUp === 'true',
    savedAt: new Date().toISOString(),
  };

  saveReports();
  res.json(report.appraiserAssessment);
});

// GET /reports/:id/municipal-approval — get municipal approval for a report
app.get('/reports/:id/municipal-approval', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;
  res.json(report.municipalApproval || null);
});

// PUT /reports/:id/municipal-approval — save or update municipal approval
app.put('/reports/:id/municipal-approval', (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;

  const {
    waterSupplyOk,
    electricitySupplyOk,
    accessRoadsOpen,
    environmentalHazardsCleared,
    notes,
    approved,
  } = req.body || {};

  report.municipalApproval = {
    waterSupplyOk: waterSupplyOk === true || waterSupplyOk === 'true',
    electricitySupplyOk: electricitySupplyOk === true || electricitySupplyOk === 'true',
    accessRoadsOpen: accessRoadsOpen === true || accessRoadsOpen === 'true',
    environmentalHazardsCleared: environmentalHazardsCleared === true || environmentalHazardsCleared === 'true',
    notes: notes ? String(notes).trim() : '',
    approved: approved === true || approved === 'true',
    savedAt: new Date().toISOString(),
  };

  saveReports();
  res.json(report.municipalApproval);
});

// POST /buildings/:id/return-home-package — generate return home package PDF
app.post('/buildings/:id/return-home-package', async (req, res) => {
  const report = findReportOr404(req, res);
  if (!report) return;

  // Check eligibility
  if (!ReturnHomePackageService.isEligibleForReturnHomePackage(report)) {
    return res.status(400).json({
      error: 'Building is not eligible for return home package. Requirements: engineer report, eligibility checked, and rehabilitation completed status.',
    });
  }

  try {
    const pdfUrl = await ReturnHomePackageService.generateReturnHomePackage(report);
    
    // Update report with PDF URL
    report.pdfUrl = pdfUrl;
    saveReports();
    
    // Send notification if family email exists
    if (report.familyEmail) {
      const subject = `אישור חזרה לבית ${report.address}`;
      const body = `שלום,\nאנו שמחים לעדכן כי המבנה שלכם אושר לחזרה לבית.\nתיק האכלוס הוכן בהצלחה.\nבברכה,\nמשרד הבינוי והשיכון`;
      
      // Send notification using the API (which includes retry logic)
      try {
        const notificationResponse = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildingId: report.id,
            email: report.familyEmail,
            subject,
            body,
            idempotencyKey: report.id, // MVP: use buildingId as idempotencyKey
          }),
        });
        const notificationResult = await notificationResponse.json();
        console.log('Notification result:', notificationResult);
      } catch (notifErr) {
        console.error('Failed to send notification:', notifErr);
        // Don't fail the package generation if notification fails
      }
    }
    
    res.json({ url: pdfUrl });
  } catch (err) {
    console.error('Failed to generate return home package:', err);
    res.status(500).json({ error: 'Failed to generate return home package PDF' });
  }
});

// POST /notifications/send — send notification with retry logic (max 3 attempts, with timeout per attempt)
app.post('/notifications/send', async (req, res) => {
  const { buildingId, email, subject, body, idempotencyKey } = req.body || {};
  
  if (!buildingId || !email || !subject || !body) {
    return res.status(400).json({
      error: 'Missing required fields: buildingId, email, subject, body',
    });
  }
  
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 5000; // 5 seconds per attempt
  let lastResult = null;

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Use Promise.race to add timeout to each attempt
        lastResult = await Promise.race([
          MockNotificationServer.sendNotification(buildingId, email, subject, body, idempotencyKey),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
        ]);

        // If already sent (idempotency) or successfully sent, stop retrying
        if (lastResult && (lastResult.status === 'SENT' || lastResult.status === 'ALREADY_SENT')) {
          console.log(`Notification result on attempt ${attempt}: ${lastResult.status}`);
          break;
        }

        console.log(`Notification send failed on attempt ${attempt}, retrying...`);
      } catch (err) {
        console.log(`Notification attempt ${attempt} failed: ${err.message}`);
        if (attempt === MAX_RETRIES) {
          lastResult = { status: 'FAILED', messageId: null };
        }
      }
    }

    res.json(lastResult || { status: 'FAILED', messageId: null });
  } catch (err) {
    console.error('Failed to send notification:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// GET /notifications — get all notifications
app.get('/notifications', (req, res) => {
  try {
    const notifications = MockNotificationServer.getAllNotifications();
    res.json(notifications);
  } catch (err) {
    console.error('Failed to get notifications:', err);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// GET /notifications/mode — get current server mode
app.get('/notifications/mode', (req, res) => {
  try {
    const currentMode = MockNotificationServer.getMode();
    const modes = MockNotificationServer.getModes();
    res.json({ mode: currentMode, modes });
  } catch (err) {
    console.error('Failed to get notification mode:', err);
    res.status(500).json({ error: 'Failed to get notification mode' });
  }
});

// POST /notifications/mode — set server mode
app.post('/notifications/mode', (req, res) => {
  const { mode } = req.body || {};
  try {
    MockNotificationServer.setMode(mode);
    res.json({ mode: MockNotificationServer.getMode() });
  } catch (err) {
    console.error('Failed to set notification mode:', err);
    res.status(500).json({ error: 'Failed to set notification mode' });
  }
});

// Fallback 404 for unknown API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Damage Reports server running at http://localhost:${PORT}`);
});
