/**
 * Settlement access middleware.
 *
 * For MUNICIPALITY users: verifies the requested building belongs to
 * their settlement (req.currentUser.settlementId === building.settlementId).
 *
 * MINISTRY and APPRAISER users pass through unconditionally.
 *
 * Must be used AFTER requireAuth.
 * Expects req.params.id to be the building id.
 */

const store = require('../domains/store');
const ROLES = require('../domains/users/usersService').ROLES;

function requireSettlementAccess(req, res, next) {
  const user = req.currentUser;

  // MINISTRY and APPRAISER can access all buildings
  if (user.role !== ROLES.MUNICIPALITY) {
    return next();
  }

  const buildingId = req.params.id;
  const building = store._findById(buildingId);

  if (!building) {
    // Let the route handler return the 404
    return next();
  }

  if (building.settlementId !== user.settlementId) {
    return res.status(403).json({
      error: `אין הרשאה לגשת למבנה זה. מבנה זה שייך ליישוב "${building.settlementId || 'לא ידוע'}", ולא ליישוב שלך ("${user.settlementId}").`,
    });
  }

  next();
}

module.exports = requireSettlementAccess;
