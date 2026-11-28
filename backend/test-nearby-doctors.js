/**
 * JIVEXA Health — GPS-Based Find My Doctor Integration & Geolocation Test Suite
 * Tests geolocation queries, coordinate validation, distance calculations,
 * doctor verification gating (PENDING vs APPROVED), specialization filtering,
 * manual city search, and appointment booking with nearby doctors.
 */

const { PassThrough } = require('stream');
const http = require('http');
const { app } = require('./src/server');

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

async function runTests() {
  console.log('\n======================================================');
  console.log('JIVEXA HEALTH — GPS-BASED FIND MY DOCTOR TEST SUITE');
  console.log('======================================================\n');

  const ts = Date.now();
  const password = 'Password@123';

  try {
    // 1. Coordinate and Radius Validation
    console.log('1. Coordinate and Radius Validation:');
    {
      const r1 = await invokeApp('GET', '/api/doctors/nearby?lat=95&lng=77.2167');
      assert(r1.status === 400, 'Rejects latitude > 90 with HTTP 400', `Got ${r1.status}`);

      const r2 = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=195');
      assert(r2.status === 400, 'Rejects longitude > 180 with HTTP 400', `Got ${r2.status}`);

      const r3 = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=-5');
      assert(r3.status === 400, 'Rejects negative radius with HTTP 400', `Got ${r3.status}`);

      const r4 = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=0');
      assert(r4.status === 400, 'Rejects zero radius with HTTP 400', `Got ${r4.status}`);

      const r5 = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=abc');
      assert(r5.status === 400, 'Rejects non-numeric radius with HTTP 400', `Got ${r5.status}`);
    }

    // 2. Doctor Registration with GPS Location Data
    console.log('\n2. Doctor Registration with Location Data:');
    let adminToken = '';
    let delhiDocId = '';
    let noidaDocId = '';
    let mumbaiDocId = '';
    let pendingDocId = '';
    let patientToken = '';

    {
      // Create Admin to verify doctors
      const adminReg = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Super Admin', email: `admin.gps.${ts}@jivexa.test`, password, role: 'ADMIN' }
      });
      assert(adminReg.status === 201, 'Admin registered successfully');
      adminToken = adminReg.data.token;

      // Create Patient to test booking
      const patientReg = await invokeApp('POST', '/api/auth/signup', {
        body: { name: 'Rahul Patient', email: `patient.gps.${ts}@jivexa.test`, password, role: 'PATIENT' }
      });
      assert(patientReg.status === 201, 'Patient registered successfully');
      patientToken = patientReg.data.token;

      // Doctor 1: Cardiologist in Connaught Place, New Delhi [77.2167, 28.6315]
      const regDelhi = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Vikram Sethi',
          email: `dr.delhi.${ts}@jivexa.test`,
          password,
          role: 'DOCTOR',
          phone: '+91 98765 43210',
          professionalDetails: {
            specialization: 'Cardiology',
            qualifications: 'MBBS, MD (Cardiology)',
            nmcRegistrationNumber: `MCI-DEL-${ts}`,
            clinicName: 'Delhi Heart & Vascular Institute',
            clinicAddress: 'Barakhamba Road, Connaught Place',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110001',
            consultationFee: 1200,
            experienceYears: 15,
            availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            availableSlots: ['09:00 AM', '10:00 AM', '02:00 PM'],
            location: {
              type: 'Point',
              coordinates: [77.2167, 28.6315] // [lng, lat]
            }
          }
        }
      });
      assert(regDelhi.status === 201 && regDelhi.data?.user?.role === 'DOCTOR', 'Delhi Doctor registered with GeoJSON coordinates');
      delhiDocId = regDelhi.data.user.id;

      // Doctor 2: Pediatrician in Noida Sector 62 [77.3649, 28.6280] (~14.5 km from CP)
      const regNoida = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Ananya Ray',
          email: `dr.noida.${ts}@jivexa.test`,
          password,
          role: 'DOCTOR',
          phone: '+91 98765 43211',
          professionalDetails: {
            specialization: 'Pediatrics',
            qualifications: 'MBBS, DCH',
            nmcRegistrationNumber: `MCI-NOI-${ts}`,
            clinicName: 'Noida Child Care Clinic',
            clinicAddress: 'Sector 62',
            city: 'Noida',
            state: 'Uttar Pradesh',
            pincode: '201309',
            consultationFee: 800,
            experienceYears: 10,
            availableDays: ['Mon', 'Wed', 'Fri'],
            availableSlots: ['11:00 AM', '04:00 PM'],
            location: {
              type: 'Point',
              coordinates: [77.3649, 28.6280]
            }
          }
        }
      });
      assert(regNoida.status === 201, 'Noida Doctor registered with coordinates');
      noidaDocId = regNoida.data.user.id;

      // Doctor 3: Unverified/Pending Doctor in Connaught Place
      const regPending = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Pending Verification',
          email: `dr.pending.${ts}@jivexa.test`,
          password,
          role: 'DOCTOR',
          phone: '+91 98765 43212',
          professionalDetails: {
            specialization: 'General Medicine',
            qualifications: 'MBBS',
            nmcRegistrationNumber: `MCI-PEN-${ts}`,
            clinicName: 'Pending Clinic',
            clinicAddress: 'Connaught Place',
            city: 'New Delhi',
            state: 'Delhi',
            pincode: '110001',
            consultationFee: 500,
            experienceYears: 3,
            location: {
              type: 'Point',
              coordinates: [77.2167, 28.6315]
            }
          }
        }
      });
      assert(regPending.status === 201, 'Pending Doctor registered (remains PENDING)');
      pendingDocId = regPending.data.user.id;

      // Doctor 4: Neurologist in Marine Lines, Mumbai [72.8232, 18.9438] (~1160 km from CP)
      const regMumbai = await invokeApp('POST', '/api/auth/signup', {
        body: {
          name: 'Dr. Priya Deshmukh',
          email: `dr.mumbai.${ts}@jivexa.test`,
          password,
          role: 'DOCTOR',
          phone: '+91 98765 43213',
          professionalDetails: {
            specialization: 'Neurology',
            qualifications: 'MBBS, DM (Neurology)',
            nmcRegistrationNumber: `MCI-BOM-${ts}`,
            clinicName: 'Mumbai Brain Center',
            clinicAddress: 'Marine Lines',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400020',
            consultationFee: 1500,
            experienceYears: 18,
            availableDays: ['Tue', 'Thu', 'Sat'],
            availableSlots: ['10:00 AM', '02:00 PM'],
            location: {
              type: 'Point',
              coordinates: [72.8232, 18.9438]
            }
          }
        }
      });
      assert(regMumbai.status === 201, 'Mumbai Doctor registered with coordinates');
      mumbaiDocId = regMumbai.data.user.id;

      // Admin approves Delhi, Noida, and Mumbai doctors (keeps Pending Doctor as PENDING)
      const appDelhi = await invokeApp('PATCH', `/api/admin/doctors/${delhiDocId}/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'APPROVED', notes: 'Verified Delhi credentials' }
      });
      assert(appDelhi.status === 200 && appDelhi.data?.doctor?.verificationStatus === 'APPROVED', 'Admin approves Delhi doctor');

      const appNoida = await invokeApp('PATCH', `/api/admin/doctors/${noidaDocId}/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'APPROVED', notes: 'Verified Noida credentials' }
      });
      assert(appNoida.status === 200 && appNoida.data?.doctor?.verificationStatus === 'APPROVED', 'Admin approves Noida doctor');

      const appMumbai = await invokeApp('PATCH', `/api/admin/doctors/${mumbaiDocId}/verify`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'APPROVED', notes: 'Verified Mumbai credentials' }
      });
      assert(appMumbai.status === 200 && appMumbai.data?.doctor?.verificationStatus === 'APPROVED', 'Admin approves Mumbai doctor');
    }

    // 3. Strict Verification Enforcement in Nearby API
    console.log('\n3. Strict Doctor Verification Gating:');
    {
      const resNearby = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=50');
      assert(resNearby.status === 200, 'Nearby API returns HTTP 200');
      const docs = resNearby.data?.doctors || [];
      const pendingFound = docs.some(d => d._id === pendingDocId || d.id === pendingDocId);
      assert(!pendingFound, 'PENDING doctor is NEVER discoverable in nearby results');
    }

    // 4. Geodesic Distance Calculation & Radius Boundaries
    console.log('\n4. Geodesic Distance Calculation & Radius Boundaries:');
    {
      // User location: Connaught Place, New Delhi (28.6315, 77.2167)
      // Radius: 5 km (Doctor 1 is at ~0 km, Doctor 2 is ~14.5 km, Doctor 4 is ~1160 km)
      const res5km = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=5');
      assert(res5km.status === 200, '5 km search returns HTTP 200');
      const docs5 = res5km.data?.doctors || [];

      const delhiDocRes = docs5.find(d => d._id === delhiDocId || d.id === delhiDocId);
      const noidaDocRes = docs5.find(d => d._id === noidaDocId || d.id === noidaDocId);
      const mumbaiDocRes = docs5.find(d => d._id === mumbaiDocId || d.id === mumbaiDocId);

      assert(Boolean(delhiDocRes), 'Delhi doctor (< 1 km) included in 5 km radius search');
      assert(!noidaDocRes, 'Noida doctor (~14.5 km) correctly excluded from 5 km radius search');
      assert(!mumbaiDocRes, 'Mumbai doctor (~1160 km) correctly excluded from 5 km radius search');

      assert(
        delhiDocRes && typeof delhiDocRes.distanceKm === 'number' && delhiDocRes.distanceKm < 1,
        'Haversine distance calculated accurately for Delhi doctor',
        `distanceKm: ${delhiDocRes?.distanceKm}, text: ${delhiDocRes?.distanceText}`
      );

      // Radius: 25 km from Connaught Place (Both Delhi and Noida doctors should be included)
      const res25km = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=25');
      const docs25 = res25km.data?.doctors || [];
      const delhi25 = docs25.find(d => d._id === delhiDocId || d.id === delhiDocId);
      const noida25 = docs25.find(d => d._id === noidaDocId || d.id === noidaDocId);
      const mumbai25 = docs25.find(d => d._id === mumbaiDocId || d.id === mumbaiDocId);

      assert(Boolean(delhi25) && Boolean(noida25), 'Both Delhi and Noida doctors included in 25 km radius search');
      assert(!mumbai25, 'Mumbai doctor still excluded in 25 km radius search');
      assert(
        noida25 && noida25.distanceKm >= 12 && noida25.distanceKm <= 17,
        'Noida doctor distance calculated correctly (~14.5 km)',
        `distanceKm: ${noida25?.distanceKm}, text: ${noida25?.distanceText}`
      );
    }

    // 5. Specialization & Text Search Filtering
    console.log('\n5. Specialization and Free Text Filtering:');
    {
      const resCardio = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=50&specialization=Cardiology');
      assert(resCardio.status === 200, 'Specialization query returns HTTP 200');
      const cardioDocs = resCardio.data?.doctors || [];
      assert(
        cardioDocs.every(d => d.specialization.toLowerCase().includes('cardio')),
        'Specialization filter strictly restricts results to Cardiology'
      );
      assert(cardioDocs.some(d => d._id === delhiDocId || d.id === delhiDocId), 'Delhi Cardiologist matched');

      const resSearch = await invokeApp('GET', '/api/doctors/nearby?lat=28.6315&lng=77.2167&radius=50&search=Noida');
      assert(resSearch.status === 200, 'Search query returns HTTP 200');
      const searchDocs = resSearch.data?.doctors || [];
      assert(searchDocs.some(d => d._id === noidaDocId || d.id === noidaDocId), 'Search text "Noida" matches clinic/city');
    }

    // 6. Manual City & Locality Search
    console.log('\n6. Manual Location / City Search:');
    {
      const resMumbaiCity = await invokeApp('GET', '/api/doctors/nearby?city=Mumbai');
      assert(resMumbaiCity.status === 200, 'City query "Mumbai" returns HTTP 200');
      const mumbaiDocs = resMumbaiCity.data?.doctors || [];
      assert(mumbaiDocs.some(d => d._id === mumbaiDocId || d.id === mumbaiDocId), 'Finds Mumbai doctor by city');
      assert(!mumbaiDocs.some(d => d._id === delhiDocId || d.id === delhiDocId), 'Delhi doctor excluded when filtering city=Mumbai');

      const resPincode = await invokeApp('GET', '/api/doctors/nearby?pincode=110001');
      assert(resPincode.status === 200, 'Pincode query "110001" returns HTTP 200');
      const pinDocs = resPincode.data?.doctors || [];
      assert(pinDocs.some(d => d._id === delhiDocId || d.id === delhiDocId), 'Finds Delhi doctor by PIN code 110001');
    }

    // 7. No-Location Fallback
    console.log('\n7. No-Location Fallback:');
    {
      const resFallback = await invokeApp('GET', '/api/doctors/nearby');
      assert(resFallback.status === 200, 'No-location fallback returns HTTP 200');
      const fbDocs = resFallback.data?.doctors || [];
      assert(fbDocs.length >= 3, 'Returns all verified doctors when GPS coordinates omitted');
      assert(!fbDocs.some(d => d._id === pendingDocId || d.id === pendingDocId), 'Pending doctor excluded even in fallback');
    }

    // 8. Doctor Profile by ID and Appointment Booking
    console.log('\n8. Doctor Profile Lookup & Appointment Booking:');
    {
      const resDetail = await invokeApp('GET', `/api/doctors/${delhiDocId}`);
      assert(resDetail.status === 200, 'Approved doctor details accessible via /api/doctors/:id');
      assert(
        resDetail.data?.doctor?.name === 'Dr. Vikram Sethi' &&
          resDetail.data?.doctor?.specialization === 'Cardiology',
        'Doctor details contain correct name and specialization'
      );

      // Book appointment with the nearby verified doctor
      const futureDate = new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0];
      const resBook = await invokeApp('POST', '/api/appointments', {
        headers: { Authorization: `Bearer ${patientToken}` },
        body: {
          doctorId: delhiDocId,
          date: futureDate,
          time: '09:00 AM',
          consultationType: 'In-Person',
          reason: 'Cardiac wellness checkup'
        }
      });
      assert(resBook.status === 201, 'Patient successfully books appointment with nearby doctor', `HTTP ${resBook.status}`);
      assert(
        resBook.data?.appointment?.doctorId === delhiDocId &&
          (resBook.data?.appointment?.status === 'Pending' || resBook.data?.appointment?.status === 'Confirmed'),
        'Appointment record created with valid initial status (Pending)',
        `status: ${resBook.data?.appointment?.status}`
      );
    }

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\n======================================================`);
  console.log(`GPS Find My Doctor Tests: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
