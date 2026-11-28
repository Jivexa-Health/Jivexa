const { MongoDb } = require('./mongoDbService');
const { getClientIp } = require('../utils/deviceDetector');

/**
 * Persist an immutable security / clinical audit log entry without blocking primary flows.
 */
const recordAuditLog = async ({
  actorId,
  actorRole = 'PATIENT',
  action,
  targetType = '',
  targetId = '',
  details = {},
  req = null
}) => {
  try {
    if (!actorId || !action) return null;
    const ip = req ? getClientIp(req) : '';
    return await MongoDb.auditLogs.create({
      actorId: String(actorId),
      actorRole: String(actorRole),
      action: String(action),
      targetType: String(targetType),
      targetId: String(targetId),
      details,
      ip
    });
  } catch (err) {
    console.warn('[AuditLog Notice]:', err.message);
    return null;
  }
};

module.exports = { recordAuditLog };
