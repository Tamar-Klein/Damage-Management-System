/**
 * Auth middleware.
 *
 * Reads the X-Auth-Token header, resolves it to a user, and attaches
 * the user to req.currentUser.
 *
 * Returns 401 if no valid session is found.
 */

const UsersService = require('../domains/users/usersService');

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const user = UsersService.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'נדרשת התחברות' });
  }
  req.currentUser = user;
  next();
}

module.exports = requireAuth;
