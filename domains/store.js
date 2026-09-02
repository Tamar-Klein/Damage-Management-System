/**
 * Shared file-backed storage.
 *
 * This module is the ONLY place that reads/writes reports.json.
 * Domain modules access data exclusively through this store,
 * and each domain only reads/writes its own fields.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STORAGE_FILE = path.join(__dirname, '..', 'reports.json');

let reports = [];

function load() {
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

function save() {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save reports:', err);
  }
}

// Internal: get the raw report array (for domain-internal use only)
function _getAll() {
  return reports;
}

// Internal: find by id
function _findById(id) {
  return reports.find((r) => r.id === id) || null;
}

// Internal: persist after mutation
function _save() {
  save();
}

// Internal: generate a new UUID
function _newId() {
  return randomUUID();
}

// Initialize storage
function initialize(seedFn) {
  const persisted = load();
  if (persisted) {
    reports = persisted;
  } else {
    if (seedFn) seedFn(reports);
    save();
  }
}

module.exports = { _getAll, _findById, _save, _newId, initialize };
