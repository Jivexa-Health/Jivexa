/**
 * JIVEXA Health — Patient + Doctor MVP Integration & Security Test Suite
 * Executes full Express middleware, routing, RBAC, atomic double-booking,
 * doctor verification, consent-scoped report sharing, and existing JHID/AI checks.
 */

const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Isolate test local store so we don't pollute developer state
const localDbPath = path.resolve(__dirname, '.local_db.json');
const hadLocalDb = fs.existsSync(localDbPath);
const backupLocalDb = hadLocalDb ? fs.readFileSync(localDbPath, 'utf8') : null;
if (hadLocalDb) fs.unlinkSync(localDbPath);

const { app } = require('./src/server');
const { MongoDb } = require('./src/services/mongoDbService');

let passed = 0;
let failed = 0;

const assert = (cond, name, details = '') => {
  if (cond) {
    console.log(`  PASS: ${name}${details ? ` (${details})` : ''}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}${details ? ` (${details})` : ''}`);
    failed++;
  }
};

// In-process HTTP request dispatcher directly through Express app
const invokeApp = (method, urlPath, { headers = {}, body = null } = {}) => {
  return new Promise((resolve, reject) => {
    const rawBody = body !== null ? JSON.stringify(body) : '';
    const socket = new PassThrough();
    socket.remoteAddress = '127.0.0.1';

    const req = new http.IncomingMessage(socket);
    req.method = method.toUpperCase();
    req.url = urlPath;
    req.originalUrl = urlPath;
    req.headers = {
      host: 'localhost:4000',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(rawBody)),
      ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    };
    if (rawBody) req.push(rawBody);
    req.push(null);

    const res = new http.ServerResponse(req);
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, ...args) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return origWrite(chunk, ...args);
    };

    res.end = (chunk, ...args) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const text = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      const out = { status: res.statusCode, headers: res.getHeaders(), data: json, raw: text };
      origEnd(chunk, ...args);
      resolve(out);
      return res;
    };

    app(req, res, (err) => {
      if (err) return reject(err);
      if (!res.headersSent) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });
};

const run = async () => {
  console.log('\n======================================================');
  console.log('JIVEXA HEALTH — PATIENT + DOCTOR MVP TEST SUITE');
  console.log('======================================================\n');

  const ts = Date.now();
  const patientEmail = `patient.${ts}@jivexa.test`;
  const patient2Email = `patient2.${ts}@jivexa.test`;
  const doc1Email = `doctor1.${ts}@jivexa.test`;
  const doc2Email = `doctor2.${ts}@jivexa.test`;
  const adminEmail = `admin.${ts}@jivexa.test`;
  const password = 'Password@123';
  const newPassword = 'NewPassword@456';

  let patientToken = '';
  let patientId = '';
  let patient2Token = '';
  let doc1Token = '';
  let doc1Id = '';
  let doc2Token = '';
  let doc2Id = '';
  let adminToken = '';

  try {
    // 1. Health Endpoint
    {
      const r = await invokeApp('GET', '/api/health');
      assert(r.status === 200 && r.data?.mvpMode?.mode === 'PATIENT_AND_DOCTOR_MVP', 'Health endpoint reports PATIENT_AND_DOCTOR_MVP');
    }

    // 2. Patient Registration & Login + Portal Separation
    {
      const reg = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Aarav Patient', email: patientEmail, password, role: 'PATIENT', age: 29, phone: '+91 90000 11111' }
      });
      assert(
        reg.status === 201 &&
          reg.data?.user?.role === 'PATIENT' &&
          Boolean(reg.data?.user?.healthId) &&
          reg.data?.user?.doctorVerification === null,
        'Patient registration succeeds with Health ID and clean schema (no doctorVerification)'
      );
      patientToken = reg.data.token;
      patientId = reg.data.user.id;

      const reg2 = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Riya Second', email: patient2Email, password, role: 'PATIENT', age: 25 }
      });
      patient2Token = reg2.data.token;

      const loginOk = await invokeApp('POST', '/api/auth/login', {
        body: { email: patientEmail, password }
      });
      assert(loginOk.status === 200 && Boolean(loginOk.data?.token) && loginOk.data?.user?.role === 'PATIENT', 'Patient login succeeds via unified auth');

      const blockedAmbulance = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Ambulance Test', email: `amb.${ts}@example.com`, password, role: 'AMBULANCE_PARTNER' }
      });
      assert(blockedAmbulance.status === 403, 'Ambulance registration remains disabled (Coming Soon)', `HTTP ${blockedAmbulance.status}`);

      const blockedPharmacy = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Pharmacy Test', email: `pharm.${ts}@example.com`, password, role: 'PHARMACY' }
      });
      assert(blockedPharmacy.status === 403, 'Pharmacy registration remains disabled (Coming Soon)', `HTTP ${blockedPharmacy.status}`);
    }

    // 3. Patient Profile Update & Change Password
    {
      const profUpd = await invokeApp('PUT', '/api/auth/profile', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: {
          name: 'Aarav Updated',
          phone: '+91 90000 22222',
          dob: '1997-05-12',
          gender: 'Male',
          notificationPreferences: { inApp: true, email: false, appointmentReminders: true },
          privacySettings: { allowEmergencyLookup: false, consentLogsEnabled: true }
        }
      });
      assert(
        profUpd.status === 200 &&
          profUpd.data?.user?.name === 'Aarav Updated' &&
          profUpd.data?.user?.notificationPreferences?.email === false &&
          profUpd.data?.user?.privacySettings?.allowEmergencyLookup === false,
        'Patient profile & notification/privacy settings persist'
      );

      const badChange = await invokeApp('PUT', '/api/auth/change-password', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { currentPassword: 'WrongPassword@1', newPassword }
      });
      assert(badChange.status === 401, 'Change password rejects incorrect current password');

      const goodChange = await invokeApp('PUT', '/api/auth/change-password', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { currentPassword: password, newPassword }
      });
      assert(goodChange.status === 200, 'Change password updates password');

      const oldPassLogin = await invokeApp('POST', '/api/auth/login', {
        body: { email: patientEmail, password }
      });
      assert(oldPassLogin.status === 401, 'Old password no longer works');

      const newPassLogin = await invokeApp('POST', '/api/auth/login', {
        body: { email: patientEmail, password: newPassword, portal: 'PATIENT' }
      });
      assert(newPassLogin.status === 200, 'New password login succeeds');
      patientToken = newPassLogin.data.token;
    }

    // 4. Unified Doctor Registration, Login & Verification Security
    {
      const incompleteDoc = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Incomplete',
          email: `incomplete.${ts}@example.com`,
          password,
          role: 'DOCTOR'
        }
      });
      assert(incompleteDoc.status === 400, 'Doctor registration requires qualification, specialization, registration number, phone, and clinic details', `HTTP ${incompleteDoc.status}`);

      const docReg = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Kavita Rao',
          email: doc1Email,
          password,
          role: 'DOCTOR',
          phone: '+91 98888 77777',
          professionalDetails: {
            specialization: 'Cardiologist',
            qualifications: 'MBBS, MD (Cardiology)',
            experienceYears: 11,
            nmcRegistrationNumber: 'MCI-554433',
            clinicName: 'HeartFirst Clinic',
            clinicAddress: 'MG Road',
            city: 'Bengaluru',
            consultationFee: 900,
            consultationTypes: ['In-Person', 'Video'],
            availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            availableSlots: ['09:00 AM', '10:00 AM', '11:00 AM', '03:00 PM']
          }
        }
      });
      assert(
        docReg.status === 201 &&
          docReg.data?.user?.role === 'DOCTOR' &&
          docReg.data?.user?.doctorVerification?.status === 'PENDING',
        'Doctor registration creates DOCTOR role with PENDING verification'
      );
      doc1Token = docReg.data.token;
      doc1Id = docReg.data.user.id;

      const doc2Reg = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Vikram Mehta',
          email: doc2Email,
          password,
          role: 'DOCTOR',
          phone: '+91 97777 66666',
          professionalDetails: {
            specialization: 'Dermatologist',
            qualifications: 'MBBS, MD (Dermatology)',
            nmcRegistrationNumber: 'MCI-998877',
            clinicName: 'SkinCare Clinic',
            clinicAddress: 'Indiranagar, Bengaluru'
          }
        }
      });
      assert(doc2Reg.status === 201 && doc2Reg.data?.user?.role === 'DOCTOR', 'Second Doctor registration succeeds');
      doc2Token = doc2Reg.data.token;
      doc2Id = doc2Reg.data.user.id;

      const docLogin = await invokeApp('POST', '/api/auth/login', {
        body: { email: doc1Email, password }
      });
      assert(docLogin.status === 200 && docLogin.data?.user?.role === 'DOCTOR' && !docLogin.data?.user?.healthId, 'Doctor login succeeds via unified auth and returns DOCTOR role');

      const patientOnDoctorDash = await invokeApp('GET', '/api/doctor/dashboard', {
        headers: { Authorization: `Bearer ${patientToken}` }
      });
      assert(patientOnDoctorDash.status === 403, 'Patient cannot access Doctor dashboard (RBAC)');

      // Unverified doctor MUST NOT appear in Find Doctor
      const unverifiedList = await invokeApp('GET', '/api/doctors');
      assert(
        unverifiedList.status === 200 && !unverifiedList.data.doctors.some((d) => d.id === doc1Id),
        'Unverified doctor does NOT appear in Patient Find Doctor'
      );

      const unverifiedDetail = await invokeApp('GET', `/api/doctors/${doc1Id}`);
      assert(unverifiedDetail.status === 404, 'Unverified doctor profile returns 404 to public/patients');

      // Unverified doctor cannot be booked
      const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];
      const bookUnverified = await invokeApp('POST', '/api/appointments', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { doctorId: doc1Id, date: futureDate, time: '10:00 AM', consultationType: 'In-Person', reason: 'Checkup' }
      });
      assert(bookUnverified.status === 400, 'Patient cannot book an unverified doctor');

      // Create Admin and verify authorization
      const adminReg = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Root Admin', email: adminEmail, password, role: 'ADMIN' }
      });
      adminToken = adminReg.data.token;

      const patientApproveAttempt = await invokeApp('PATCH', `/api/admin/doctors/${doc1Id}/verify`, {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { status: 'APPROVED' }
      });
      assert(patientApproveAttempt.status === 403, 'Patient cannot approve a doctor (RBAC)');

      const doctorSelfApprove = await invokeApp('PUT', '/api/doctor/profile', {
        headers: { Authorization: `Bearer ${doc1Token}` },
        body: { consultationFee: 950 }
      });
      assert(
        doctorSelfApprove.status === 200 && doctorSelfApprove.data?.profile?.doctorVerification?.status === 'PENDING',
        'Doctor profile update works and preserves PENDING verification status'
      );

      const adminApprove = await invokeApp('PATCH', `/api/admin/doctors/${doc1Id}/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'APPROVED', notes: 'NMC verified' }
      });
      assert(adminApprove.status === 200 && adminApprove.data?.doctor?.verificationStatus === 'APPROVED', 'Admin approves doctor');

      // Approved doctor now appears in Find Doctor & search/filter works
      const approvedSearch = await invokeApp('GET', '/api/doctors?search=Kavita&specialization=Cardiologist');
      assert(
        approvedSearch.status === 200 &&
          approvedSearch.data.doctors.length === 1 &&
          approvedSearch.data.doctors[0].id === doc1Id &&
          approvedSearch.data.doctors[0].consultationFee === 950 &&
          !approvedSearch.data.doctors[0].password,
        'Approved doctor appears in Find Doctor search/filter with sanitized public profile'
      );
    }

    // 5. Medical Reports & Consent-Scoped Sharing + Atomic Double-Booking Prevention
    const futureDate = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
    let repAId = '';
    let repBId = '';
    let appt1Id = '';

    {
      const rA = await invokeApp('POST', '/api/ai/reports', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { reportId: `rep_a_${ts}`, fileName: 'CBC_Report.pdf', reportTitle: 'CBC Panel', summary: 'Normal Hemoglobin 14.1' }
      });
      const rB = await invokeApp('POST', '/api/ai/reports', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { reportId: `rep_b_${ts}`, fileName: 'Private_Psych_Note.pdf', reportTitle: 'Private Note', summary: 'Private details' }
      });
      assert(rA.status === 201 && rB.status === 201, 'Patient medical reports saved in vault');
      repAId = `rep_a_${ts}`;
      repBId = `rep_b_${ts}`;

      // Concurrent double-booking test on exact same doctor + date + time
      const [book1, book2] = await Promise.all([
        invokeApp('POST', '/api/appointments', {
          headers: { Authorization: `Bearer ${patientToken}` },
          body: {
            doctorId: doc1Id,
            date: futureDate,
            time: '10:00 AM',
            consultationType: 'In-Person',
            reason: 'Chest tightness check',
            sharedReportIds: [repAId]
          }
        }),
        invokeApp('POST', '/api/appointments', {
          headers: { Authorization: `Bearer ${patient2Token}` },
          body: {
            doctorId: doc1Id,
            date: futureDate,
            time: '10:00 AM',
            consultationType: 'Video',
            reason: 'Concurrent booking test'
          }
        })
      ]);

      const statuses = [book1.status, book2.status].sort();
      assert(statuses[0] === 201 && statuses[1] === 409, 'Concurrent double booking allows exactly 1 booking (201) and rejects duplicate (409)', `${statuses.join(', ')}`);
      const winner = book1.status === 201 ? book1 : book2;
      appt1Id = winner.data.appointment.id;
      assert(winner.data.appointment.status === 'Pending', 'Initial appointment status is Pending');

      // Check slots endpoint reflects booked slot
      const slotsRes = await invokeApp('GET', `/api/doctors/${doc1Id}/slots?date=${futureDate}`);
      const slot10 = slotsRes.data.slots.find((s) => s.time === '10:00 AM');
      assert(slot10 && slot10.available === false, 'Booked slot shows unavailable in doctor slots endpoint');
    }

    // 6. Doctor Dashboard, Appointment Synchronization, RBAC & Consent Verification
    {
      // If patient2 won the race, re-book cleanly for patient1 on 11:00 AM for deterministic ownership checks
      const p1Check = await invokeApp('GET', `/api/appointments/${appt1Id}`, {
        headers: { Authorization: `Bearer ${patientToken}` }
      });
      if (p1Check.status !== 200) {
        const b = await invokeApp('POST', '/api/appointments', {
          headers: { Authorization: `Bearer ${patientToken}` },
          body: {
            doctorId: doc1Id,
            date: futureDate,
            time: '11:00 AM',
            consultationType: 'Video',
            reason: 'Chest tightness check',
            sharedReportIds: [repAId]
          }
        });
        appt1Id = b.data.appointment.id;
      }

      const docDash = await invokeApp('GET', '/api/doctor/dashboard', {
        headers: { Authorization: `Bearer ${doc1Token}` }
      });
      assert(docDash.status === 200 && docDash.data?.stats?.pending >= 1, 'Doctor dashboard reflects incoming Pending appointment');

      const doc2Dash = await invokeApp('GET', '/api/doctor/dashboard', {
        headers: { Authorization: `Bearer ${doc2Token}` }
      });
      assert(doc2Dash.status === 200 && doc2Dash.data?.stats?.total === 0, 'Other doctor sees 0 appointments (strict isolation)');

      // Doctor 2 cannot accept Doctor 1's appointment
      const crossDocAccept = await invokeApp('PATCH', `/api/appointments/${appt1Id}/status`, {
        headers: { Authorization: `Bearer ${doc2Token}` },
        body: { status: 'Confirmed' }
      });
      assert(crossDocAccept.status === 403, 'Unauthorized doctor cannot modify another doctor appointment');

      // Patient cannot self-confirm appointment
      const patientSelfConfirm = await invokeApp('PATCH', `/api/appointments/${appt1Id}/status`, {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { status: 'Confirmed' }
      });
      assert(patientSelfConfirm.status === 403, 'Patient cannot confirm their own appointment');

      // Doctor 1 accepts appointment
      const docAccept = await invokeApp('PATCH', `/api/appointments/${appt1Id}/status`, {
        headers: { Authorization: `Bearer ${doc1Token}` },
        body: { status: 'Confirmed' }
      });
      assert(docAccept.status === 200 && docAccept.data?.appointment?.status === 'Confirmed', 'Doctor confirms appointment');

      // Patient sees Confirmed status in My Appointments
      const patientAppts = await invokeApp('GET', '/api/appointments', {
        headers: { Authorization: `Bearer ${patientToken}` }
      });
      const synced = patientAppts.data.appointments.find((a) => a.id === appt1Id);
      assert(synced && synced.status === 'Confirmed', 'Patient My Appointments shows synchronized Confirmed status');

      // Consent check: Doctor 1 sees ONLY repAId, NEVER repBId
      const sharedForDoc = await invokeApp('GET', `/api/doctor/patients/${patientId}/shared-records`, {
        headers: { Authorization: `Bearer ${doc1Token}` }
      });
      const sharedIds = (sharedForDoc.data?.reports || []).map((r) => r._id || r.id);
      assert(sharedIds.includes(repAId) && !sharedIds.includes(repBId), 'Doctor accesses ONLY explicitly consented report (Report A), never unshared Report B');

      // Revoke consent
      const revokeRes = await invokeApp('PATCH', `/api/appointments/${appt1Id}/consent`, {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { sharedReportIds: [] }
      });
      assert(revokeRes.status === 200, 'Patient revokes report sharing consent');

      const sharedAfterRevoke = await invokeApp('GET', `/api/doctor/patients/${patientId}/shared-records`, {
        headers: { Authorization: `Bearer ${doc1Token}` }
      });
      assert((sharedAfterRevoke.data?.reports || []).length === 0, 'Doctor can no longer view report after patient revokes consent');

      // Doctor marks Confirmed -> Completed
      const docComplete = await invokeApp('PATCH', `/api/appointments/${appt1Id}/status`, {
        headers: { Authorization: `Bearer ${doc1Token}` },
        body: { status: 'Completed', consultationSummary: 'Vitals stable.' }
      });
      assert(docComplete.status === 200 && docComplete.data?.appointment?.status === 'Completed', 'Doctor marks appointment Completed');
    }

    // 7. Rejection & Cancellation Slot Release
    {
      const bReject = await invokeApp('POST', '/api/appointments', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { doctorId: doc1Id, date: futureDate, time: '03:00 PM', consultationType: 'In-Person', reason: 'Rejection test' }
      });
      assert(bReject.status === 201, 'Patient books 03:00 PM slot');

      const rejectRes = await invokeApp('PATCH', `/api/appointments/${bReject.data.appointment.id}/status`, {
        headers: { Authorization: `Bearer ${doc1Token}` },
        body: { status: 'Rejected', rejectionReason: 'Doctor unavailable at 3 PM' }
      });
      assert(rejectRes.status === 200 && rejectRes.data.appointment.status === 'Rejected', 'Doctor rejects Pending appointment');

      // Re-booking 03:00 PM slot should now succeed because rejection released the slot!
      const bRebook = await invokeApp('POST', '/api/appointments', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: { doctorId: doc1Id, date: futureDate, time: '03:00 PM', consultationType: 'Video', reason: 'Rebook after rejection' }
      });
      assert(bRebook.status === 201, 'Rejected slot becomes available again for booking');

      // Patient cancels appointment
      const cancelRes = await invokeApp('DELETE', `/api/appointments/${bRebook.data.appointment.id}`, {
        headers: { Authorization: `Bearer ${patientToken}` }
      });
      assert(cancelRes.status === 200 && cancelRes.data.appointment.status === 'Cancelled', 'Patient cancels Pending appointment');
    }

    // 8. Existing JHID & Audit Logs Check
    {
      const auditRes = await invokeApp('GET', '/api/auth/audit-logs', {
        headers: { Authorization: `Bearer ${patientToken}` }
      });
      assert(auditRes.status === 200 && Array.isArray(auditRes.data.logs) && auditRes.data.logs.length > 0, 'Audit logs recorded for patient account & appointments');

      const myReports = await invokeApp('GET', '/api/ai/reports', {
        headers: { Authorization: `Bearer ${patientToken}` }
      });
      assert(myReports.status === 200 && myReports.data.count === 2, 'Existing AI report vault isolation preserved');
    }
  } finally {
    // Restore original local store
    if (fs.existsSync(localDbPath)) fs.unlinkSync(localDbPath);
    if (hadLocalDb && backupLocalDb !== null) {
      fs.writeFileSync(localDbPath, backupLocalDb, 'utf8');
    }
  }

  console.log('\n------------------------------------------------------');
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log('------------------------------------------------------\n');
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
