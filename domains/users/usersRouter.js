/**
 * Users Domain — HTTP Router
 *
 * POST /auth/login   { username, password } → { token, user }
 * POST /auth/logout                         → 204
 * GET  /auth/me      (requires session)     → { user }
 */

const express = require('express');
const UsersService = require('./usersService');

const router = express.Router();

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'נדרשים שם משתמש וסיסמה' });
  }
  const result = UsersService.login(username, password);
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }
  res.json({ token: result.token, user: result.user });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'] || (req.body || {}).token;
  if (token) UsersService.logout(token);
  res.status(204).end();
});

// GET /auth/me — returns current user based on token header
router.get('/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  const user = UsersService.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'לא מחובר' });
  res.json({ user });
});

module.exports = router;
