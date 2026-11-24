/**
 * JIVEXA Health OS - Health ID Emergency Lookup Security Middleware
 * 
 * Provides:
 * 1. IP Sliding-Window Rate Limiting (Prevent volumetric scraping).
 * 2. Anti-Enumeration Lockout (Blocks sequential probe attacks after consecutive 404s).
 * 3. Privacy-Preserving Audit Logging (Masked IDs, zero medical PII).
 * 4. Safe Request Sanitization.
 */

const crypto = require('crypto');

// Configuration
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 30; // Max lookup requests per window per IP
const MAX_CONSECUTIVE_MISSES = 4; // Max consecutive not-found before enumeration lockout
const ENUMERATION_LOCK_DURATION_MS = 15 * 60 * 1000; // 15-minute cooldown on probe detection

// In-Memory Tracking Stores
const requestTimestampsByIp = new Map();
const enumerationTrackingByIp = new Map();
const auditLogBuffer = [];
const MAX_AUDIT_LOGS = 200;

/**
 * Extract client IP safely handling reverse proxy headers
 */
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const ips = forwarded.split(',').map(s => s.trim());
    if (ips[0]) return ips[0];
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
};

/**
 * Mask Health ID for privacy-safe logging (e.g. JIV-2026-685853 -> JIV-2026-***853)
 */
const maskHealthId = (id) => {
  if (!id || typeof id !== 'string') return '[EMPTY]';
  const clean = id.trim();
  if (clean.length <= 6) return '***';
  return clean.slice(0, clean.length - 6) + '***' + clean.slice(-3);
};

/**
 * Privacy-preserving audit logger (Logs zero medical PII)
 */
const logEmergencyAudit = ({ ip, requestedId, tokenProvided, success, status, reason }) => {
  const entry = {
    timestamp: new Date().toISOString(),
    ip: ip || '127.0.0.1',
    maskedId: maskHealthId(requestedId),
    tokenProvided: Boolean(tokenProvided),
    success: Boolean(success),
    status: Number(status) || 200,
    reason: String(reason || '')
  };

  auditLogBuffer.push(entry);
  if (auditLogBuffer.length > MAX_AUDIT_LOGS) {
    auditLogBuffer.shift();
  }

  // Structured operational log without PII
  console.log(`[JHID AUDIT] ${entry.timestamp} | IP: ${entry.ip} | ID: ${entry.maskedId} | Token: ${entry.tokenProvided} | Status: ${entry.status} | Result: ${entry.reason}`);
};

/**
 * Record a successful lookup: Resets consecutive failure counter
 */
const recordLookupSuccess = (ip) => {
  const tracking = enumerationTrackingByIp.get(ip);
  if (tracking) {
    tracking.consecutiveMisses = 0;
    tracking.lockedUntil = 0;
  }
};

/**
 * Record a failed/not-found lookup: Increments consecutive failure counter & locks if probing suspected
 */
const recordLookupFailure = (ip) => {
  const now = Date.now();
  let tracking = enumerationTrackingByIp.get(ip);
  if (!tracking) {
    tracking = { consecutiveMisses: 0, lockedUntil: 0, lastMiss: now };
    enumerationTrackingByIp.set(ip, tracking);
  }

  tracking.consecutiveMisses += 1;
  tracking.lastMiss = now;

  if (tracking.consecutiveMisses >= MAX_CONSECUTIVE_MISSES) {
    tracking.lockedUntil = now + ENUMERATION_LOCK_DURATION_MS;
    console.warn(`[JHID SECURITY ALERT] IP ${ip} exceeded ${MAX_CONSECUTIVE_MISSES} consecutive failed lookups. Enumeration lockout engaged for 15 minutes.`);
  }
};

/**
 * Middleware: IP Rate Limiting & Anti-Enumeration Protection
 */
const emergencyLookupSecurityGuard = (req, res, next) => {
  const ip = getClientIp(req);
  const now = Date.now();

  // 1. Check Anti-Enumeration Lockout
  const enumState = enumerationTrackingByIp.get(ip);
  if (enumState && enumState.lockedUntil > now) {
    const remainingSeconds = Math.ceil((enumState.lockedUntil - now) / 1000);
    res.setHeader('Retry-After', remainingSeconds);
    logEmergencyAudit({
      ip,
      requestedId: req.query.healthId || req.query.id || req.params.healthId || '',
      tokenProvided: Boolean(req.query.token || req.headers['x-emergency-token']),
      success: false,
      status: 429,
      reason: 'ENUMERATION_LOCKOUT_ACTIVE'
    });
    return res.status(429).json({
      success: false,
      error: 'Access temporarily suspended due to consecutive invalid lookup requests. Potential automated enumeration detected.',
      errorCode: 'ENUMERATION_SUSPECTED',
      retryAfter: remainingSeconds
    });
  }

  // 2. Sliding-Window Rate Limiting
  let timestamps = requestTimestampsByIp.get(ip);
  if (!timestamps) {
    timestamps = [];
    requestTimestampsByIp.set(ip, timestamps);
  }

  // Purge expired timestamps
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = timestamps.filter(t => t > cutoff);
  requestTimestampsByIp.set(ip, recent);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = recent[0];
    const retryAfter = Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    logEmergencyAudit({
      ip,
      requestedId: req.query.healthId || req.query.id || req.params.healthId || '',
      tokenProvided: Boolean(req.query.token || req.headers['x-emergency-token']),
      success: false,
      status: 429,
      reason: 'RATE_LIMIT_EXCEEDED'
    });
    return res.status(429).json({
      success: false,
      error: 'Emergency lookup rate limit exceeded. Please wait before attempting further lookups.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      retryAfter
    });
  }

  // Record this request timestamp
  recent.push(now);

  // Attach IP and security utilities to request object
  req.clientIp = ip;

  next();
};

/**
 * Security Diagnostics / Test helper to clear tracking state
 */
const resetSecurityTracking = () => {
  requestTimestampsByIp.clear();
  enumerationTrackingByIp.clear();
  auditLogBuffer.length = 0;
};

/**
 * Access safe audit log buffer for security inspection
 */
const getAuditLogs = () => [...auditLogBuffer];

module.exports = {
  getClientIp,
  maskHealthId,
  logEmergencyAudit,
  recordLookupSuccess,
  recordLookupFailure,
  emergencyLookupSecurityGuard,
  resetSecurityTracking,
  getAuditLogs
};
