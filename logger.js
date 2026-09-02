/**
 * Application Logger
 *
 * Writes structured JSON log lines to logs/settlement-process.log
 * and also prints to the console.
 *
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('PDF_STARTED', { settlementName, buildingId });
 *   logger.warn('NOTIFICATION_FAILED', { buildingId, attempt, error });
 *   logger.error('PROCESS_FAILED', { settlementName, error });
 */

const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'settlement-process.log');

// Ensure logs/ directory exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function write(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };

  // Remove undefined/null values for cleaner output
  Object.keys(entry).forEach((k) => {
    if (entry[k] === undefined || entry[k] === null) delete entry[k];
  });

  const line = JSON.stringify(entry) + '\n';

  // Write to file (append)
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    console.error('[logger] Failed to write log:', err.message);
  }

  // Also print to console with color
  const colors = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m' };
  const reset  = '\x1b[0m';
  console.log(`${colors[level] || ''}[${level}] ${entry.timestamp} — ${event}${reset}`, fields);
}

module.exports = {
  info:  (event, fields) => write('INFO',  event, fields),
  warn:  (event, fields) => write('WARN',  event, fields),
  error: (event, fields) => write('ERROR', event, fields),
  LOG_FILE,
};
