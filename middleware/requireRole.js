/**
 * Role authorization middleware.
 *
 * Usage:  requireRole('MINISTRY', 'APPRAISER')
 * Returns 403 when the authenticated user's role is not in the allowed list.
 *
 * Always used AFTER requireAuth (which populates req.currentUser).
 */

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.currentUser && req.currentUser.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `אין הרשאה לבצע פעולה זו. נדרש תפקיד: ${allowedRoles.join(' / ')}`,
      });
    }
    next();
  };
}

module.exports = requireRole;
