/**
 * Settlement-scope authorization middleware.
 *
 * Enforces that a MUNICIPALITY user can only access buildings
 * that belong to their own settlement (req.currentUser.settlementId).
 *
 * Rules:
 *   - MINISTRY and APPRAISER users are never blocked (no settlement restriction).
 *   - MUNICIPALITY users are blocked when the target building's settlementId
 *     does not match the user's settlementId.
 *   - Must be used AFTER requireAuth (req.currentUser must be populated).
 *   - The building id is expected in req.params.id.
 *
 * For LIST routes (no :id param) use filterBySettlement instead — it narrows
 * the result set rather than blocking the request outright.
 */

const store = require('../domains/store');

/**
 * Single-resource guard.
 * Reads :id from req.params, looks up the building, and returns 403 if the
 * calling MUNICIPALITY user does not own that settlement.
 */
function requireSettlement(req, res, next) {
  const user = req.currentUser;

  // Only MUNICIPALITY users are scope-restricted
  if (!user || user.role !== 'MUNICIPALITY') return next();

  const buildingId = req.params.id;
  const report = store._findById(buildingId);

  // If the building does not exist, let the domain handler return the 404
  if (!report) return next();

  if (report.settlementId !== user.settlementId) {
    return res.status(403).json({
      error: 'אין הרשאה לגשת למבנה זה. המבנה אינו שייך ליישוב שלך.',
    });
  }

  next();
}

module.exports = requireSettlement;
