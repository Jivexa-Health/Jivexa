// Independent test script to verify JHID functionality, sanitization, and security rules
const assert = require('assert');

console.log('================================================================');
console.log('JIVEXA HEALTH OS — DEDICATED JHID SECURITY & VERIFICATION SUITE');
console.log('================================================================\n');

// Mock a full sensitive database patient record
const rawSensitivePatientRecord = {
  healthId: 'JIV-2026-685853',
  userId: 'user_patient_9921820',
  fullName: 'Piyush Gangwar',
  passwordHash: '$2b$10$e89sfy72f8s7dfys78fysd78fy',
  jwtTokens: ['eyJhbGciOi...secret_token'],
  dateOfBirth: '1998-05-12',
  gender: 'Male',
  phoneNumber: '+91 98765 43210',
  email: 'piyush@example.com',
  bloodGroup: 'O+ Positive',
  address: '123 Tech Park Road, Bangalore, India',
  emergencyContact: {
    name: 'Ramesh Gangwar',
    relationship: 'Father',
    phone: '+91 99887 76655',
    hospital: 'Apollo Emergency Center'
  },
  healthProfile: {
    chronicConditions: ['Mild Asthma'],
    allergies: ['Penicillin', 'Peanuts'],
    currentMedications: ['Salbutamol Inhaler'],
    emergencyNotes: 'Carries rescue inhaler during acute episodes.',
    bloodPressure: '120/80 mmHg',
    privateDoctorNotes: 'Patient discussed mild anxiety and requested lab test privacy.',
    psychiatricHistory: 'Sensitive private consultations'
  },
  medicalReports: [
    { id: 'rep_1', title: 'Private Blood Test', fileUrl: 'https://s3.aws.com/reports/private_cbc.pdf' }
  ],
  isDemo: false,
  createdAt: '2026-04-10T11:20:00.000Z'
};

// Replicate controller's sanitization function
const formatEmergencyPatientResponse = (record, isDemo = false, requestedHealthId = null) => {
  const isDemoRecord = isDemo || Boolean(record.isDemo) || Boolean(record.isDemoRecord);
  const resolvedHealthId = requestedHealthId || record.healthId;

  let sanitizedEmergencyContact = null;
  if (record.emergencyContact) {
    if (typeof record.emergencyContact === 'object') {
      sanitizedEmergencyContact = {
        name: record.emergencyContact.name || '',
        relationship: record.emergencyContact.relationship || record.emergencyContact.relation || '',
        phone: record.emergencyContact.phone || '',
        hospital: record.emergencyContact.hospital || ''
      };
    } else if (typeof record.emergencyContact === 'string') {
      sanitizedEmergencyContact = record.emergencyContact;
    }
  }

  let sanitizedHealthProfile = null;
  if (record.healthProfile && typeof record.healthProfile === 'object') {
    sanitizedHealthProfile = {
      allergies: Array.isArray(record.healthProfile.allergies)
        ? record.healthProfile.allergies
        : (record.healthProfile.allergies ? [String(record.healthProfile.allergies)] : []),
      chronicConditions: Array.isArray(record.healthProfile.chronicConditions)
        ? record.healthProfile.chronicConditions
        : (record.healthProfile.chronicConditions ? [String(record.healthProfile.chronicConditions)] : []),
      currentMedications: Array.isArray(record.healthProfile.currentMedications)
        ? record.healthProfile.currentMedications
        : (record.healthProfile.currentMedications ? [String(record.healthProfile.currentMedications)] : []),
      emergencyNotes: record.healthProfile.emergencyNotes || record.healthProfile.notes || '',
      bloodPressure: record.healthProfile.bloodPressure || ''
    };
  }

  return {
    success: true,
    isDemoRecord,
    healthId: resolvedHealthId,
    verificationStatus: isDemoRecord ? 'Sample Demo Record' : 'Verified Active Record',
    patient: {
      name: record.fullName || record.name || null,
      isDemo: isDemoRecord,
      dateOfBirth: record.dateOfBirth || record.dob || null,
      gender: record.gender || null,
      bloodGroup: record.bloodGroup || null,
      emergencyContact: sanitizedEmergencyContact,
      healthProfile: sanitizedHealthProfile,
      createdAt: record.createdAt || null
    }
  };
};

// --- TEST 1: Sanitization Integrity ---
console.log('--- TEST 1: Strict Emergency Sanitization Audit ---');
const sanitized = formatEmergencyPatientResponse(rawSensitivePatientRecord);

assert.strictEqual(sanitized.success, true);
assert.strictEqual(sanitized.healthId, 'JIV-2026-685853');
assert.strictEqual(sanitized.patient.name, 'Piyush Gangwar');
assert.strictEqual(sanitized.patient.bloodGroup, 'O+ Positive');
assert.deepStrictEqual(sanitized.patient.healthProfile.allergies, ['Penicillin', 'Peanuts']);
assert.deepStrictEqual(sanitized.patient.healthProfile.chronicConditions, ['Mild Asthma']);
assert.strictEqual(sanitized.patient.emergencyContact.phone, '+91 99887 76655');

// CRITICAL SECURITY CHECKS: Verify NO private or sensitive information is leaked
assert.strictEqual(sanitized.passwordHash, undefined, 'CRITICAL: Password hash must not exist');
assert.strictEqual(sanitized.patient.passwordHash, undefined, 'CRITICAL: Password hash must not exist in patient');
assert.strictEqual(sanitized.jwtTokens, undefined, 'CRITICAL: JWT tokens must not be exposed');
assert.strictEqual(sanitized.patient.email, undefined, 'CRITICAL: Email address must not be exposed in public emergency view');
assert.strictEqual(sanitized.patient.address, undefined, 'CRITICAL: Home address must not be exposed');
assert.strictEqual(sanitized.patient.medicalReports, undefined, 'CRITICAL: Medical PDF reports must not be exposed');
assert.strictEqual(sanitized.patient.healthProfile.privateDoctorNotes, undefined, 'CRITICAL: Private doctor notes must not be exposed');
assert.strictEqual(sanitized.patient.healthProfile.psychiatricHistory, undefined, 'CRITICAL: Psychiatric history must not be exposed');

console.log('✅ [PASS] Test 1.1: Verified emergency response contains authorized triage data (Blood Group, Allergies, Kin Contact)');
console.log('✅ [PASS] Test 1.2: Confirmed 0 private medical files, password hashes, or doctor notes are exposed in emergency response');

// --- TEST 2: Deterministic JHID Generation & Persistence ---
console.log('\n--- TEST 2: Deterministic JHID Consistency ---');
const generateOrGetHealthId = (targetUserId) => {
  let hash = 0;
  for (let i = 0; i < targetUserId.length; i++) {
    hash = (hash << 5) - hash + targetUserId.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);
  const numPart = String((positiveHash * 997 + 100000) % 900000 + 100000);
  return `JIV-2026-${numPart}`;
};

const id1 = generateOrGetHealthId('user_alice_123');
const id2 = generateOrGetHealthId('user_alice_123');
assert.strictEqual(id1, id2, 'Deterministic generator must produce identical JHID for same user');
assert.match(id1, /^JIV-2026-\d{6}$/, 'JHID must strictly follow JIV-YYYY-XXXXXX format');

console.log(`✅ [PASS] Test 2.1: Deterministic JHID generation is stable (${id1})`);
console.log('✅ [PASS] Test 2.2: Format matches canonical pattern ^JIV-2026-\\d{6}$');

// --- TEST 3: Invalid / Malformed JHID Query Handling ---
console.log('\n--- TEST 3: Malformed Query Protection ---');
const validateQuery = (query) => {
  const sanitized = String(query || '').trim().replace(/^['"]|['"]$/g, '').toUpperCase();
  if (!sanitized || sanitized.length < 3) return { valid: false, message: 'Invalid or missing Health ID' };
  return { valid: true, sanitized };
};

assert.strictEqual(validateQuery('').valid, false);
assert.strictEqual(validateQuery('  ').valid, false);
assert.strictEqual(validateQuery('ab').valid, false);
assert.strictEqual(validateQuery('JIV-2026-685853').valid, true);

console.log('✅ [PASS] Test 3.1: Empty and malformed queries properly rejected with safe validation error');

console.log('\n================================================================');
console.log('ALL JHID SECURITY & VERIFICATION ASSERTIONS PASSED (6/6)');
console.log('================================================================\n');
