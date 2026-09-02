// Damage Reports — minimal SPA frontend (no framework, no build step).
// Routes (hash-based):
//   #/            -> Reports List
//   #/new         -> Create Report
//   #/reports/:id -> Report Details
//   #/notifications -> Notification Center

const API_BASE = '';

const app = document.getElementById('app');
const navListBtn = document.getElementById('nav-list');
const navCreateBtn = document.getElementById('nav-create');
const navNotificationsBtn = document.getElementById('nav-notifications');
const navAppraiserBtn = document.getElementById('nav-appraiser');
const navMunicipalBtn = document.getElementById('nav-municipal');
const navLogoutBtn = document.getElementById('nav-logout');
const navUserLabel = document.getElementById('nav-user-label');
const navSettlementProcessesBtn = document.getElementById('nav-settlement-processes');
const navSystemHealthBtn = document.getElementById('nav-system-health');

navListBtn.addEventListener('click', () => { window.location.hash = '#/'; });
navCreateBtn.addEventListener('click', () => { window.location.hash = '#/new'; });
navNotificationsBtn.addEventListener('click', () => { window.location.hash = '#/notifications'; });
navAppraiserBtn.addEventListener('click', () => { window.location.hash = '#/appraiser'; });
navMunicipalBtn.addEventListener('click', () => { window.location.hash = '#/municipal'; });
navSettlementProcessesBtn && navSettlementProcessesBtn.addEventListener('click', () => { window.location.hash = '#/settlement-processes'; });
navSystemHealthBtn && navSystemHealthBtn.addEventListener('click', () => { window.location.hash = '#/system-health'; });

// ── Auth state ──────────────────────────────────────────────────────────────
// Token is kept only in memory (not localStorage) for this sprint.
let authToken = null;
let currentUser = null;

// Role helpers — used across all render functions to show/hide UI elements
const ROLES = { MINISTRY: 'MINISTRY', MUNICIPALITY: 'MUNICIPALITY', APPRAISER: 'APPRAISER' };
const canSaveAssessment  = () => currentUser && (currentUser.role === ROLES.MINISTRY || currentUser.role === ROLES.APPRAISER);
const canSaveMunicipal   = () => currentUser && (currentUser.role === ROLES.MINISTRY || currentUser.role === ROLES.MUNICIPALITY);
const canOpenBudgetRole  = () => currentUser && currentUser.role === ROLES.MINISTRY;
const canViewAppraiser   = () => currentUser && (currentUser.role === ROLES.MINISTRY || currentUser.role === ROLES.APPRAISER);
const canViewMunicipal   = () => currentUser && (currentUser.role === ROLES.MINISTRY || currentUser.role === ROLES.MUNICIPALITY);

const ROLE_LABELS = {
  MINISTRY:     'משרד השיכון',
  MUNICIPALITY: 'רשות מקומית',
  APPRAISER:    'שמאי',
};

function setAuth(token, user) {
  authToken = token;
  currentUser = user;
  if (navUserLabel) {
    navUserLabel.textContent = user
      ? `👤 ${user.fullName} · ${ROLE_LABELS[user.role] || user.role}`
      : '';
  }
  // כפתורים שמוצגים לכל משתמש מחובר
  const loggedInBtns = [navListBtn, navCreateBtn, navNotificationsBtn, navSettlementProcessesBtn, navSystemHealthBtn];
  loggedInBtns.forEach(btn => { if (btn) btn.style.display = user ? 'inline-block' : 'none'; });
  if (navLogoutBtn) navLogoutBtn.style.display = user ? 'inline-block' : 'none';
  // כפתורים שתלויים בתפקיד
  if (navAppraiserBtn) navAppraiserBtn.style.display = user && canViewAppraiser() ? 'inline-block' : 'none';
  if (navMunicipalBtn) navMunicipalBtn.style.display = user && canViewMunicipal() ? 'inline-block' : 'none';
}

navLogoutBtn && navLogoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': authToken || '' },
    });
  } catch (_) { /* ignore */ }
  setAuth(null, null);
  renderLogin();
});

window.addEventListener('hashchange', () => {
  if (!authToken) { renderLogin(); return; }
  render();
});
window.addEventListener('DOMContentLoaded', () => {
  renderLogin();
});

const STATUS_LABELS = {
  NEW: 'חדש',
  IN_REVIEW: 'בבדיקה',
  REHABILITATION_IN_PROGRESS: 'בתהליך שיקום',
  REHABILITATION_COMPLETED: 'תהליך שיקום הסתיים',
};

let listFilterMode = 'all';
let cityFilter = '';

function isWaitingForWork(report) {
  return report.hasEngineerReport && report.eligibilityChecked;
}

function filterReport(report) {
  if (cityFilter && cityFilter.trim()) {
    const city = cityFilter.trim().toLowerCase();
    const address = report.address.toLowerCase();
    
    // Extract city from address (after comma in Hebrew addresses)
    const cityMatch = address.match(/,\s*([^,]+)$/);
    const addressCity = cityMatch ? cityMatch[1].trim() : address;
    
    if (!addressCity.includes(city)) {
      return false;
    }
  }
  if (listFilterMode === 'waiting') {
    return isWaitingForWork(report);
  }
  if (listFilterMode === 'budget-ready') {
    return BudgetEligibilityService.canOpenBudget(report);
  }
  return true;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function apiFetch(path, options) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['X-Auth-Token'] = authToken;
  const res = await fetch(API_BASE + path, {
    headers,
    ...options,
    // allow caller to override individual headers
    ...(options && options.headers ? { headers: { ...headers, ...options.headers } } : {}),
  });
  let body = null;
  try { body = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    const message = (body && body.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

// ---------- Login Screen -----------------------------------------------------

function renderLogin() {
  app.innerHTML = `
    <div style="max-width:380px; margin:80px auto;">
      <div class="card">
        <h2 style="margin-top:0; text-align:center;">🔐 כניסה למערכת</h2>
        <form id="login-form">
          <div class="field">
            <label for="login-username">שם משתמש</label>
            <input id="login-username" type="text" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="login-password">סיסמה</label>
            <input id="login-password" type="password" autocomplete="current-password" required />
          </div>
          <div class="actions-row" style="justify-content:center;">
            <button type="submit" style="width:100%;">כניסה</button>
          </div>
          <div class="error" id="login-error" style="display:none; text-align:center;"></div>
        </form>
        <div style="margin-top:16px; padding:14px; background:var(--panel); border:1px solid var(--panel-border); border-radius:var(--radius-sm); font-size:12px; color:var(--muted);">
          <strong>משתמשי demo (סיסמה: 1234):</strong><br/>
          <table style="width:100%; margin-top:6px; border-collapse:collapse;">
            <tr style="border-bottom:1px solid var(--panel-border);">
              <th style="text-align:right; padding:3px 6px; font-size:11px; color:var(--text-muted);">שם משתמש</th>
              <th style="text-align:right; padding:3px 6px; font-size:11px; color:var(--text-muted);">תפקיד</th>
            </tr>
            <tr><td style="padding:3px 6px;">dana</td><td style="padding:3px 6px; color:var(--primary);">משרד השיכון</td></tr>
            <tr><td style="padding:3px 6px;">yossi</td><td style="padding:3px 6px; color:var(--primary);">משרד השיכון</td></tr>
            <tr><td style="padding:3px 6px;">sarah</td><td style="padding:3px 6px; color:var(--success);">רשות מקומית</td></tr>
            <tr><td style="padding:3px 6px;">moshe</td><td style="padding:3px 6px; color:var(--success);">רשות מקומית</td></tr>
            <tr><td style="padding:3px 6px;">rachel</td><td style="padding:3px 6px; color:var(--warn);">שמאי</td></tr>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('login-error');
    errorEl.style.display = 'none';
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'שגיאה בכניסה';
        errorEl.style.display = 'block';
        return;
      }
      setAuth(data.token, data.user);
      render();
    } catch (err) {
      errorEl.textContent = 'שגיאת תקשורת עם השרת';
      errorEl.style.display = 'block';
    }
  });
}

// ---------- Router -----------------------------------------------------------

function render() {
  const hash = window.location.hash || '#/';

  if (hash === '#/' || hash === '') {
    renderList();
  } else if (hash === '#/new') {
    renderCreate();
  } else if (hash === '#/notifications') {
    renderNotifications();
  } else if (hash === '#/appraiser') {
    renderAppraiserPortal();
  } else if (hash === '#/municipal') {
    renderMunicipalPortal();
  } else if (hash === '#/settlement-processes') {
    renderSettlementProcesses();
  } else if (hash === '#/system-health') {
    renderSystemHealth();
  } else {
    const appraiserMatch = hash.match(/^#\/appraiser\/(.+)$/);
    if (appraiserMatch) {
      renderAppraiserForm(decodeURIComponent(appraiserMatch[1]));
      return;
    }
    const municipalMatch = hash.match(/^#\/municipal\/(.+)$/);
    if (municipalMatch) {
      renderMunicipalForm(decodeURIComponent(municipalMatch[1]));
      return;
    }
    const match = hash.match(/^#\/reports\/(.+)$/);
    if (match) {
      renderDetails(decodeURIComponent(match[1]));
    } else {
      app.innerHTML = `<div class="empty">Page not found.</div>`;
    }
  }
}

// ---------- Reports List ----------------------------------------------------

// Track if search input exists to avoid re-rendering it
let searchInputElement = null;
let searchDebounceTimeout = null;

async function renderList() {
  app.innerHTML = `<div class="loading">טוען דוחות…</div>`;
  try {
    const reports = await apiFetch('/reports');
    if (reports.length === 0) {
      app.innerHTML = `
        <div class="empty">
          📋 אין דוחות נזק עדיין במערכת<br/>
          <button id="empty-new-btn" style="margin-top:12px;">+ צור את הדוח הראשון</button>
        </div>`;
      document.getElementById('empty-new-btn').addEventListener('click', () => {
        window.location.hash = '#/new';
      });
      return;
    }

    const filteredReports = reports.filter(filterReport);
    const waitingFilterLabel = listFilterMode === 'waiting' ? 'הצג את כל המבנים' : 'הצג רק מבנים הממתינים לעבודה';
    const budgetFilterLabel = listFilterMode === 'budget-ready' ? 'הצג את כל המבנים' : 'הצג רק מבנים מוכנים לתקציב';
    const waitingButtonClass = listFilterMode === 'waiting' ? 'secondary active' : 'secondary';
    const budgetReadyButtonClass = listFilterMode === 'budget-ready' ? 'secondary active' : 'secondary';
    const bulkButtonLabel = cityFilter && cityFilter.trim()
      ? `הפק תיקי אכלוס לכל היישוב: ${cityFilter}`
      : 'הפק תיקי אכלוס לכל המבנים הזכאים';

    // --- Settlement summary card (only when a city is filtered) ---
    let settlementSummaryHtml = '';
    if (cityFilter && cityFilter.trim()) {
      const total = filteredReports.length;
      const readyCount = filteredReports.filter(r => BudgetEligibilityService.isReadyForSettlement(r)).length;
      const notReadyCount = total - readyCount;

      let needsAppraiser = 0;
      let needsMunicipal = 0;
      let otherIssues = 0;
      filteredReports.forEach(r => {
        if (!BudgetEligibilityService.isReadyForSettlement(r)) {
          const b = BudgetEligibilityService.settlementBlockers(r);
          if (b.needsAppraiser && !b.needsMunicipal && !b.other) needsAppraiser++;
          else if (b.needsMunicipal && !b.needsAppraiser && !b.other) needsMunicipal++;
          else otherIssues++;
        }
      });

      const readyPct = total > 0 ? Math.round((readyCount / total) * 100) : 0;
      const summaryColor = readyPct === 100 ? 'var(--success)' : readyPct >= 60 ? 'var(--warn)' : 'var(--danger)';

      settlementSummaryHtml = `
        <div class="settlement-summary">
          <h3>🏙 מוכנות יישוב לפתיחה: ${escapeHtml(cityFilter.trim())}
            <span style="margin-right:12px; font-size:13px; font-weight:400; color:${summaryColor};">${readyPct}% מוכן</span>
          </h3>
          <div class="settlement-stats">
            <div class="stat-box">
              <div class="stat-number">${total}</div>
              <div class="stat-label">סה"כ מבנים</div>
            </div>
            <div class="stat-box ready">
              <div class="stat-number">${readyCount}</div>
              <div class="stat-label">כשירים לפתיחה</div>
            </div>
            <div class="stat-box not-ready">
              <div class="stat-number">${notReadyCount}</div>
              <div class="stat-label">אינם כשירים</div>
            </div>
            <div class="stat-box pending">
              <div class="stat-number">${needsAppraiser}</div>
              <div class="stat-label">ממתינים להערכת שמאי</div>
            </div>
            <div class="stat-box pending">
              <div class="stat-number">${needsMunicipal}</div>
              <div class="stat-label">ממתינים לאישור רשות</div>
            </div>
            <div class="stat-box not-ready">
              <div class="stat-number">${otherIssues}</div>
              <div class="stat-label">סיבות אחרות</div>
            </div>
          </div>
        </div>`;
    }

    app.innerHTML = `
      <div class="list-toolbar">
        <div class="list-title">דוחות נזק</div>
        <div class="list-filters">
          <input type="text" id="city-search" placeholder="חיפוש לפי עיר" value="${escapeHtml(cityFilter)}" style="width:150px; margin-left:8px;" />
          <button id="waiting-toggle-btn" class="${waitingButtonClass}">${waitingFilterLabel}</button>
          <button id="budget-ready-toggle-btn" class="${budgetReadyButtonClass}">${budgetFilterLabel}</button>
          <button id="bulk-generate-btn" class="secondary">${escapeHtml(bulkButtonLabel)}</button>
        </div>
      </div>
      ${settlementSummaryHtml}
      <div id="reports-list">
        ${filteredReports.length === 0
          ? '<div class="empty">🔍 אין דוחות התואמים לסינון זה</div>'
          : filteredReports.map((r) => {
              const ready = BudgetEligibilityService.isReadyForSettlement(r);
              const settlementBadge = `<span class="badge waiting ${ready ? 'yes' : 'no'}" title="${ready ? 'כשיר לפתיחת יישוב' : 'אינו כשיר לפתיחת יישוב'}">${ready ? 'כשיר ✓' : 'לא כשיר'}</span>`;
              return `
            <div class="card report-row" data-id="${escapeHtml(r.id)}">
              <div>
                <strong>${escapeHtml(r.reporterName)}</strong> — ${escapeHtml(r.damageType)}
                <div class="meta">${escapeHtml(r.address)} · ${new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <div class="report-badges">
                <span class="badge ${escapeHtml(r.status)}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span>
                <span class="badge waiting ${isWaitingForWork(r) ? 'yes' : 'no'}">${isWaitingForWork(r) ? 'ממתין לעבודה ✓' : 'לא ממתין'}</span>
                <span class="badge budget-ready ${BudgetEligibilityService.canOpenBudget(r) ? 'yes' : 'no'}">${BudgetEligibilityService.canOpenBudget(r) ? 'זמין לתקציב ✓' : 'לא זמין'}</span>
                ${settlementBadge}
                ${r.pdfUrl ? `<a href="${escapeHtml(r.pdfUrl)}" target="_blank" style="text-decoration: none; color: var(--primary); font-size: 20px; margin-right: 8px;" title="פתח תיק אכלוס">📄</a>` : ''}
                ${BudgetEligibilityService.canGenerateReturnHomePackage(r) ? `<button class="secondary return-home-btn" data-id="${escapeHtml(r.id)}" style="font-size:12px; padding:4px 8px; margin-right:8px;">הפק תיק אכלוס מחדש</button>` : ''}
              </div>
            </div>`;
            }).join('')}
      </div>
    `;

    // Setup event listeners
    document.getElementById('waiting-toggle-btn').addEventListener('click', () => {
      listFilterMode = listFilterMode === 'waiting' ? 'all' : 'waiting';
      renderList();
    });
    document.getElementById('budget-ready-toggle-btn').addEventListener('click', () => {
      listFilterMode = listFilterMode === 'budget-ready' ? 'all' : 'budget-ready';
      renderList();
    });

    // Store reference to search input
    searchInputElement = document.getElementById('city-search');

    // City search - debounce but keep focus
    searchInputElement.addEventListener('input', (e) => {
      const currentValue = e.target.value;
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        if (cityFilter !== currentValue) {
          cityFilter = currentValue;
          renderList().then(() => {
            const searchInput = document.getElementById('city-search');
            if (searchInput) {
              searchInput.focus();
              searchInput.setSelectionRange(currentValue.length, currentValue.length);
            }
          });
        }
      }, 300);
    });

    document.getElementById('bulk-generate-btn').addEventListener('click', () => {
      handleBulkGenerate(filteredReports);
    });

    app.querySelectorAll('.report-row').forEach((el) => {
      el.addEventListener('click', () => {
        window.location.hash = `#/reports/${encodeURIComponent(el.dataset.id)}`;
      });
    });

    app.querySelectorAll('.return-home-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reportId = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = 'מייצר...';
        try {
          const result = await apiFetch(`/buildings/${encodeURIComponent(reportId)}/return-home-package`, {
            method: 'POST',
          });
          const pdfUrl = result.url;
          const newWindow = window.open(pdfUrl, '_blank');
          if (!newWindow) {
            alert('PDF generated successfully. Please allow popups to view the document.');
          }
        } catch (err) {
          alert(`Failed to generate return home package: ${err.message}`);
        } finally {
          btn.disabled = false;
          btn.textContent = 'הפק תיק אכלוס מחדש';
        }
      });
    });
  } catch (err) {
    app.innerHTML = `<div class="error">❌ שגיאה בטעינת הדוחות: ${escapeHtml(err.message)}</div>`;
  }
}

// Handle bulk generation of return home packages
async function handleBulkGenerate(reports) {
  const eligibleReports = reports.filter(r => BudgetEligibilityService.canGenerateReturnHomePackage(r));
  
  if (eligibleReports.length === 0) {
    alert('אין מבנים זכאים להפקת תיק אכלוס מחדש ברשימה הנוכחית.');
    return;
  }
  
  const confirmed = confirm(`האם להפיק ${eligibleReports.length} דוחות אכלוס מחדש?`);
  if (!confirmed) return;

  // Create a SettlementProcess record
  const settlementName = cityFilter && cityFilter.trim() ? cityFilter.trim() : '';
  let processId = null;
  try {
    const proc = await apiFetch('/settlement-processes', {
      method: 'POST',
      body: JSON.stringify({ settlementName, eligibleCount: eligibleReports.length }),
    });
    processId = proc.id;
  } catch (err) {
    console.error('Failed to create settlement process:', err);
  }
  
  // Show toast notification instead of blocking modal
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: linear-gradient(135deg, #818cf8, #6366f1);
    color: #fff;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 12px 28px rgba(16, 24, 40, 0.22);
    z-index: 1000;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 400px;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255,255,255,0.35);
    border-top: 2px solid #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;
  
  const status = document.createElement('span');
  status.textContent = `הפקה בתהליך... (0/${eligibleReports.length})`;
  
  toast.appendChild(spinner);
  toast.appendChild(status);
  
  // Add animation style to document if not exists
  if (!document.getElementById('toast-animation-style')) {
    const style = document.createElement('style');
    style.id = 'toast-animation-style';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  let successCount = 0;
  let failureCount = 0;
  
  // Process reports without blocking the UI
  for (let i = 0; i < eligibleReports.length; i++) {
    const report = eligibleReports[i];
    try {
      await apiFetch(`/buildings/${encodeURIComponent(report.id)}/return-home-package`, {
        method: 'POST',
        headers: processId ? { 'X-Process-ID': processId } : {},
      });
      successCount++;
    } catch (err) {
      failureCount++;
      console.error(`Failed to generate for ${report.id}:`, err);
    }
    
    // Update toast progress
    status.textContent = `הפקה בתהליך... (${successCount + failureCount}/${eligibleReports.length})`;
  }

  // Mark process as completed
  if (processId) {
    try {
      await apiFetch(`/settlement-processes/${processId}/complete`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to complete settlement process:', err);
    }
  }
  
  // Update toast with final message
  toast.style.background = successCount === eligibleReports.length ? '#0fa968' : '#d97706';
  spinner.style.display = 'none';
  
  if (successCount === eligibleReports.length) {
    status.textContent = `✓ ההפקה הושלמה בהצלחה (${successCount} תיקים)`;
  } else {
    status.textContent = `⚠ ההפקה הושלמה (הופקו: ${successCount}, נכשלו: ${failureCount})`;
  }
  
  // Auto-remove toast after 5 seconds, then refresh list to show PDF icons
  setTimeout(() => {
    if (document.body.contains(toast)) document.body.removeChild(toast);
    renderList();
  }, 5000);
}


// ---------- Appraiser Portal -------------------------------------------------

async function renderAppraiserPortal() {
  if (!canViewAppraiser()) {
    app.innerHTML = `<div class="error" style="margin-top:40px; text-align:center;">⛔ אין לך הרשאה לצפות בפורטל השמאים.</div>`;
    return;
  }
  app.innerHTML = `<div class="loading">טוען מבנים…</div>`;
  try {
    const reports = await apiFetch('/reports');

    const rows = reports.map((r) => {
      const hasAssessment = !!r.appraiserAssessment;
      const severityBadge = hasAssessment
        ? `<span class="badge severity-${escapeHtml(r.appraiserAssessment.damageSeverity)}">${escapeHtml(r.appraiserAssessment.damageSeverity)}</span>`
        : `<span class="badge" style="background:var(--border-light);color:var(--text-muted);">אין הערכה</span>`;

      return `
        <div class="card report-row appraiser-building-row" data-id="${escapeHtml(r.id)}" style="cursor:pointer;">
          <div style="flex:1;">
            <strong>${escapeHtml(r.address)}</strong>
            <div class="meta">${escapeHtml(r.reporterName)} · ${escapeHtml(STATUS_LABELS[r.status] || r.status)}</div>
          </div>
          <div class="report-badges">
            <span class="badge ${escapeHtml(r.status)}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span>
            ${severityBadge}
            <button class="secondary" style="font-size:12px; padding:4px 10px;" data-id="${escapeHtml(r.id)}">
              ${hasAssessment ? 'עדכן הערכה' : 'הזן הערכה'}
            </button>
          </div>
        </div>`;
    }).join('');

    app.innerHTML = `
      <div class="list-toolbar">
        <div class="list-title">פורטל שמאים</div>
      </div>
      ${rows.length === 0 ? '<div class="empty">אין מבנים במערכת.</div>' : `<div id="appraiser-list">${rows}</div>`}
    `;

    app.querySelectorAll('.appraiser-building-row button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.hash = `#/appraiser/${encodeURIComponent(btn.dataset.id)}`;
      });
    });

    // Click on row navigates to details (same as main list)
    app.querySelectorAll('.appraiser-building-row').forEach((row) => {
      row.addEventListener('click', () => {
        window.location.hash = `#/reports/${encodeURIComponent(row.dataset.id)}`;
      });
    });
  } catch (err) {
    app.innerHTML = `<div class="error">❌ שגיאה בטעינת המבנים בפורטל השמאים: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderAppraiserForm(id) {
  if (!canSaveAssessment()) {
    app.innerHTML = `<div class="error" style="margin-top:40px; text-align:center;">⛔ אין לך הרשאה לעדכן הערכת שמאי.</div>`;
    return;
  }
  app.innerHTML = `<div class="loading">טוען מבנה…</div>`;
  try {
    const report = await apiFetch(`/reports/${encodeURIComponent(id)}`);
    const a = report.appraiserAssessment;

    const todayIso = new Date().toISOString().split('T')[0];

    app.innerHTML = `
      <button class="secondary" id="appraiser-back-btn">&larr; חזרה לפורטל שמאים</button>
      <div class="card" style="margin-top:12px;">
        <h2>הערכת נזק — ${escapeHtml(report.address)}</h2>
        <div class="detail-grid" style="margin-bottom:16px;">
          <div class="label">כתובת</div><div>${escapeHtml(report.address)}</div>
          <div class="label">סטטוס</div><div><span class="badge ${escapeHtml(report.status)}">${escapeHtml(STATUS_LABELS[report.status] || report.status)}</span></div>
          <div class="label">מדווח</div><div>${escapeHtml(report.reporterName)}</div>
        </div>
        <form id="appraiser-form">
          <div class="field">
            <label for="damageSeverity">דרגת נזק</label>
            <select id="damageSeverity" name="damageSeverity" required>
              <option value="">-- בחר --</option>
              <option value="קל" ${a && a.damageSeverity === 'קל' ? 'selected' : ''}>קל</option>
              <option value="בינוני" ${a && a.damageSeverity === 'בינוני' ? 'selected' : ''}>בינוני</option>
              <option value="חמור" ${a && a.damageSeverity === 'חמור' ? 'selected' : ''}>חמור</option>
            </select>
          </div>
          <div class="field">
            <label for="notes">הערות שמאי</label>
            <textarea id="notes" name="notes" placeholder="הזן הערות…">${escapeHtml(a ? a.notes : '')}</textarea>
          </div>
          <div class="field">
            <label for="inspectionDate">תאריך בדיקה</label>
            <input id="inspectionDate" name="inspectionDate" type="date" value="${escapeHtml(a ? a.inspectionDate : todayIso)}" required />
          </div>
          <div class="field checkbox-field">
            <label>
              <input id="requiresFollowUp" name="requiresFollowUp" type="checkbox" ${a && a.requiresFollowUp ? 'checked' : ''} />
              נדרשת בדיקה חוזרת
            </label>
          </div>
          <div class="actions-row">
            <button type="submit">שמור הערכה</button>
            <button type="button" class="secondary" id="appraiser-cancel-btn">ביטול</button>
          </div>
          <div class="error" id="appraiser-form-error" style="display:none;"></div>
          <div id="appraiser-success" style="display:none; color:var(--success); font-size:13px; margin-top:8px;">✓ ההערכה נשמרה בהצלחה</div>
        </form>
      </div>
    `;

    document.getElementById('appraiser-back-btn').addEventListener('click', () => {
      window.location.hash = '#/appraiser';
    });
    document.getElementById('appraiser-cancel-btn').addEventListener('click', () => {
      window.location.hash = '#/appraiser';
    });

    document.getElementById('appraiser-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('appraiser-form-error');
      const successEl = document.getElementById('appraiser-success');
      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const formData = new FormData(e.target);
      const payload = {
        damageSeverity: formData.get('damageSeverity'),
        notes: formData.get('notes'),
        inspectionDate: formData.get('inspectionDate'),
        requiresFollowUp: document.getElementById('requiresFollowUp').checked,
      };

      try {
        await apiFetch(`/reports/${encodeURIComponent(id)}/appraiser-assessment`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        successEl.style.display = 'block';
        // Navigate back after short delay
        setTimeout(() => { window.location.hash = '#/appraiser'; }, 1200);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    });
  } catch (err) {
    app.innerHTML = `<div class="error">שגיאה בטעינת המבנה: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Municipal Portal -------------------------------------------------

async function renderMunicipalPortal() {
  if (!canViewMunicipal()) {
    app.innerHTML = `<div class="error" style="margin-top:40px; text-align:center;">⛔ אין לך הרשאה לצפות בפורטל רשויות מקומיות.</div>`;
    return;
  }
  app.innerHTML = `<div class="loading">טוען מבנים…</div>`;
  try {
    const reports = await apiFetch('/reports');

    const rows = reports.map((r) => {
      const hasApproval = !!r.municipalApproval;
      const approved = hasApproval && r.municipalApproval.approved;

      const approvalBadge = !hasApproval
        ? `<span class="badge" style="background:var(--border-light);color:var(--text-muted);">אין אישור</span>`
        : approved
          ? `<span class="badge" style="background:var(--success-bg);color:var(--success);">אושר ✓</span>`
          : `<span class="badge" style="background:var(--warn-bg);color:var(--warn);">לא אושר</span>`;

      return `
        <div class="card report-row municipal-building-row" data-id="${escapeHtml(r.id)}" style="cursor:pointer;">
          <div style="flex:1;">
            <strong>${escapeHtml(r.address)}</strong>
            <div class="meta">${escapeHtml(r.reporterName)} · ${escapeHtml(STATUS_LABELS[r.status] || r.status)}</div>
          </div>
          <div class="report-badges">
            <span class="badge ${escapeHtml(r.status)}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span>
            ${approvalBadge}
            <button class="secondary" style="font-size:12px; padding:4px 10px;" data-id="${escapeHtml(r.id)}">
              ${hasApproval ? 'עדכן אישור' : 'הזן אישור'}
            </button>
          </div>
        </div>`;
    }).join('');

    app.innerHTML = `
      <div class="list-toolbar">
        <div class="list-title">פורטל רשויות מקומיות</div>
      </div>
      ${rows.length === 0
        ? '<div class="empty">אין מבנים במערכת.</div>'
        : `<div id="municipal-list">${rows}</div>`}
    `;

    app.querySelectorAll('.municipal-building-row button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.hash = `#/municipal/${encodeURIComponent(btn.dataset.id)}`;
      });
    });

    app.querySelectorAll('.municipal-building-row').forEach((row) => {
      row.addEventListener('click', () => {
        window.location.hash = `#/reports/${encodeURIComponent(row.dataset.id)}`;
      });
    });
  } catch (err) {
    app.innerHTML = `<div class="error">❌ שגיאה בטעינת המבנים בפורטל רשויות: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderMunicipalForm(id) {
  if (!canSaveMunicipal()) {
    app.innerHTML = `<div class="error" style="margin-top:40px; text-align:center;">⛔ אין לך הרשאה לעדכן אישור רשות מקומית.</div>`;
    return;
  }
  app.innerHTML = `<div class="loading">טוען מבנה…</div>`;
  try {
    const report = await apiFetch(`/reports/${encodeURIComponent(id)}`);
    const m = report.municipalApproval;

    app.innerHTML = `
      <button class="secondary" id="municipal-back-btn">&larr; חזרה לפורטל רשויות</button>
      <div class="card" style="margin-top:12px;">
        <h2>אישור רשות מקומית — ${escapeHtml(report.address)}</h2>
        <div class="detail-grid" style="margin-bottom:16px;">
          <div class="label">כתובת</div><div>${escapeHtml(report.address)}</div>
          <div class="label">סטטוס</div><div><span class="badge ${escapeHtml(report.status)}">${escapeHtml(STATUS_LABELS[report.status] || report.status)}</span></div>
          <div class="label">מדווח</div><div>${escapeHtml(report.reporterName)}</div>
        </div>
        <form id="municipal-form">
          <div style="font-weight:600; font-size:14px; margin-bottom:12px;">מצב תשתיות</div>
          <div class="field checkbox-field">
            <label>
              <input id="waterSupplyOk" name="waterSupplyOk" type="checkbox" ${m && m.waterSupplyOk ? 'checked' : ''} />
              אספקת מים תקינה
            </label>
          </div>
          <div class="field checkbox-field">
            <label>
              <input id="electricitySupplyOk" name="electricitySupplyOk" type="checkbox" ${m && m.electricitySupplyOk ? 'checked' : ''} />
              אספקת חשמל תקינה
            </label>
          </div>
          <div class="field checkbox-field">
            <label>
              <input id="accessRoadsOpen" name="accessRoadsOpen" type="checkbox" ${m && m.accessRoadsOpen ? 'checked' : ''} />
              דרכי גישה פתוחות
            </label>
          </div>
          <div class="field checkbox-field">
            <label>
              <input id="environmentalHazardsCleared" name="environmentalHazardsCleared" type="checkbox" ${m && m.environmentalHazardsCleared ? 'checked' : ''} />
              מפגעים סביבתיים פונו
            </label>
          </div>
          <div class="field" style="margin-top:8px;">
            <label for="municipal-notes">הערות הרשות המקומית</label>
            <textarea id="municipal-notes" name="notes" placeholder="הזן הערות…">${escapeHtml(m ? m.notes : '')}</textarea>
          </div>
          <div style="border-top:1px solid var(--border); margin:16px 0;"></div>
          <div class="field checkbox-field">
            <label style="font-size:15px; font-weight:700; color: var(--text);">
              <input id="approved" name="approved" type="checkbox" ${m && m.approved ? 'checked' : ''} />
              אישור רשות מקומית — כן / לא
            </label>
          </div>
          <div class="actions-row">
            <button type="submit">שמור אישור</button>
            <button type="button" class="secondary" id="municipal-cancel-btn">ביטול</button>
          </div>
          <div class="error" id="municipal-form-error" style="display:none;"></div>
          <div id="municipal-success" style="display:none; color:var(--success); font-size:13px; margin-top:8px;">✓ האישור נשמר בהצלחה</div>
        </form>
      </div>
    `;

    document.getElementById('municipal-back-btn').addEventListener('click', () => {
      window.location.hash = '#/municipal';
    });
    document.getElementById('municipal-cancel-btn').addEventListener('click', () => {
      window.location.hash = '#/municipal';
    });

    document.getElementById('municipal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('municipal-form-error');
      const successEl = document.getElementById('municipal-success');
      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const payload = {
        waterSupplyOk: document.getElementById('waterSupplyOk').checked,
        electricitySupplyOk: document.getElementById('electricitySupplyOk').checked,
        accessRoadsOpen: document.getElementById('accessRoadsOpen').checked,
        environmentalHazardsCleared: document.getElementById('environmentalHazardsCleared').checked,
        notes: document.getElementById('municipal-notes').value,
        approved: document.getElementById('approved').checked,
      };

      try {
        await apiFetch(`/reports/${encodeURIComponent(id)}/municipal-approval`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        successEl.style.display = 'block';
        setTimeout(() => { window.location.hash = '#/municipal'; }, 1200);
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    });
  } catch (err) {
    app.innerHTML = `<div class="error">שגיאה בטעינת המבנה: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Notification Center ----------------------------------------------

async function renderNotifications() {
  app.innerHTML = `<div class="loading">טוען הודעות…</div>`;
  try {
    // Fetch all required data
    let notifications = [];
    let currentMode = 'SUCCESS';
    let availableModes = ['SUCCESS', 'ALWAYS_FAIL', 'FAIL_FIRST_ATTEMPT', 'RANDOM_FAILURE', 'RESPONSE_LOST'];
    let buildingMap = {};

    try {
      notifications = await apiFetch('/notifications');
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      notifications = [];
    }
    try {
      const modeResponse = await apiFetch('/notifications/mode');
      currentMode = modeResponse.mode;
      if (modeResponse.modes) {
        availableModes = Object.values(modeResponse.modes);
      }
    } catch (err) {
      console.error('Failed to fetch notification mode:', err);
    }

    try {
      const reports = await apiFetch('/reports');
      reports.forEach(r => {
        buildingMap[r.id] = r.address;
      });
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }

    // Helper function to get status badge styling
    function getStatusStyle(status) {
      if (status === 'SENT') {
        return 'background: var(--success-bg); color: var(--success);';
      } else if (status === 'FAILED') {
        return 'background: var(--danger-bg); color: var(--danger);';
      }
      return 'background: var(--border-light); color: var(--text-muted);';
    }

    if (notifications.length === 0) {
      app.innerHTML = `
        <button class="secondary" id="back-btn">&larr; חזרה לרשימה</button>
        <div class="card" style="margin-top:12px;">
          <h2>מרכז הודעות</h2>
          <div style="margin-bottom: 16px; padding: 14px; background: var(--panel); border: 1px solid var(--panel-border); border-radius: var(--radius-sm);">
            <label style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 8px; text-transform:none; letter-spacing:normal; font-weight:600;">מצב שרת הודעות:</label>
            <select id="mode-selector" style="width: 100%; max-width: 250px; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;">
              ${availableModes.map(m => `<option value="${m}" ${m === currentMode ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="empty">אין הודעות שנשלחו עדיין.</div>
        </div>
      `;
      document.getElementById('back-btn').addEventListener('click', () => {
        window.location.hash = '#/';
      });
      document.getElementById('mode-selector').addEventListener('change', async (e) => {
        try {
          await apiFetch('/notifications/mode', {
            method: 'POST',
            body: JSON.stringify({ mode: e.target.value }),
          });
          renderNotifications();
        } catch (err) {
          alert('Failed to change mode: ' + err.message);
          renderNotifications();
        }
      });
      return;
    }

    app.innerHTML = `
      <button class="secondary" id="back-btn">&larr; חזרה לרשימה</button>
      <div class="card" style="margin-top:12px;">
        <h2>מרכז הודעות</h2>
        <div style="margin-bottom: 16px; padding: 14px; background: var(--panel); border: 1px solid var(--panel-border); border-radius: var(--radius-sm);">
          <label style="font-size: 13px; color: var(--text-muted); display: block; margin-bottom: 8px; text-transform:none; letter-spacing:normal; font-weight:600;">מצב שרת הודעות:</label>
          <select id="mode-selector" style="width: 100%; max-width: 250px; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;">
            ${availableModes.map(m => `<option value="${m}" ${m === currentMode ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border);">
                <th style="padding: 8px; text-align: right;">מזהה הודעה</th>
                <th style="padding: 8px; text-align: right;">מזהה מבנה</th>
                <th style="padding: 8px; text-align: right;">כתובת</th>
                <th style="padding: 8px; text-align: right;">אימייל</th>
                <th style="padding: 8px; text-align: right;">נושא</th>
                <th style="padding: 8px; text-align: right;">תאריך ושעה</th>
                <th style="padding: 8px; text-align: right;">סטטוס</th>
                <th style="padding: 8px; text-align: right;">Idempotency Key</th>
              </tr>
            </thead>
            <tbody>
              ${notifications.map(n => `
                <tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding: 8px;">${n.messageId ? escapeHtml(n.messageId.substring(0, 8)) + '...' : '—'}</td>
                  <td style="padding: 8px;">${n.buildingId ? escapeHtml(n.buildingId.substring(0, 8)) + '...' : '—'}</td>
                  <td style="padding: 8px;">${escapeHtml(buildingMap[n.buildingId] || 'לא ידוע')}</td>
                  <td style="padding: 8px;">${escapeHtml(n.email || '—')}</td>
                  <td style="padding: 8px;">${escapeHtml(n.subject || '—')}</td>
                  <td style="padding: 8px;">${n.timestamp ? new Date(n.timestamp).toLocaleString('he-IL') : '—'}</td>
                  <td style="padding: 8px;"><span class="badge" style="${getStatusStyle(n.status)}">${escapeHtml(n.status || '—')}</span></td>
                  <td style="padding: 8px; font-family: monospace; font-size: 11px;">${n.idempotencyKey ? escapeHtml(n.idempotencyKey.substring(0, 8)) + '...' : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => {
      window.location.hash = '#/';
    });

    document.getElementById('mode-selector').addEventListener('change', async (e) => {
      try {
        await apiFetch('/notifications/mode', {
          method: 'POST',
          body: JSON.stringify({ mode: e.target.value }),
        });
        renderNotifications();
      } catch (err) {
        alert('Failed to change mode: ' + err.message);
        renderNotifications();
      }
    });
  } catch (err) {
    app.innerHTML = `<div class="error">❌ שגיאה בטעינת ההודעות: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- Create Report ----------------------------------------------------

function renderCreate() {
  app.innerHTML = `
    <div class="card">
      <h2>דוח נזק חדש</h2>
      <form id="create-form">
        <div class="field">
          <label for="reporterName">שם המדווח</label>
          <input id="reporterName" name="reporterName" type="text" required />
        </div>
        <div class="field">
          <label for="address">כתובת</label>
          <input id="address" name="address" type="text" required />
        </div>
        <div class="field">
          <label for="damageType">סוג נזק</label>
          <input id="damageType" name="damageType" type="text" placeholder="למשל: דליפת מים, סדק מבני" required />
        </div>
        <div class="field">
          <label for="description">תיאור</label>
          <textarea id="description" name="description" required></textarea>
        </div>
        <div class="field checkbox-field">
          <label><input id="hasDamagePhotos" name="hasDamagePhotos" type="checkbox" /> תמונות נזק זמינות</label>
        </div>
        <div class="field checkbox-field">
          <label><input id="hasEngineerReport" name="hasEngineerReport" type="checkbox" /> דוח מהנדס זמין</label>
        </div>
        <div class="field checkbox-field">
          <label><input id="eligibilityChecked" name="eligibilityChecked" type="checkbox" /> נבדקה זכאות</label>
        </div>
        <div class="field">
          <label for="apartmentCount">מספר דירות</label>
          <input id="apartmentCount" name="apartmentCount" type="number" min="0" value="0" />
        </div>
        <div class="field">
          <label for="familyEmail">אימייל משפחה</label>
          <input id="familyEmail" name="familyEmail" type="email" placeholder="family@example.com" />
        </div>
        <div class="actions-row">
          <button type="submit">צור דוח</button>
          <button type="button" class="secondary" id="cancel-btn">ביטול</button>
        </div>
        <div class="error" id="form-error" style="display:none;"></div>
      </form>
    </div>
  `;

  document.getElementById('cancel-btn').addEventListener('click', () => {
    window.location.hash = '#/';
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('form-error');
    errorEl.style.display = 'none';

    const formData = new FormData(e.target);
    const payload = {
      reporterName: formData.get('reporterName'),
      address: formData.get('address'),
      damageType: formData.get('damageType'),
      description: formData.get('description'),
      hasDamagePhotos: formData.has('hasDamagePhotos'),
      hasEngineerReport: formData.has('hasEngineerReport'),
      eligibilityChecked: formData.has('eligibilityChecked'),
      apartmentCount: Number(formData.get('apartmentCount') || 0),
      familyEmail: formData.get('familyEmail'),
    };

    try {
      const created = await apiFetch('/reports', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      window.location.hash = `#/reports/${encodeURIComponent(created.id)}`;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ---------- Report Details ----------------------------------------------------

async function renderDetails(id) {
  app.innerHTML = `<div class="loading">טוען דוח…</div>`;
  try {
    const report = await apiFetch(`/reports/${encodeURIComponent(id)}`);
    paintDetails(report);
  } catch (err) {
    app.innerHTML = `<div class="error">❌ שגיאה בטעינת הדוח: ${escapeHtml(err.message)}</div>`;
  }
}

function paintDetails(report) {
  const statusOptions = Object.keys(STATUS_LABELS)
    .map((s) => `<option value="${s}" ${s === report.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`)
    .join('');

  const canBeginRehabilitation = BudgetEligibilityService.canBeginRehabilitation(report);
  const needsSocialApproval = BudgetEligibilityService.isSocialApprovalRequired(report);
  const hasSocialApproval = BudgetEligibilityService.hasSocialApproval(report);
  const canOpenBudget = BudgetEligibilityService.canOpenBudget(report);
  const canGenerateReturnHomePackage = BudgetEligibilityService.canGenerateReturnHomePackage(report);
  const isReadyForSettlement = BudgetEligibilityService.isReadyForSettlement(report);
  const rehabilitationMessage = canBeginRehabilitation
    ? 'ניתן להתחיל בתהליך שיקום'
    : 'חסר מידע להתחלת תהליך שיקום';
  const budgetWarning = !canOpenBudget
    ? (needsSocialApproval && !hasSocialApproval
        ? 'נדרש אישור חברתי למבנים עם יותר מ-24 דירות.'
        : 'מלא את כל הפרטים הנדרשים לפני פתיחת בקשת תקציב: דוח מהנדס, בדיקת זכאות, ותמונות נזק.')
    : '';

  // Appraiser assessment section
  const a = report.appraiserAssessment;
  const appraiserSection = a ? `
    <div class="appraiser-section">
      <h3>📋 הערכת שמאי</h3>
      <div class="detail-grid">
        <div class="label">דרגת נזק</div><div><span class="badge severity-${escapeHtml(a.damageSeverity)}">${escapeHtml(a.damageSeverity)}</span></div>
        <div class="label">תאריך בדיקה</div><div>${escapeHtml(a.inspectionDate)}</div>
        <div class="label">בדיקה חוזרת</div><div>${a.requiresFollowUp ? 'כן' : 'לא'}</div>
        <div class="label">הערות</div><div>${escapeHtml(a.notes || '—')}</div>
        <div class="label">נשמר בתאריך</div><div>${new Date(a.savedAt).toLocaleString('he-IL')}</div>
      </div>
    </div>` : `
    <div class="appraiser-section" style="background:var(--panel); border-color:var(--panel-border); border-right-color:var(--panel-border);">
      <h3 style="color:var(--text-muted);">📋 הערכת שמאי</h3>
      <div style="color:var(--muted); font-size:14px;">טרם הוזנה הערכת שמאי למבנה זה.</div>
    </div>`;

  // Municipal approval section
  const mu = report.municipalApproval;
  const municipalSection = mu ? `
    <div class="municipal-section${mu.approved ? '' : ' not-approved'}">
      <h3>🏛 אישור רשות מקומית${mu.approved ? ' ✓' : ' — לא אושר'}</h3>
      <div class="detail-grid">
        <div class="label">אספקת מים</div><div>${mu.waterSupplyOk ? '✓ תקינה' : '✗ לא תקינה'}</div>
        <div class="label">אספקת חשמל</div><div>${mu.electricitySupplyOk ? '✓ תקינה' : '✗ לא תקינה'}</div>
        <div class="label">דרכי גישה</div><div>${mu.accessRoadsOpen ? '✓ פתוחות' : '✗ סגורות'}</div>
        <div class="label">מפגעים סביבתיים</div><div>${mu.environmentalHazardsCleared ? '✓ פונו' : '✗ לא פונו'}</div>
        <div class="label">הערות</div><div>${escapeHtml(mu.notes || '—')}</div>
        <div class="label">אישור</div><div>${mu.approved ? '<span class="badge" style="background:var(--success-bg);color:var(--success);">אושר</span>' : '<span class="badge" style="background:var(--warn-bg);color:var(--warn);">לא אושר</span>'}</div>
        <div class="label">נשמר בתאריך</div><div>${new Date(mu.savedAt).toLocaleString('he-IL')}</div>
      </div>
    </div>` : `
    <div class="municipal-section not-approved">
      <h3>🏛 אישור רשות מקומית</h3>
      <div style="color:var(--muted); font-size:14px;">טרם הוזן אישור רשות מקומית למבנה זה.</div>
    </div>`;

  app.innerHTML = `
    <button class="secondary" id="back-btn">&larr; חזרה לרשימה</button>
    <div class="card" style="margin-top:12px;">
      <h2>${escapeHtml(report.damageType)}</h2>
      <div class="detail-grid">
        <div class="label">מזהה דוח</div><div>${escapeHtml(report.id)}</div>
        <div class="label">מדווח</div><div>${escapeHtml(report.reporterName)}</div>
        <div class="label">כתובת</div><div>${escapeHtml(report.address)}</div>
        <div class="label">תיאור</div><div>${escapeHtml(report.description)}</div>
        <div class="label">תמונות נזק</div><div>${report.hasDamagePhotos ? 'כן' : 'לא'}</div>
        <div class="label">דוח מהנדס</div><div>${report.hasEngineerReport ? 'כן' : 'לא'}</div>
        <div class="label">נבדקה זכאות</div><div>${report.eligibilityChecked ? 'כן' : 'לא'}</div>
        <div class="label">אישור חברתי</div><div>${hasSocialApproval ? 'כן' : 'לא'}</div>
        <div class="label">מספר דירות</div><div>${escapeHtml(String(report.apartmentCount ?? 0))}</div>
        <div class="label">אימייל משפחה</div><div>${escapeHtml(report.familyEmail || 'לא צוין')}</div>
        <div class="label">נוצר בתאריך</div><div>${new Date(report.createdAt).toLocaleString()}</div>
        <div class="label">סטטוס</div><div><span class="badge ${escapeHtml(report.status)}">${escapeHtml(STATUS_LABELS[report.status] || report.status)}</span></div>
      </div>
      <div class="card" style="background:var(--panel); border-color:var(--panel-border);">
        <strong>${escapeHtml(rehabilitationMessage)}</strong>
      </div>
      <div class="card" style="background:${isReadyForSettlement ? 'var(--success-bg)' : 'var(--warn-bg)'}; border-color:${isReadyForSettlement ? 'var(--success-border)' : 'var(--warn-border)'}; margin-top:8px;">
        <strong style="color:${isReadyForSettlement ? 'var(--success)' : 'var(--warn)'};">
          🏙 כשירות לפתיחת יישוב: ${isReadyForSettlement ? 'כשיר ✓' : 'אינו כשיר'}
        </strong>
      </div>
      ${appraiserSection}
      ${municipalSection}
      <div class="actions-row">
        <label for="status-select" style="margin:0;">שנה סטטוס:</label>
        <select id="status-select">${statusOptions}</select>
        <button id="save-status-btn">עדכן סטטוס</button>
        <button id="open-budget-btn" ${(canOpenBudget && canOpenBudgetRole()) ? '' : 'disabled'}>${canOpenBudget ? (canOpenBudgetRole() ? 'פתח בקשת תקציב' : 'פתח בקשת תקציב (אין הרשאה)') : 'פתח בקשת תקציב (לא זמין)'}</button>
        <button id="return-home-btn" class="secondary" ${canGenerateReturnHomePackage ? '' : 'disabled'}>${canGenerateReturnHomePackage ? 'הפק תיק אכלוס מחדש' : 'הפק תיק אכלוס מחדש (לא זמין)'}</button>
        <button id="edit-report-btn" class="secondary">ערוך דוח</button>
      </div>
      <div class="error" id="budget-warning" style="display:${budgetWarning ? 'block' : 'none'}; margin-top: 8px;">
        ${escapeHtml(budgetWarning)}
      </div>
      <div class="error" id="status-error" style="display:none;"></div>
    </div>
    <div class="card" id="audit-log-section" style="margin-top:12px;">
      <h3 style="margin:0 0 12px; font-size:15px;">📜 היסטוריית פעולות</h3>
      <div id="audit-log-content"><div class="loading">טוען...</div></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    window.location.hash = '#/';
  });

  document.getElementById('save-status-btn').addEventListener('click', async () => {
    const newStatus = document.getElementById('status-select').value;
    const errorEl = document.getElementById('status-error');
    errorEl.style.display = 'none';
    try {
      const updated = await apiFetch(`/reports/${encodeURIComponent(report.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      paintDetails(updated);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('open-budget-btn').addEventListener('click', async () => {
    if (!canOpenBudget) {
      return;
    }
    try {
      await apiFetch(`/reports/${encodeURIComponent(report.id)}/open-budget`, { method: 'POST' });
    } catch (_) { /* best-effort — logging, not blocking */ }
    alert('בקשת תקציב נפתחה.');
  });

  document.getElementById('return-home-btn').addEventListener('click', async () => {
    if (!canGenerateReturnHomePackage) {
      return;
    }
    
    const btn = document.getElementById('return-home-btn');
    btn.disabled = true;
    btn.textContent = 'מייצר...';
    
    try {
      const result = await apiFetch(`/buildings/${encodeURIComponent(report.id)}/return-home-package`, {
        method: 'POST',
      });
      
      const pdfUrl = result.url;
      const newWindow = window.open(pdfUrl, '_blank');
      if (!newWindow) {
        alert('PDF generated successfully. Please allow popups to view the document.');
      }
    } catch (err) {
      alert(`Failed to generate return home package: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'הפק תיק אכלוס מחדש';
    }
  });

  document.getElementById('edit-report-btn').addEventListener('click', () => {
    renderEditForm(report);
  });

  // Load audit log asynchronously after DOM is ready
  loadAuditLog(report.id);
}

async function loadAuditLog(buildingId) {
  const container = document.getElementById('audit-log-content');
  if (!container) return;
  try {
    const entries = await apiFetch(`/audit-log/buildings/${encodeURIComponent(buildingId)}`);
    if (entries.length === 0) {
      container.innerHTML = `<div style="color:var(--muted); font-size:13px; padding:8px 0;">אין פעולות מתועדות עבור מבנה זה.</div>`;
      return;
    }
    container.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:2px solid var(--border);">
            <th style="padding:8px; text-align:right; color:var(--muted); font-weight:600;">תאריך ושעה</th>
            <th style="padding:8px; text-align:right; color:var(--muted); font-weight:600;">משתמש</th>
            <th style="padding:8px; text-align:right; color:var(--muted); font-weight:600;">פעולה</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px; white-space:nowrap;">${new Date(e.timestamp).toLocaleString('he-IL')}</td>
              <td style="padding:8px;">${escapeHtml(e.userName)}</td>
              <td style="padding:8px;">${escapeHtml(e.action)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color:var(--muted); font-size:13px;">לא ניתן לטעון היסטוריית פעולות.</div>`;
  }
}

function renderEditForm(report) {
  app.innerHTML = `
    <button class="secondary" id="back-btn">&larr; חזרה לדוח</button>
    <div class="card" style="margin-top:12px;">
      <h2>ערוך דוח נזק</h2>
      <form id="edit-form">
        <div class="field">
          <label for="reporterName">שם המדווח</label>
          <input id="reporterName" name="reporterName" type="text" value="${escapeHtml(report.reporterName)}" required />
        </div>
        <div class="field">
          <label for="address">כתובת</label>
          <input id="address" name="address" type="text" value="${escapeHtml(report.address)}" required />
        </div>
        <div class="field">
          <label for="damageType">סוג נזק</label>
          <input id="damageType" name="damageType" type="text" value="${escapeHtml(report.damageType)}" required />
        </div>
        <div class="field">
          <label for="description">תיאור</label>
          <textarea id="description" name="description" required>${escapeHtml(report.description)}</textarea>
        </div>
        <div class="field checkbox-field">
          <label><input id="hasDamagePhotos" name="hasDamagePhotos" type="checkbox" ${report.hasDamagePhotos ? 'checked' : ''} /> תמונות נזק זמינות</label>
        </div>
        <div class="field checkbox-field">
          <label><input id="hasEngineerReport" name="hasEngineerReport" type="checkbox" ${report.hasEngineerReport ? 'checked' : ''} /> דוח מהנדס זמין</label>
        </div>
        <div class="field checkbox-field">
          <label><input id="eligibilityChecked" name="eligibilityChecked" type="checkbox" ${report.eligibilityChecked ? 'checked' : ''} /> נבדקה זכאות</label>
        </div>
        <div class="field checkbox-field">
          <label><input id="socialApproval" name="socialApproval" type="checkbox" ${report.socialApproval ? 'checked' : ''} /> אישור חברתי</label>
        </div>
        <div class="field">
          <label for="apartmentCount">מספר דירות</label>
          <input id="apartmentCount" name="apartmentCount" type="number" min="0" value="${escapeHtml(String(report.apartmentCount ?? 0))}" />
        </div>
        <div class="field">
          <label for="familyEmail">אימייל משפחה</label>
          <input id="familyEmail" name="familyEmail" type="email" value="${escapeHtml(report.familyEmail || '')}" placeholder="family@example.com" />
        </div>
        <div class="actions-row">
          <button type="submit">שמור שינויים</button>
          <button type="button" class="secondary" id="cancel-edit-btn">ביטול</button>
        </div>
        <div class="error" id="edit-error" style="display:none;"></div>
      </form>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    paintDetails(report);
  });
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    paintDetails(report);
  });

  document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('edit-error');
    errorEl.style.display = 'none';

    const formData = new FormData(e.target);
    const payload = {
      reporterName: formData.get('reporterName'),
      address: formData.get('address'),
      damageType: formData.get('damageType'),
      description: formData.get('description'),
      hasDamagePhotos: formData.has('hasDamagePhotos'),
      hasEngineerReport: formData.has('hasEngineerReport'),
      eligibilityChecked: formData.has('eligibilityChecked'),
      socialApproval: formData.has('socialApproval'),
      apartmentCount: Number(formData.get('apartmentCount') || 0),
      familyEmail: formData.get('familyEmail'),
    };

    try {
      const updated = await apiFetch(`/reports/${encodeURIComponent(report.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      paintDetails(updated);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ---------- Settlement Processes ---------------------------------------------

async function renderSettlementProcesses() {
  app.innerHTML = `<div class="loading">טוען תהליכים…</div>`;
  try {
    const processes = await apiFetch('/settlement-processes');

    const STATUS_PROCESS_LABELS = { PROCESSING: 'בתהליך', COMPLETED: 'הושלם' };

    const rows = processes.length === 0
      ? '<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--muted);">אין תהליכים רשומים.</td></tr>'
      : processes.map(p => {
          const statusStyle = p.status === 'COMPLETED'
            ? 'background:var(--success-bg); color:var(--success);'
            : 'background:var(--primary-light); color:var(--primary);';
          return `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:10px;">${escapeHtml(p.settlementName || '—')}</td>
              <td style="padding:10px;">${escapeHtml(p.startedBy || '—')}</td>
              <td style="padding:10px; white-space:nowrap;">${new Date(p.startedAt).toLocaleString('he-IL')}</td>
              <td style="padding:10px; white-space:nowrap;">${p.completedAt ? new Date(p.completedAt).toLocaleString('he-IL') : '—'}</td>
              <td style="padding:10px;"><span class="badge" style="${statusStyle}">${escapeHtml(STATUS_PROCESS_LABELS[p.status] || p.status)}</span></td>
            </tr>`;
        }).join('');

    app.innerHTML = `
      <div class="list-toolbar">
        <div class="list-title">תהליכי אכלוס</div>
      </div>
      <div class="card" style="padding:0; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border); background:var(--panel);">
              <th style="padding:12px; text-align:right; font-weight:600;">יישוב</th>
              <th style="padding:12px; text-align:right; font-weight:600;">הופעל על ידי</th>
              <th style="padding:12px; text-align:right; font-weight:600;">זמן התחלה</th>
              <th style="padding:12px; text-align:right; font-weight:600;">זמן סיום</th>
              <th style="padding:12px; text-align:right; font-weight:600;">סטטוס</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    app.innerHTML = `<div class="error">❌ שגיאה בטעינת התהליכים: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- System Health ----------------------------------------------------

async function renderSystemHealth() {
  app.innerHTML = `<div class="loading">טוען נתוני מערכת…</div>`;
  try {
    const h = await apiFetch('/system-health');
    const sp = h.settlementProcesses;
    const no = h.notifications;
    const perf = h.performance;

    const total = (sp.completed || 0) + (sp.processing || 0);
    const notifTotal = (no.successful || 0) + (no.failed || 0);
    const successRate = notifTotal > 0
      ? Math.round((no.successful / notifTotal) * 100) : null;

    const avgDur = perf.avgSettlementDurationSec !== null
      ? `${perf.avgSettlementDurationSec}s`
      : '—';

    function metricCard(icon, label, value, sub, color) {
      return `
        <div class="card" style="flex:1; min-width:180px; border-top:3px solid ${color}; text-align:center;">
          <div style="font-size:28px; margin-bottom:6px;">${icon}</div>
          <div style="font-size:32px; font-weight:800; color:${color};">${value}</div>
          <div style="font-size:13px; font-weight:700; color:var(--text); margin-top:4px;">${label}</div>
          ${sub ? `<div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${sub}</div>` : ''}
        </div>`;
    }

    app.innerHTML = `
      <div class="list-toolbar">
        <div class="list-title">System Health</div>
        <button class="secondary" id="health-refresh-btn">↻ רענן</button>
      </div>

      <div class="card" style="margin-bottom:8px; padding:14px 20px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:14px;">תהליכי אכלוס</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          ${metricCard('✅', 'Completed',  sp.completed  || 0, `מתוך ${total} תהליכים`, 'var(--success)')}
          ${metricCard('⏳', 'Processing', sp.processing || 0, total > 0 ? `${Math.round(((sp.processing||0)/total)*100)}% פעיל` : null, 'var(--primary)')}
        </div>
      </div>

      <div class="card" style="margin-bottom:8px; padding:14px 20px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:14px;">הודעות</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          ${metricCard('📨', 'Successful', no.successful || 0, successRate !== null ? `${successRate}% הצלחה` : null, 'var(--success)')}
          ${metricCard('❌', 'Failed',     no.failed     || 0, notifTotal > 0 ? `מתוך ${notifTotal} ניסיונות` : null, no.failed > 0 ? 'var(--danger)' : 'var(--text-muted)')}
          ${metricCard('🔄', 'Retry Count', no.retryCount || 0, null, no.retryCount > 0 ? 'var(--warn)' : 'var(--text-muted)')}
        </div>
      </div>

      <div class="card" style="padding:14px 20px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:14px;">ביצועים</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          ${metricCard('⏱', 'Avg Settlement Duration', avgDur, perf.avgSettlementDurationSec !== null ? 'ממוצע זמן הפקה' : 'אין נתונים עדיין', 'var(--purple)')}
        </div>
      </div>
    `;

    document.getElementById('health-refresh-btn').addEventListener('click', renderSystemHealth);
  } catch (err) {
    app.innerHTML = `<div class="error">שגיאה בטעינת נתוני מערכת: ${escapeHtml(err.message)}</div>`;
  }
}
