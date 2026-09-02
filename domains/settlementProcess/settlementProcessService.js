/**
 * Settlement Process Domain — tracks bulk "return home package" generation runs.
 *
 * Each time a user triggers "הפקת תיקי אכלוס ליישוב", a SettlementProcess
 * record is created (PROCESSING) and later updated to COMPLETED.
 *
 * Storage: file-backed (settlement-processes.json) — persists across restarts.
 */

const { randomUUID } = require('crypto');
const fs   = require('fs');
const path = require('path');

const STATUS = { PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED' };

const STORAGE_FILE = path.join(__dirname, '..', '..', 'settlement-processes.json');

let processes = [];

function load() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    if (Array.isArray(data)) processes = data;
  } catch (err) {
    console.error('Failed to load settlement processes:', err);
  }
}

function save() {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(processes, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save settlement processes:', err);
  }
}

// Load on startup
load();

const SettlementProcessService = {
  STATUS,

  create({ settlementName, startedBy }) {
    const entry = {
      id: randomUUID(),
      settlementName: String(settlementName || '').trim() || 'כל המבנים',
      startedBy: String(startedBy || '').trim(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: STATUS.PROCESSING,
    };
    processes.push(entry);
    save();
    return entry;
  },

  complete(id) {
    const entry = processes.find((p) => p.id === id);
    if (!entry) return null;
    entry.completedAt = new Date().toISOString();
    entry.status = STATUS.COMPLETED;
    save();
    return entry;
  },

  getAll() {
    return processes.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  },
};

module.exports = SettlementProcessService;
