/**
 * Users Domain — identity and session management.
 *
 * Each user has a role: MINISTRY | MUNICIPALITY | APPRAISER
 * MUNICIPALITY users also have a settlementId — they can only access
 * buildings that belong to their settlement.
 *
 * Sessions are stored in memory (map of sessionToken → userId).
 * Passwords are stored in plain text (coursework MVP).
 */

const { randomUUID } = require('crypto');

const ROLES = {
  MINISTRY:     'MINISTRY',
  MUNICIPALITY: 'MUNICIPALITY',
  APPRAISER:    'APPRAISER',
};

// ── Seed users ────────────────────────────────────────────────────────────────
// settlementId must match the settlementId stored on buildings.
// MUNICIPALITY users are restricted to their own settlement.
// MINISTRY and APPRAISER have no restriction (settlementId: null).
const USERS = [
  { id: 'u1', fullName: 'דנה לוי',    username: 'dana',   password: '1234', role: ROLES.MINISTRY,     settlementId: null         },
  { id: 'u2', fullName: 'יוסי כהן',   username: 'yossi',  password: '1234', role: ROLES.MINISTRY,     settlementId: null         },
  { id: 'u3', fullName: 'שרה מזרחי',  username: 'sarah',  password: '1234', role: ROLES.MUNICIPALITY, settlementId: 'ירושלים'    },
  { id: 'u4', fullName: 'משה ברגר',   username: 'moshe',  password: '1234', role: ROLES.MUNICIPALITY, settlementId: 'צפת'        },
  { id: 'u5', fullName: 'רחל אברהם',  username: 'rachel', password: '1234', role: ROLES.APPRAISER,    settlementId: null         },
  { id: 'u6', fullName: 'אורן דוד',   username: 'oren',   password: '1234', role: ROLES.MUNICIPALITY, settlementId: 'טבריה'      },
];

// sessionToken → userId
const sessions = new Map();

// ── Helper — public user shape (never exposes password) ──────────────────────
function toPublic(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    settlementId: user.settlementId || null,
  };
}

const UsersService = {
  ROLES,

  login(username, password) {
    const user = USERS.find(u => u.username === username && u.password === password);
    if (!user) return { success: false, error: 'שם משתמש או סיסמה שגויים' };
    const token = randomUUID();
    sessions.set(token, user.id);
    return { success: true, token, user: toPublic(user) };
  },

  logout(token) {
    sessions.delete(token);
  },

  getUserByToken(token) {
    if (!token) return null;
    const userId = sessions.get(token);
    if (!userId) return null;
    const user = USERS.find(u => u.id === userId);
    return user ? toPublic(user) : null;
  },

  getAllUsers() {
    return USERS.map(toPublic);
  },
};

module.exports = UsersService;
