const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const NOTIFICATIONS_FILE = path.join(__dirname, 'notifications.csv');

// Server modes
const MODES = {
  SUCCESS: 'SUCCESS',
  ALWAYS_FAIL: 'ALWAYS_FAIL',
  FAIL_FIRST_ATTEMPT: 'FAIL_FIRST_ATTEMPT',
  RANDOM_FAILURE: 'RANDOM_FAILURE',
  RESPONSE_LOST: 'RESPONSE_LOST',
};

// Current server mode and tracking for FAIL_FIRST_ATTEMPT
let currentMode = MODES.SUCCESS;
let firstAttemptTracker = new Map(); // Track first attempt per buildingId+email combo
let notificationsInMemory = []; // Keep notifications in memory

// Escape CSV field (wrap in quotes and escape internal quotes)
function escapeCsvField(field) {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

// Parse CSV line (handle quoted fields with escaped quotes)
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// Parse entire CSV content, correctly handling fields that contain newlines
function parseCsvContent(content) {
  const records = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += char;
      }
    } else if ((char === '\n' || (char === '\r' && content[i + 1] === '\n')) && !inQuotes) {
      if (char === '\r') i++; // skip \n after \r
      if (current.trim()) records.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) records.push(current);
  return records;
}

// Initialize notifications file if it doesn't exist
function initializeNotificationsFile() {
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    // Create CSV header
    const header = 'messageId,buildingId,email,subject,body,timestamp,status,idempotencyKey\n';
    fs.writeFileSync(NOTIFICATIONS_FILE, header, 'utf8');
  } else {
    try {
      const content = fs.readFileSync(NOTIFICATIONS_FILE, 'utf8');
      const records = parseCsvContent(content);

      // Detect whether the file has the idempotencyKey column (new format)
      const headerFields = parseCsvLine(records[0] || '');
      const hasIdempotencyKey = headerFields.includes('idempotencyKey');

      notificationsInMemory = [];
      for (let i = 1; i < records.length; i++) {
        if (records[i].trim()) {
          const fields = parseCsvLine(records[i]);
          // Only push records that have at least a messageId
          if (fields[0]) {
            notificationsInMemory.push({
              messageId: fields[0],
              buildingId: fields[1] || '',
              email: fields[2] || '',
              subject: fields[3] || '',
              body: fields[4] || '',
              timestamp: fields[5] || '',
              status: fields[6] || '',
              idempotencyKey: hasIdempotencyKey ? (fields[7] || '') : '',
            });
          }
        }
      }

      // Migrate file to new format if idempotencyKey column was missing
      if (!hasIdempotencyKey) {
        const newHeader = 'messageId,buildingId,email,subject,body,timestamp,status,idempotencyKey\n';
        const rows = notificationsInMemory
          .map(n => [
            n.messageId, n.buildingId, n.email, n.subject,
            n.body, n.timestamp, n.status, n.idempotencyKey,
          ].map(escapeCsvField).join(','))
          .join('\n');
        fs.writeFileSync(NOTIFICATIONS_FILE, newHeader + (rows ? rows + '\n' : ''), 'utf8');
      }
    } catch (err) {
      console.error('Error reading notifications file, starting fresh:', err);
      notificationsInMemory = [];
      const header = 'messageId,buildingId,email,subject,body,timestamp,status,idempotencyKey\n';
      fs.writeFileSync(NOTIFICATIONS_FILE, header, 'utf8');
    }
  }
}

// Log notification to file
function logNotification(notification) {
  notificationsInMemory.push(notification);
  try {
    const csvLine = [
      notification.messageId,
      notification.buildingId,
      notification.email,
      notification.subject,
      notification.body,
      notification.timestamp,
      notification.status,
      notification.idempotencyKey,
    ].map(escapeCsvField).join(',') + '\n';
    
    fs.appendFileSync(NOTIFICATIONS_FILE, csvLine, 'utf8');
  } catch (err) {
    console.error('Failed to write notifications:', err);
  }
}

// Check whether a notification with this idempotencyKey was already sent successfully
function wasAlreadySentSuccessfully(idempotencyKey) {
  return notificationsInMemory.some(
    n => n.idempotencyKey === idempotencyKey && n.status === 'SENT'
  );
}

// Get all notifications
function getAllNotifications() {
  return notificationsInMemory.slice().reverse(); // Most recent first
}

// Determine if send should succeed based on current mode
function shouldSucceed(buildingId, email) {
  if (currentMode === MODES.SUCCESS) {
    return true;
  }
  
  if (currentMode === MODES.ALWAYS_FAIL) {
    return false;
  }
  
  if (currentMode === MODES.FAIL_FIRST_ATTEMPT) {
    const key = `${buildingId}|${email}`;
    if (!firstAttemptTracker.has(key)) {
      firstAttemptTracker.set(key, true);
      return false; // First attempt fails
    }
    return true; // Subsequent attempts succeed
  }
  
  if (currentMode === MODES.RANDOM_FAILURE) {
    return Math.random() > 0.3; // 70% success rate (30% failure)
  }
  
  return true;
}

// Determine if response should be lost (timeout) based on current mode
function shouldReturnTimeout() {
  return currentMode === MODES.RESPONSE_LOST;
}
// Mock Notification Server
const MockNotificationServer = {
  initialize() {
    initializeNotificationsFile();
  },

  async sendNotification(buildingId, email, subject, body, idempotencyKey) {
    // Idempotency check — if already sent successfully for this key, don't send again
    if (idempotencyKey && wasAlreadySentSuccessfully(idempotencyKey)) {
      return { status: 'ALREADY_SENT', messageId: null };
    }

    const messageId = randomUUID();
    const timestamp = new Date().toISOString();
    const success = shouldSucceed(buildingId, email);
    const status = success ? 'SENT' : 'FAILED';
    
    const notification = {
      messageId,
      buildingId,
      email,
      subject,
      body,
      timestamp,
      status,
      idempotencyKey: idempotencyKey || '',
    };
    
    // Log notification
    logNotification(notification);
    
    // Return response
    // If RESPONSE_LOST mode: simulate timeout by never returning
    if (shouldReturnTimeout()) {
      return new Promise(() => {
        // Never resolve or reject - simulates hanging response
      });
    }
    
    return {
      status: status,
      messageId,
    };
  },

  getAllNotifications() {
    return getAllNotifications();
  },

  setMode(mode) {
    if (Object.values(MODES).includes(mode)) {
      currentMode = mode;
      // Reset tracker when changing modes
      if (mode === MODES.FAIL_FIRST_ATTEMPT) {
        firstAttemptTracker.clear();
      }
      return true;
    }
    return false;
  },

  getMode() {
    return currentMode;
  },

  getModes() {
    return MODES;
  },

  resetFirstAttemptTracker() {
    firstAttemptTracker.clear();
  },
};

module.exports = MockNotificationServer;
