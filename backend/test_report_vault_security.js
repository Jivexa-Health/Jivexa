/**
 * JIVEXA Health OS - Patient-Specific Report Vault & Security Isolation Test Suite
 * 
 * Verifies:
 * 1. Multi-user authenticated report ownership (Patient A vs Patient B).
 * 2. Cross-user data isolation (Patient B cannot view, delete, or query Patient A's reports).
 * 3. Accurate dynamic report counting (0 for new users, N for uploaded reports).
 * 4. Deletion endpoint security (DELETE /api/ai/reports/:id).
 * 5. Report chat context locking (403 on tampering, WAITING_FOR_REPORT on unselected).
 * 6. Authentication requirements (401 on unauthenticated access).
 */

const http = require('http');
const jwt = require('jsonwebtoken');
const config = require('./src/config/env');
const { connectDB, isDatabaseConnected } = require('./src/config/db');
const { MongoDb } = require('./src/services/mongoDbService');
const { app } = require('./src/server');

const TEST_PORT = 49215;
let serverInstance = null;

const jwtSecret = config.auth.jwtSecret || 'jivexa_test_secret_key_fixed_for_audit';

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

const makeRequest = (options, postData = null) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {
          json = { raw: body };
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          rawBody: body
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      req.write(dataStr);
    }
    req.end();
  });
};

const runVaultSecurityTests = async () => {
  console.log('================================================================');
  console.log('JIVEXA HEALTH OS — PATIENT-SPECIFIC REPORT VAULT & SECURITY TEST');
  console.log('================================================================\n');

  // 1. Connect DB
  try {
    console.log('Connecting to MongoDB Atlas / Local Resilient Storage...');
    await connectDB();
    console.log(`Database connected: ${isDatabaseConnected()}\n`);
  } catch (err) {
    console.warn('DB connect error (running resiliently):', err.message);
  }

  // 2. Start HTTP Test Server
  await new Promise((resolve) => {
    serverInstance = app.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`Test server running on http://127.0.0.1:${TEST_PORT}\n`);
      resolve();
    });
  });

  // 3. Setup Test Patients
  const timestamp = Date.now();
  const patientA = {
    _id: `test_user_a_${timestamp}`,
    name: 'Patient Alice',
    email: `alice_${timestamp}@jivexa.test`,
    role: 'PATIENT'
  };

  const patientB = {
    _id: `test_user_b_${timestamp}`,
    name: 'Patient Bob',
    email: `bob_${timestamp}@jivexa.test`,
    role: 'PATIENT'
  };

  const patientC = {
    _id: `test_user_c_${timestamp}`,
    name: 'Patient Charlie (New)',
    email: `charlie_${timestamp}@jivexa.test`,
    role: 'PATIENT'
  };

  // Register in MongoDb
  await MongoDb.users.create(patientA);
  await MongoDb.users.create(patientB);
  await MongoDb.users.create(patientC);

  const tokenA = jwt.sign({ id: patientA._id, email: patientA.email, role: 'PATIENT' }, jwtSecret, { expiresIn: '1d' });
  const tokenB = jwt.sign({ id: patientB._id, email: patientB.email, role: 'PATIENT' }, jwtSecret, { expiresIn: '1d' });
  const tokenC = jwt.sign({ id: patientC._id, email: patientC.email, role: 'PATIENT' }, jwtSecret, { expiresIn: '1d' });

  console.log('Test Patients initialized:');
  console.log(`- Patient A: ID=${patientA._id}, Name=${patientA.name}`);
  console.log(`- Patient B: ID=${patientB._id}, Name=${patientB.name}`);
  console.log(`- Patient C: ID=${patientC._id}, Name=${patientC.name} (Fresh account)\n`);

  // --- SECTION 1: EMPTY VAULT STATE FOR NEW PATIENTS ---
  console.log('--- SECTION 1: Dynamic Vault Count for Fresh Account ---');
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenC}`
      }
    });

    assert(res.statusCode === 200, 'Test 1.1: Fresh patient GET /api/ai/reports returns HTTP 200');
    assert(res.data.count === 0, 'Test 1.2: Fresh patient has exactly count === 0', `count: ${res.data.count}`);
    assert(Array.isArray(res.data.reports) && res.data.reports.length === 0, 'Test 1.3: Reports list is strictly empty array for fresh patient');
  }

  // --- SECTION 2: UPLOAD & PERSISTENCE PER PATIENT ---
  console.log('\n--- SECTION 2: Patient-Specific Report Creation ---');
  let reportA1Id = `rep_a1_${timestamp}`;
  let reportA2Id = `rep_a2_${timestamp}`;
  let reportB1Id = `rep_b1_${timestamp}`;

  // Patient A uploads Report A1 (CBC)
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    }, {
      reportId: reportA1Id,
      fileName: 'Alice_Complete_Blood_Count.pdf',
      fileSize: '1.2 MB',
      reportTitle: 'Complete Blood Count (CBC)',
      reportDate: '10-Nov-2026',
      healthScore: 88,
      scoreStatus: 'Normal',
      parameters: [
        { name: 'Hemoglobin', value: '14.2 g/dL', status: 'Within Reference Range', flag: 'NORMAL' },
        { name: 'Platelet Count', value: '250,000 /cumm', status: 'Within Reference Range', flag: 'NORMAL' }
      ]
    });

    assert(res.statusCode === 201, 'Test 2.1: Patient A uploads Report A1 successfully (HTTP 201)');
    assert(res.data.report && res.data.report.patientId === patientA._id, 'Test 2.2: Report A1 explicitly bound to Patient A user ID');
  }

  // Patient A uploads Report A2 (Lipid Panel)
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    }, {
      reportId: reportA2Id,
      fileName: 'Alice_Lipid_Panel.pdf',
      fileSize: '950 KB',
      reportTitle: 'Comprehensive Lipid Profile',
      reportDate: '15-Nov-2026',
      healthScore: 72,
      scoreStatus: 'Requires Attention',
      parameters: [
        { name: 'Total Cholesterol', value: '235 mg/dL', status: 'Above Range', flag: 'HIGH' },
        { name: 'Triglycerides', value: '140 mg/dL', status: 'Within Reference Range', flag: 'NORMAL' }
      ]
    });

    assert(res.statusCode === 201, 'Test 2.3: Patient A uploads Report A2 successfully (HTTP 201)');
    assert(res.data.report && res.data.report.patientId === patientA._id, 'Test 2.4: Report A2 explicitly bound to Patient A user ID');
  }

  // Patient B uploads Report B1 (Kidney Panel)
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      }
    }, {
      reportId: reportB1Id,
      fileName: 'Bob_Renal_KFT_Panel.pdf',
      fileSize: '1.1 MB',
      reportTitle: 'Renal Function Test (KFT)',
      reportDate: '18-Nov-2026',
      healthScore: 92,
      scoreStatus: 'Normal',
      parameters: [
        { name: 'Serum Creatinine', value: '0.8 mg/dL', status: 'Within Reference Range', flag: 'NORMAL' },
        { name: 'Blood Urea Nitrogen', value: '12 mg/dL', status: 'Within Reference Range', flag: 'NORMAL' }
      ]
    });

    assert(res.statusCode === 201, 'Test 2.5: Patient B uploads Report B1 successfully (HTTP 201)');
    assert(res.data.report && res.data.report.patientId === patientB._id, 'Test 2.6: Report B1 explicitly bound to Patient B user ID');
  }

  // --- SECTION 3: VAULT REPORT COUNT & ISOLATION ---
  console.log('\n--- SECTION 3: Report Vault Count & Cross-Patient Isolation ---');
  // Patient A lists reports: should have exactly 2
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(res.statusCode === 200, 'Test 3.1: Patient A GET /api/ai/reports returns HTTP 200');
    assert(res.data.count === 2, 'Test 3.2: Patient A reports count is exactly 2', `count: ${res.data.count}`);
    const ids = res.data.reports.map(r => String(r._id || r.id));
    assert(ids.includes(reportA1Id) && ids.includes(reportA2Id), 'Test 3.3: Patient A receives only their reports (A1 and A2)');
    assert(!ids.includes(reportB1Id), 'Test 3.4: Patient A NEVER receives Patient B report (B1)');
  }

  // Patient B lists reports: should have exactly 1
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    assert(res.statusCode === 200, 'Test 3.5: Patient B GET /api/ai/reports returns HTTP 200');
    assert(res.data.count === 1, 'Test 3.6: Patient B reports count is exactly 1', `count: ${res.data.count}`);
    const ids = res.data.reports.map(r => String(r._id || r.id));
    assert(ids.includes(reportB1Id), 'Test 3.7: Patient B receives their own report (B1)');
    assert(!ids.includes(reportA1Id) && !ids.includes(reportA2Id), 'Test 3.8: Patient B NEVER receives Patient A reports');
  }

  // Fresh Patient C still has 0 reports
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenC}` }
    });

    assert(res.statusCode === 200 && res.data.count === 0, 'Test 3.9: Patient C continues to have exactly 0 reports (No cross-talk leak)');
  }

  // --- SECTION 4: UNAUTHORIZED TAMPERING & ACCESS CONTROLS ---
  console.log('\n--- SECTION 4: Direct ID Tampering & Cross-User Security ---');

  // Patient B attempts direct GET of Patient A's report
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: `/api/ai/reports/${reportA1Id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    assert(res.statusCode === 403, 'Test 4.1: Patient B direct GET /api/ai/reports/:id for Patient A report is REJECTED (HTTP 403 Forbidden)');
  }

  // Patient B attempts direct DELETE of Patient A's report
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: `/api/ai/reports/${reportA1Id}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    assert(res.statusCode === 403, 'Test 4.2: Patient B direct DELETE /api/ai/reports/:id for Patient A report is REJECTED (HTTP 403 Forbidden)');
  }

  // Patient B attempts AI Consultation with Patient A's report ID in reportContext
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/report-chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      }
    }, {
      message: 'What is the hemoglobin value in this report?',
      reportContext: {
        id: reportA1Id,
        reportId: reportA1Id,
        reportTitle: 'Tampered Context Report',
        parameters: [{ name: 'Hemoglobin', value: '14.2 g/dL' }]
      }
    });

    assert(res.statusCode === 403, 'Test 4.3: Patient B attempting AI chat using Patient A report ID is REJECTED (HTTP 403 Forbidden)');
    assert(res.data.errorCode === 'REPORT_ACCESS_DENIED', 'Test 4.4: Returns standard security errorCode: REPORT_ACCESS_DENIED');
  }

  // --- SECTION 5: UNAUTHENTICATED PROTECTION ---
  console.log('\n--- SECTION 5: Unauthenticated Access Guardrails ---');
  {
    const resGet = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET'
    });
    assert(resGet.statusCode === 401, 'Test 5.1: Unauthenticated GET /api/ai/reports returns HTTP 401 Unauthorized');

    const resDelete = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: `/api/ai/reports/${reportA1Id}`,
      method: 'DELETE'
    });
    assert(resDelete.statusCode === 401, 'Test 5.2: Unauthenticated DELETE /api/ai/reports/:id returns HTTP 401 Unauthorized');
  }

  // --- SECTION 6: REPORT DELETION & DYNAMIC RE-COUNTING ---
  console.log('\n--- SECTION 6: Report Deletion by Legitimate Owner ---');
  // Patient A deletes Report A1
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: `/api/ai/reports/${reportA1Id}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(res.statusCode === 200, 'Test 6.1: Patient A legitimately deletes Report A1 (HTTP 200 OK)');
    assert(res.data.success === true, 'Test 6.2: Deletion response returns success: true');
    assert(res.data.deletedReportId === reportA1Id, 'Test 6.3: Response confirms deletedReportId matches');
  }

  // Patient A lists reports after deletion: count must now be 1
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(res.statusCode === 200, 'Test 6.4: Patient A GET /api/ai/reports after deletion returns HTTP 200');
    assert(res.data.count === 1, 'Test 6.5: Patient A count dynamically reduced from 2 to 1', `count: ${res.data.count}`);
    const ids = res.data.reports.map(r => String(r._id || r.id));
    assert(!ids.includes(reportA1Id), 'Test 6.6: Report A1 is completely removed from Patient A archive');
    assert(ids.includes(reportA2Id), 'Test 6.7: Report A2 remains safe and intact');
  }

  // Querying deleted Report A1 directly should return 404
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: `/api/ai/reports/${reportA1Id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert(res.statusCode === 404, 'Test 6.8: GET on deleted report returns HTTP 404 Not Found');
  }

  // Verify Patient B was unaffected by Patient A's deletion
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    assert(res.data.count === 1, 'Test 6.9: Patient B reports count remains exactly 1 (Zero cross-contamination)');
  }

  // --- SECTION 7: WAITING_FOR_REPORT IN CLINICAL CHAT ---
  console.log('\n--- SECTION 7: WAITING_FOR_REPORT Guardrail ---');
  {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/ai/report-chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      }
    }, {
      message: 'Can you explain my results?',
      reportContext: null // No active report selected
    });

    assert(res.statusCode === 200, 'Test 7.1: Report chat endpoint handles unselected report gracefully (HTTP 200 Stream)');
    assert(
      res.rawBody.includes('WAITING_FOR_REPORT') || res.rawBody.includes('No active medical report is currently selected'),
      'Test 7.2: Response indicates WAITING_FOR_REPORT status instructing patient to select/upload a report',
      'Confirmed WAITING_FOR_REPORT payload'
    );
  }

  // --- CLEANUP ---
  console.log('\n--- Cleaning up test records ---');
  try {
    await MongoDb.medicalReports.deleteById(reportA2Id, patientA._id);
    await MongoDb.medicalReports.deleteById(reportB1Id, patientB._id);
    await MongoDb.users.deleteMany && await MongoDb.users.deleteMany({
      _id: { $in: [patientA._id, patientB._id, patientC._id] }
    });
  } catch (cleanErr) {}

  if (serverInstance) {
    serverInstance.close();
  }

  // --- SUMMARY ---
  console.log('\n================================================================');
  console.log(`REPORT VAULT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runVaultSecurityTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
