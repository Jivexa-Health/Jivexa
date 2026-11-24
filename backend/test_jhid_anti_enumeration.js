/**
 * JIVEXA Health OS - JHID Security, Anti-Enumeration & Access Token Verification Suite
 * 
 * Verifies:
 * 1. IP-based sliding window rate limiting on public lookup (/search & /:healthId)
 * 2. Anti-enumeration lockout after consecutive 404/not-found requests
 * 3. High-entropy Emergency Lookup Access Token validation:
 *    - Matching token succeeds (HTTP 200)
 *    - Mismatched token fails (HTTP 403 INVALID_EMERGENCY_TOKEN)
 * 4. Legitimate paramedic lookup preservation (manual JHID lookup without token succeeds)
 * 5. Emergency response payload sanitization (strict whitelist of Level-1 triage fields)
 * 6. Audit logging privacy verification (masked IDs, zero sensitive medical PII)
 */

const http = require('http');
const path = require('path');
const { app } = require('./src/server');
const {
  resetSecurityTracking,
  getAuditLogs
} = require('./src/middleware/healthIdSecurityMiddleware');

const TEST_PORT = 49216;
let serverInstance = null;
let passed = 0;
let failed = 0;

const assert = (condition, title, details = '') => {
  if (condition) {
    console.log(`  ✓ PASS: ${title}${details ? ` -> ${details}` : ''}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${title}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
};

const makeRequest = ({ path, method = 'GET', headers = {} }) => {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) { json = { raw: body }; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          rawBody: body
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
};

const runTests = async () => {
  console.log('================================================================');
  console.log('JIVEXA HEALTH OS — JHID ANTI-ENUMERATION & SECURITY TEST SUITE');
  console.log('================================================================\n');

  // Start HTTP Test Server
  await new Promise((resolve) => {
    serverInstance = app.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`Test server running on http://127.0.0.1:${TEST_PORT}\n`);
      resolve();
    });
  });

  // --- SECTION 1: LEGITIMATE EMERGENCY LOOKUP (PARAMEDIC WORKFLOW) ---
  console.log('--- SECTION 1: Legitimate Paramedic Lookup (No Token) ---');
  resetSecurityTracking();

  {
    const res = await makeRequest({
      path: '/api/health-id/search?healthId=JXV-STVAZREW'
    });

    assert(res.statusCode === 200, 'Test 1.1: Legitimate emergency lookup by display JHID returns HTTP 200');
    assert(res.data.success === true, 'Test 1.2: Response indicates success: true');
    assert(res.data.patient && res.data.patient.name === 'Aarav Sharma', 'Test 1.3: Returns registered patient name');
    assert(res.data.patient.bloodGroup === 'B+', 'Test 1.4: Returns critical triage blood group');
    assert(res.data.patient.healthProfile && Array.isArray(res.data.patient.healthProfile.allergies), 'Test 1.5: Returns allergies array');
  }

  // --- SECTION 2: FIELD SANITIZATION & PRIVACY RESTRICTION ---
  console.log('\n--- SECTION 2: Response Payload Sanitization & Leak Prevention ---');
  {
    const res = await makeRequest({
      path: '/api/health-id/search?healthId=JIV-2026-685853'
    });

    assert(res.statusCode === 200, 'Test 2.1: Lookup for JIV-2026-685853 returns HTTP 200');
    assert(res.data.emergencyAccessToken === undefined, 'Test 2.2: emergencyAccessToken is NEVER leaked in public emergency response');
    assert(res.data.patient.password === undefined, 'Test 2.3: Password / hash is strictly omitted');
    assert(res.data.patient.email === undefined, 'Test 2.4: Email address is not exposed in public triage lookup');
    assert(res.data.patient.diagnosticReports === undefined, 'Test 2.5: Private diagnostic reports are not leaked');
    assert(res.data.patient.consultationNotes === undefined, 'Test 2.6: Doctor consultation notes are not leaked');
  }

  // --- SECTION 3: HIGH-ENTROPY ACCESS TOKEN VERIFICATION ---
  console.log('\n--- SECTION 3: High-Entropy Emergency Lookup Access Token ---');
  {
    // A: Valid Token
    const resValid = await makeRequest({
      path: '/api/health-id/search?healthId=JXV-STVAZREW&token=emg_aarav_sharma_7a8b9c0d1e2f3a4b'
    });

    assert(resValid.statusCode === 200, 'Test 3.1: Valid emergencyAccessToken returns HTTP 200');
    assert(resValid.data.patient.name === 'Aarav Sharma', 'Test 3.2: Valid token unlocks triage profile');

    // B: Invalid Token Attempt
    const resInvalid = await makeRequest({
      path: '/api/health-id/search?healthId=JXV-STVAZREW&token=emg_attacker_forged_token_123456'
    });

    assert(resInvalid.statusCode === 403, 'Test 3.3: Invalid emergencyAccessToken is rejected with HTTP 403 Forbidden');
    assert(resInvalid.data.errorCode === 'INVALID_EMERGENCY_TOKEN', 'Test 3.4: Rejection contains errorCode: INVALID_EMERGENCY_TOKEN');
  }

  // --- SECTION 4: ANTI-ENUMERATION PROBE LOCKOUT ---
  console.log('\n--- SECTION 4: Sequential Enumeration Probe Lockout ---');
  resetSecurityTracking();

  // Attacker IP simulates scanning 4 sequential non-existent JHIDs
  const attackerHeaders = { 'x-forwarded-for': '198.51.100.42' };
  
  for (let i = 1; i <= 3; i++) {
    const probeRes = await makeRequest({
      path: `/api/health-id/search?healthId=JIV-2026-00000${i}`,
      headers: attackerHeaders
    });
    assert(probeRes.statusCode === 404, `Test 4.${i}: Probe ${i} for non-existent ID returns HTTP 404 Not Found`);
  }

  // 4th consecutive non-existent probe triggers lockout threshold
  const probe4 = await makeRequest({
    path: '/api/health-id/search?healthId=JIV-2026-000004',
    headers: attackerHeaders
  });
  assert(probe4.statusCode === 404, 'Test 4.4: Probe 4 reaches lockout threshold');

  // 5th attempt: Attacker is immediately LOCKED OUT (HTTP 429)
  const probe5 = await makeRequest({
    path: '/api/health-id/search?healthId=JIV-2026-000005',
    headers: attackerHeaders
  });

  assert(probe5.statusCode === 429, 'Test 4.5: Consecutive probe attempts trigger immediate HTTP 429 Lockout');
  assert(probe5.data.errorCode === 'ENUMERATION_SUSPECTED', 'Test 4.6: Returns errorCode: ENUMERATION_SUSPECTED');
  assert(Number(probe5.headers['retry-after']) > 0, 'Test 4.7: Returns Retry-After response header');

  // Verify that a separate legitimate IP is NOT locked out
  const legitRes = await makeRequest({
    path: '/api/health-id/search?healthId=JXV-STVAZREW',
    headers: { 'x-forwarded-for': '203.0.113.88' }
  });
  assert(legitRes.statusCode === 200, 'Test 4.8: Separate legitimate IP remains unaffected by attacker lockout');

  // --- SECTION 5: IP SLIDING-WINDOW RATE LIMITING ---
  console.log('\n--- SECTION 5: Sliding-Window IP Rate Limiter ---');
  resetSecurityTracking();

  const floodIp = '198.51.100.99';
  const floodHeaders = { 'x-forwarded-for': floodIp };

  // Make 30 valid requests (the maximum allowance)
  let allAccepted = true;
  for (let i = 0; i < 30; i++) {
    const r = await makeRequest({
      path: '/api/health-id/search?healthId=JXV-STVAZREW',
      headers: floodHeaders
    });
    if (r.statusCode !== 200) {
      allAccepted = false;
      break;
    }
  }
  assert(allAccepted, 'Test 5.1: 30 requests within window are accepted');

  // 31st request exceeds rate limit
  const rateLimitRes = await makeRequest({
    path: '/api/health-id/search?healthId=JXV-STVAZREW',
    headers: floodHeaders
  });
  assert(rateLimitRes.statusCode === 429, 'Test 5.2: 31st request triggers HTTP 429 Rate Limit Exceeded');
  assert(rateLimitRes.data.errorCode === 'RATE_LIMIT_EXCEEDED', 'Test 5.3: Returns errorCode: RATE_LIMIT_EXCEEDED');

  // --- SECTION 6: PRIVACY-SAFE AUDIT LOGGING ---
  console.log('\n--- SECTION 6: Privacy-Preserving Audit Logging ---');
  const auditLogs = getAuditLogs();
  assert(auditLogs.length > 0, 'Test 6.1: Audit log entries were recorded during lookups');

  // Check masking and zero PII
  const sampleLog = auditLogs.find(l => l.status === 200);
  assert(sampleLog !== undefined, 'Test 6.2: Successful lookup was audited');
  assert(sampleLog && sampleLog.maskedId.includes('***'), 'Test 6.3: Audit log masks Health ID (e.g. JXV-***REW)', sampleLog?.maskedId);
  assert(sampleLog && sampleLog.patientName === undefined, 'Test 6.4: Patient name is NEVER logged in audit trail');
  assert(sampleLog && sampleLog.bloodGroup === undefined, 'Test 6.5: Medical vitals are NEVER logged in audit trail');

  // --- CLEANUP ---
  console.log('\n--- Cleaning up test server ---');
  resetSecurityTracking();
  if (serverInstance) serverInstance.close();

  // --- SUMMARY ---
  console.log('\n================================================================');
  console.log(`JHID SECURITY SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
};

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
