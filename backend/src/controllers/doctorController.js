const { MongoDb } = require('../services/mongoDbService');
const { doctorProfileUpdateSchema } = require('../validators/userValidators');
const { recordAuditLog } = require('../services/auditService');

const DEFAULT_DOCTOR_SLOTS = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:30 AM', '02:00 PM', '03:30 PM', '05:00 PM'];
const DEFAULT_DOCTOR_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ACTIVE_APPT_STATUSES = ['Pending', 'Confirmed', 'Upcoming', 'In Consultation'];

const isDoctorApproved = (user) => {
  if (!user || user.role !== 'DOCTOR') return false;
  return user.doctorVerification?.status === 'APPROVED';
};

const formatPublicDoctor = (user) => {
  const prof = user.professionalDetails || {};
  const cTypes = Array.isArray(prof.consultationTypes) && prof.consultationTypes.length > 0
    ? prof.consultationTypes
    : ['In-Person', 'Video'];
  const availDays = Array.isArray(prof.availableDays) && prof.availableDays.length > 0
    ? prof.availableDays
    : DEFAULT_DOCTOR_DAYS;
  const availSlots = Array.isArray(prof.availableSlots) && prof.availableSlots.length > 0
    ? prof.availableSlots
    : DEFAULT_DOCTOR_SLOTS;

  return {
    id: String(user._id || user.id),
    roleId: user.roleId || '',
    name: user.name,
    avatarUrl: user.avatarUrl || prof.avatarUrl || '',
    qualifications: prof.qualifications || prof.qualification || 'MBBS',
    specialization: prof.specialization || 'General Physician',
    experienceYears: Number(prof.experienceYears ?? prof.experience ?? 0),
    clinicName: prof.clinicName || '',
    clinicAddress: prof.clinicAddress || prof.location || '',
    city: prof.city || '',
    state: prof.state || '',
    pincode: prof.pincode || '',
    location: prof.location || null,
    consultationFee: Number(prof.consultationFee ?? prof.fee ?? 500),
    consultationTypes: cTypes,
    availableDays: availDays,
    availableSlots: availSlots,
    availabilityText: prof.availabilityText || `${availDays.join(', ')} (${availSlots[0] || '9:00 AM'} - ${availSlots[availSlots.length - 1] || '5:00 PM'})`,
    slotDurationMinutes: Number(prof.slotDurationMinutes) || 30,
    about: prof.about || '',
    languages: Array.isArray(prof.languages) && prof.languages.length > 0 ? prof.languages : ['English'],
    nmcRegistrationNumber: user.doctorVerification?.nmcRegistrationNumber || prof.nmcRegistrationNumber || '',
    stateMedicalCouncil: user.doctorVerification?.stateMedicalCouncil || prof.stateMedicalCouncil || '',
    isVerified: isDoctorApproved(user),
    verificationStatus: user.doctorVerification?.status || 'PENDING'
  };
};

const getDayAbbrev = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
};

const computeSlotsForDate = async (doctorUser, dateStr) => {
  const doctorId = String(doctorUser._id || doctorUser.id);
  const prof = doctorUser.professionalDetails || {};
  const configuredSlots = Array.isArray(prof.availableSlots) && prof.availableSlots.length > 0
    ? prof.availableSlots
    : DEFAULT_DOCTOR_SLOTS;
  const availableDays = Array.isArray(prof.availableDays) && prof.availableDays.length > 0
    ? prof.availableDays
    : DEFAULT_DOCTOR_DAYS;

  const dayName = getDayAbbrev(dateStr);
  const dayAvailable = !dayName || availableDays.length === 0 || availableDays.includes(dayName);

  const existingAppts = await MongoDb.appointments.find({
    doctorId,
    date: dateStr
  });

  const bookedTimes = new Set(
    existingAppts
      .filter((a) => ACTIVE_APPT_STATUSES.includes(a.status) && a.activeSlot !== false)
      .map((a) => String(a.time).trim().toLowerCase())
  );

  const slots = configuredSlots.map((time) => ({
    time,
    available: dayAvailable && !bookedTimes.has(String(time).trim().toLowerCase())
  }));

  return { date: dateStr, dayName, dayAvailable, slots };
};

// @desc    List all verified/approved doctors (Search & Filter)
// @route   GET /api/doctors
// @access  Public / Patient
const listApprovedDoctors = async (req, res) => {
  try {
    const { search = '', specialization = '', consultationType = '', city = '' } = req.query;
    const allDoctors = await MongoDb.users.find({ role: 'DOCTOR' });

    const approved = allDoctors
      .filter(isDoctorApproved)
      .map(formatPublicDoctor)
      .filter((doc) => {
        if (specialization && specialization !== 'All') {
          if (doc.specialization.toLowerCase() !== String(specialization).toLowerCase()) return false;
        }
        if (consultationType && consultationType !== 'All') {
          const typesLower = doc.consultationTypes.map((t) => t.toLowerCase());
          if (!typesLower.includes(String(consultationType).toLowerCase())) return false;
        }
        if (city && city.trim()) {
          const c = city.trim().toLowerCase();
          if (!doc.city.toLowerCase().includes(c) && !doc.clinicAddress.toLowerCase().includes(c)) return false;
        }
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          const haystack = [
            doc.name,
            doc.specialization,
            doc.qualifications,
            doc.clinicName,
            doc.clinicAddress,
            doc.city
          ].join(' ').toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });

    return res.status(200).json({
      success: true,
      count: approved.length,
      doctors: approved
    });
  } catch (error) {
    console.error('[Doctor Controller List Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to load verified doctors' });
  }
};

// Spherical Haversine calculation (returns distance in km rounded to 1 decimal place)
const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

// @desc    Get nearby verified doctors based on GPS or selected location
// @route   GET /api/doctors/nearby
// @access  Public / Patient
const getNearbyDoctors = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      lat,
      lng,
      radius = 25,
      specialization = '',
      search = '',
      city = '',
      pincode = ''
    } = req.query;

    const rawLat = latitude ?? lat;
    const rawLng = longitude ?? lng;
    const hasCoordinates =
      rawLat !== undefined &&
      rawLng !== undefined &&
      String(rawLat).trim() !== '' &&
      String(rawLng).trim() !== '';

    let userLat = null;
    let userLng = null;

    if (radius !== undefined && radius !== null && String(radius).trim() !== '') {
      const parsed = Number(radius);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid radius: radius must be a positive number'
        });
      }
    }

    const parsedRadius = Number(radius);
    const maxRadiusKm = Number.isFinite(parsedRadius)
      ? Math.min(Math.max(parsedRadius, 1), 100)
      : 25;

    if (hasCoordinates) {
      userLat = Number(rawLat);
      userLng = Number(rawLng);
      if (
        !Number.isFinite(userLat) ||
        !Number.isFinite(userLng) ||
        userLat < -90 ||
        userLat > 90 ||
        userLng < -180 ||
        userLng > 180
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid coordinates: latitude must be between -90 and 90, longitude between -180 and 180'
        });
      }
    }

    // Fetch all doctor users from MongoDB/resilient store
    const allDoctors = await MongoDb.users.find({ role: 'DOCTOR' });

    // Strict security filter: only APPROVED doctors are discoverable
    const approvedDoctors = allDoctors.filter(isDoctorApproved);

    const formattedList = approvedDoctors.map((docUser) => {
      const publicDoc = formatPublicDoctor(docUser);
      const coords = docUser.professionalDetails?.location?.coordinates;
      let distanceKm = null;
      let distanceText = null;

      if (hasCoordinates && Array.isArray(coords) && coords.length >= 2) {
        const [docLng, docLat] = coords;
        if (Number.isFinite(docLat) && Number.isFinite(docLng)) {
          distanceKm = haversineDistanceKm(userLat, userLng, docLat, docLng);
          distanceText = `${distanceKm} km away`;
        }
      }

      return {
        ...publicDoc,
        distanceKm,
        distanceText
      };
    });

    // Apply filtering
    let filtered = formattedList.filter((doc) => {
      if (specialization && specialization !== 'All') {
        if (doc.specialization.toLowerCase() !== String(specialization).toLowerCase()) return false;
      }

      if (city && city.trim()) {
        const c = city.trim().toLowerCase();
        const docCity = (doc.city || '').toLowerCase();
        const docAddr = (doc.clinicAddress || '').toLowerCase();
        const docState = (doc.state || '').toLowerCase();
        if (!docCity.includes(c) && !docAddr.includes(c) && !docState.includes(c)) return false;
      }

      if (pincode && pincode.trim()) {
        const pin = pincode.trim().toLowerCase();
        const docPin = (doc.pincode || '').toLowerCase();
        const docAddr = (doc.clinicAddress || '').toLowerCase();
        if (!docPin.includes(pin) && !docAddr.includes(pin)) return false;
      }

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [
          doc.name,
          doc.specialization,
          doc.qualifications,
          doc.clinicName,
          doc.clinicAddress,
          doc.city,
          doc.state,
          doc.pincode
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // If user provided GPS coordinates and doctor has coordinates, filter out if distance exceeds maxRadiusKm
      if (hasCoordinates && doc.distanceKm !== null && doc.distanceKm > maxRadiusKm) {
        return false;
      }

      return true;
    });

    // Sort: doctors with calculated distance sorted ascending (closest first),
    // followed by doctors without coordinates sorted by experience
    filtered.sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return (b.experienceYears || 0) - (a.experienceYears || 0);
    });

    return res.status(200).json({
      success: true,
      count: filtered.length,
      radiusKm: maxRadiusKm,
      userLocation: hasCoordinates ? { latitude: userLat, longitude: userLng } : null,
      doctors: filtered
    });
  } catch (error) {
    console.error('[Nearby Doctors API Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve nearby doctors' });
  }
};

// @desc    Get detailed profile of an approved doctor
// @route   GET /api/doctors/:id
// @access  Public / Patient
const getApprovedDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];

    let docUser = await MongoDb.users.findById(id);
    if (!docUser) {
      docUser = await MongoDb.users.findOne({ roleId: id, role: 'DOCTOR' });
    }

    if (!docUser || !isDoctorApproved(docUser)) {
      return res.status(404).json({
        success: false,
        error: 'Verified doctor profile not found'
      });
    }

    const slotInfo = await computeSlotsForDate(docUser, dateStr);

    return res.status(200).json({
      success: true,
      doctor: formatPublicDoctor(docUser),
      availability: slotInfo
    });
  } catch (error) {
    console.error('[Doctor Controller GetById Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch doctor profile' });
  }
};

// @desc    Get available appointment slots for an approved doctor on a date
// @route   GET /api/doctors/:id/slots?date=YYYY-MM-DD
// @access  Public / Patient
const getDoctorSlotsForDate = async (req, res) => {
  try {
    const { id } = req.params;
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
      return res.status(400).json({ success: false, error: 'Date must be in YYYY-MM-DD format' });
    }

    const docUser = await MongoDb.users.findById(id);
    if (!docUser || !isDoctorApproved(docUser)) {
      return res.status(404).json({ success: false, error: 'Verified doctor not found' });
    }

    const slotInfo = await computeSlotsForDate(docUser, String(dateStr));
    return res.status(200).json({
      success: true,
      ...slotInfo
    });
  } catch (error) {
    console.error('[Doctor Controller Slots Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch doctor slots' });
  }
};

// @desc    Get authenticated doctor's own full profile & verification status
// @route   GET /api/doctor/profile
// @access  Private (DOCTOR)
const getOwnDoctorProfile = async (req, res) => {
  try {
    const docUser = await MongoDb.users.findById(req.user._id || req.user.id);
    if (!docUser || docUser.role !== 'DOCTOR') {
      return res.status(403).json({ success: false, error: 'Doctor account required' });
    }

    const profile = formatPublicDoctor(docUser);
    return res.status(200).json({
      success: true,
      profile: {
        ...profile,
        email: docUser.email,
        phone: docUser.phone || '',
        accountStatus: docUser.accountStatus,
        doctorVerification: docUser.doctorVerification || { status: 'PENDING' },
        isVerified: isDoctorApproved(docUser)
      }
    });
  } catch (error) {
    console.error('[Doctor Own Profile Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to load doctor profile' });
  }
};

// @desc    Update authenticated doctor's own profile & availability
// @route   PUT /api/doctor/profile
// @access  Private (DOCTOR)
const updateOwnDoctorProfile = async (req, res) => {
  try {
    const parsed = doctorProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues || [];
      return res.status(400).json({
        success: false,
        error: issues[0]?.message || 'Invalid doctor profile update payload',
        details: issues
      });
    }

    const docId = req.user._id || req.user.id;
    const docUser = await MongoDb.users.findById(docId);
    if (!docUser || docUser.role !== 'DOCTOR') {
      return res.status(403).json({ success: false, error: 'Doctor account required' });
    }

    const data = parsed.data;
    if (data.name) docUser.name = data.name;
    if (data.phone !== undefined) docUser.phone = data.phone;

    const existingProf = docUser.professionalDetails || {};
    const updatedProf = {
      ...existingProf,
      ...(data.specialization !== undefined ? { specialization: data.specialization } : {}),
      ...(data.qualifications !== undefined ? { qualifications: data.qualifications } : {}),
      ...(data.experienceYears !== undefined ? { experienceYears: data.experienceYears } : {}),
      ...(data.clinicName !== undefined ? { clinicName: data.clinicName } : {}),
      ...(data.clinicAddress !== undefined ? { clinicAddress: data.clinicAddress } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.pincode !== undefined ? { pincode: data.pincode } : {}),
      ...(data.consultationFee !== undefined ? { consultationFee: data.consultationFee } : {}),
      ...(data.consultationTypes !== undefined ? { consultationTypes: data.consultationTypes } : {}),
      ...(data.availableDays !== undefined ? { availableDays: data.availableDays } : {}),
      ...(data.availableSlots !== undefined ? { availableSlots: data.availableSlots } : {}),
      ...(data.availabilityText !== undefined ? { availabilityText: data.availabilityText } : {}),
      ...(data.slotDurationMinutes !== undefined ? { slotDurationMinutes: data.slotDurationMinutes } : {}),
      ...(data.about !== undefined ? { about: data.about } : {}),
      ...(data.languages !== undefined ? { languages: data.languages } : {}),
      ...(data.nmcRegistrationNumber !== undefined ? { nmcRegistrationNumber: data.nmcRegistrationNumber } : {}),
      ...(data.stateMedicalCouncil !== undefined ? { stateMedicalCouncil: data.stateMedicalCouncil } : {})
    };

    if (data.location?.coordinates && Array.isArray(data.location.coordinates)) {
      updatedProf.location = {
        type: 'Point',
        coordinates: [Number(data.location.coordinates[0]), Number(data.location.coordinates[1])]
      };
    } else if (data.latitude !== undefined && data.longitude !== undefined) {
      updatedProf.location = {
        type: 'Point',
        coordinates: [Number(data.longitude), Number(data.latitude)]
      };
    }

    docUser.professionalDetails = updatedProf;
    if (typeof docUser.markModified === 'function') {
      docUser.markModified('professionalDetails');
    }

    // Never allow self-approval; update registration metadata while preserving verification status
    const currentVerif = docUser.doctorVerification || { status: 'PENDING' };
    docUser.doctorVerification = {
      ...currentVerif,
      status: currentVerif.status || 'PENDING',
      ...(data.nmcRegistrationNumber !== undefined ? { nmcRegistrationNumber: data.nmcRegistrationNumber } : {}),
      ...(data.stateMedicalCouncil !== undefined ? { stateMedicalCouncil: data.stateMedicalCouncil } : {})
    };

    await docUser.save();

    await recordAuditLog({
      actorId: docId,
      actorRole: 'DOCTOR',
      action: 'DOCTOR_PROFILE_UPDATED',
      targetType: 'User',
      targetId: docId,
      details: { updatedFields: Object.keys(data) },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Doctor profile updated successfully',
      user: docUser.toAuthJSON(),
      profile: {
        ...formatPublicDoctor(docUser),
        email: docUser.email,
        phone: docUser.phone || '',
        accountStatus: docUser.accountStatus,
        doctorVerification: docUser.doctorVerification
      }
    });
  } catch (error) {
    console.error('[Doctor Update Profile Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to update doctor profile' });
  }
};

// @desc    Doctor Dashboard KPI stats, appointments, and shared report counts
// @route   GET /api/doctor/dashboard
// @access  Private (DOCTOR)
const getDoctorDashboard = async (req, res) => {
  try {
    const doctorId = String(req.user._id || req.user.id);
    const docUser = await MongoDb.users.findById(doctorId);
    if (!docUser || docUser.role !== 'DOCTOR') {
      return res.status(403).json({ success: false, error: 'Doctor account required' });
    }

    const appointments = await MongoDb.appointments.find({ doctorId });
    const today = new Date().toISOString().split('T')[0];

    const apptsJson = appointments.map((a) => (a.toJSON ? a.toJSON() : a));
    const stats = {
      total: apptsJson.length,
      pending: apptsJson.filter((a) => a.status === 'Pending').length,
      confirmed: apptsJson.filter((a) => a.status === 'Confirmed').length,
      completed: apptsJson.filter((a) => a.status === 'Completed').length,
      rejected: apptsJson.filter((a) => a.status === 'Rejected').length,
      cancelled: apptsJson.filter((a) => a.status === 'Cancelled').length,
      upcoming: apptsJson.filter((a) => ['Pending', 'Confirmed'].includes(a.status) && String(a.date) >= today).length
    };

    const sharedReports = await MongoDb.medicalReports.find({
      'sharedWithDoctors.doctorId': doctorId
    });

    return res.status(200).json({
      success: true,
      stats,
      appointments: apptsJson,
      sharedReportsCount: sharedReports.length,
      verificationStatus: docUser.doctorVerification?.status || 'PENDING',
      isVerified: isDoctorApproved(docUser),
      doctorProfile: formatPublicDoctor(docUser)
    });
  } catch (error) {
    console.error('[Doctor Dashboard Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to load doctor dashboard' });
  }
};

// @desc    Get ONLY medical reports explicitly shared by a patient with this doctor
// @route   GET /api/doctor/patients/:patientId/shared-records
// @access  Private (DOCTOR)
const getSharedRecordsForPatient = async (req, res) => {
  try {
    const doctorId = String(req.user._id || req.user.id);
    const { patientId } = req.params;

    const reports = await MongoDb.medicalReports.find({
      patientId: String(patientId),
      'sharedWithDoctors.doctorId': doctorId
    });

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('[Doctor Shared Records Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch shared patient records' });
  }
};

// @desc    Admin: List all doctors with verification statuses
// @route   GET /api/admin/doctors
// @access  Private (ADMIN)
const adminListDoctors = async (req, res) => {
  try {
    const doctors = await MongoDb.users.find({ role: 'DOCTOR' });
    const list = doctors.map((d) => ({
      ...formatPublicDoctor(d),
      email: d.email,
      phone: d.phone || '',
      accountStatus: d.accountStatus,
      doctorVerification: d.doctorVerification || { status: 'PENDING' },
      createdAt: d.createdAt
    }));

    return res.status(200).json({
      success: true,
      count: list.length,
      doctors: list
    });
  } catch (error) {
    console.error('[Admin List Doctors Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to list doctors' });
  }
};

// @desc    Admin: Approve or Reject a doctor account
// @route   PATCH /api/admin/doctors/:id/verify
// @access  Private (ADMIN)
const adminVerifyDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes = '' } = req.body;
    const nextStatus = String(status || '').toUpperCase();

    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: 'Verification status must be APPROVED, REJECTED, or PENDING'
      });
    }

    const docUser = await MongoDb.users.findById(id);
    if (!docUser || docUser.role !== 'DOCTOR') {
      return res.status(404).json({ success: false, error: 'Doctor account not found' });
    }

    docUser.doctorVerification = {
      ...(docUser.doctorVerification || {}),
      status: nextStatus,
      verifiedAt: nextStatus === 'APPROVED' ? new Date() : null,
      verifiedBy: String(req.user._id || req.user.id),
      rejectionReason: nextStatus === 'REJECTED' ? String(notes || 'Verification rejected') : ''
    };
    docUser.accountStatus = nextStatus === 'APPROVED' ? 'VERIFIED' : (nextStatus === 'REJECTED' ? 'REJECTED' : 'PENDING_VERIFICATION');

    await docUser.save();

    await recordAuditLog({
      actorId: req.user._id || req.user.id,
      actorRole: req.user.role,
      action: 'DOCTOR_VERIFICATION_UPDATED',
      targetType: 'User',
      targetId: String(docUser._id || docUser.id),
      details: { status: nextStatus, notes },
      req
    });

    return res.status(200).json({
      success: true,
      message: `Doctor verification status updated to ${nextStatus}`,
      doctor: {
        ...formatPublicDoctor(docUser),
        accountStatus: docUser.accountStatus,
        doctorVerification: docUser.doctorVerification
      }
    });
  } catch (error) {
    console.error('[Admin Verify Doctor Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to update doctor verification' });
  }
};

module.exports = {
  isDoctorApproved,
  formatPublicDoctor,
  computeSlotsForDate,
  listApprovedDoctors,
  getNearbyDoctors,
  getApprovedDoctorById,
  getDoctorSlotsForDate,
  getOwnDoctorProfile,
  updateOwnDoctorProfile,
  getDoctorDashboard,
  getSharedRecordsForPatient,
  adminListDoctors,
  adminVerifyDoctor
};
