const config = require('../config/env');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoDb, isDatabaseConnected } = require('../services/mongoDbService');
const User = require('../models/User');
const HealthId = require('../models/HealthId');
const { parseUserAgent, getClientIp, getApproximateLocation, formatLastActive } = require('../utils/deviceDetector');
const { signupSchema, loginSchema, updateProfileSchema, changePasswordSchema } = require('../validators/userValidators');
const { resendVerificationEmail } = require('../services/emailService');
const { recordAuditLog } = require('../services/auditService');
const {
  createOTPEntry,
  verifyOTPEntry,
  maskEmail,
  generateRoleId,
  OTP_RESEND_COOLDOWN_SECONDS
} = require('../services/otpService');

const JWT_SECRET = config.auth.jwtSecret;
const MAX_FAILED_LOGINS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15-minute lockout

// Canonical Health ID generator for JIVEXA Health OS patients
const generateCanonicalHealthId = () => {
  const numPart = Math.floor(100000 + Math.random() * 900000);
  return `JIV-${new Date().getFullYear()}-${numPart}`;
};

const DEFAULT_DOCTOR_SLOTS = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:30 AM', '02:00 PM', '03:30 PM', '05:00 PM'];
const DEFAULT_DOCTOR_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// TEMPORARILY DISABLED FOR LAUNCH
// Re-enable OTP after launch by setting OTP_ENABLED=true in backend/.env.
const isOtpEnabled = () => {
  return config.auth.otpEnabled;
};

// Unique session identifier generator
const generateSessionId = () => {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
};

// Record an authenticated login session in MongoDB
const recordLoginSession = async (user, req) => {
  try {
    if (!req || (!isDatabaseConnected() && (!MongoDb || !MongoDb.isAvailable()))) return null;
    const sessionId = generateSessionId();
    const ua = (req.headers && req.headers['user-agent']) || '';
    const parsedUa = parseUserAgent(ua);
    const ip = getClientIp(req);
    const location = getApproximateLocation(ip);

    await MongoDb.sessions.create({
      sessionId,
      userId: String(user._id || user.id),
      device: parsedUa.formatted,
      browser: parsedUa.browser,
      os: parsedUa.os,
      deviceType: parsedUa.deviceType,
      ip,
      location,
      userAgent: ua.slice(0, 500),
      isRevoked: false,
      createdAt: new Date(),
      lastActive: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return sessionId;
  } catch (err) {
    console.warn('[Session Tracking Notice]: Could not persist login session:', err.message);
    return null;
  }
};

// Helper to generate signed JWT token with optional sessionId binding
const generateToken = (id, email, role, name, roleId, sessionId = null) => {
  const secretKey = config.auth.jwtSecret;
  if (!secretKey) {
    throw new Error('JWT secret key is not configured in backend environment');
  }
  const payload = { id, email, role, name, roleId };
  if (sessionId) {
    payload.sessionId = sessionId;
  }
  return jwt.sign(
    payload,
    secretKey,
    { expiresIn: '7d' }
  );
};

// Cookie configuration options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: config.server.isProduction,
  sameSite: config.server.isProduction ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// @desc    Register a new user (Signup & Dispatch Email OTP)
// @route   POST /api/auth/signup
// @access  Public
const registerUser = async (req, res) => {
  try {
    const validationResult = signupSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid input data';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const { name, age, email, password, role } = validationResult.data;
    const userRole = (role || 'PATIENT').toUpperCase();
    if (userRole === 'AMBULANCE_PARTNER' || userRole === 'PHARMACY') {
      return res.status(403).json({
        success: false,
        error: `${userRole === 'AMBULANCE_PARTNER' ? 'Ambulance' : 'Pharmacy'} registration is coming soon and currently inactive.`,
        message: `${userRole === 'AMBULANCE_PARTNER' ? 'Ambulance' : 'Pharmacy'} registration is coming soon and currently inactive.`
      });
    }
    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists in MongoDB
    const existingUser = await MongoDb.users.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
        message: 'An account with this email already exists.'
      });
    }

    // Generate Prefix-Based Unique Distinguishable Role ID
    const roleId = generateRoleId(userRole);

    // Hash password with bcrypt (12 rounds)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    const generatedHealthId = userRole === 'PATIENT' ? generateCanonicalHealthId() : undefined;

    const userProfilePayload = {
      roleId,
      name,
      email: cleanEmail,
      password: hashedPassword,
      role: userRole,
      age: age !== undefined ? age : null,
      dob: req.body.dob || '',
      gender: req.body.gender || '',
      address: req.body.address || '',
      phone: req.body.phone || req.body.phoneNumber || '',
      ...(generatedHealthId ? { healthId: generatedHealthId } : {}),
      emailVerified: true,
      verified: true,
      accountStatus: userRole === 'PATIENT' ? 'ACTIVE' : 'PENDING_VERIFICATION',
      notificationPreferences: { inApp: true, email: true, appointmentReminders: true },
      privacySettings: { shareHealthSummaryOnBooking: false, allowEmergencyLookup: true, consentLogsEnabled: true },
      usage: { tokenUsed: 0, tokenLimit: 10000, totalTokenUsed: 0 }
    };

    if (userRole === 'DOCTOR') {
      const incomingProf = req.body.professionalDetails || {};
      const spec = String(incomingProf.specialization || req.body.specialization || '').trim();
      const quals = String(incomingProf.qualifications || incomingProf.qualification || req.body.qualifications || req.body.qualification || '').trim();
      const exp = Number(incomingProf.experienceYears ?? req.body.experienceYears ?? 0);
      const fee = Number(incomingProf.consultationFee ?? req.body.consultationFee ?? 500);
      const clinicName = String(incomingProf.clinicName || incomingProf.hospitalName || req.body.clinicName || req.body.hospitalName || '').trim();
      const clinicAddress = String(incomingProf.clinicAddress || req.body.clinicAddress || req.body.clinicDetails || '').trim();
      const city = String(incomingProf.city || req.body.city || '').trim();
      const state = String(incomingProf.state || req.body.state || '').trim();
      const pincode = String(incomingProf.pincode || req.body.pincode || '').trim();
      const nmcNum = String(incomingProf.nmcRegistrationNumber || incomingProf.registrationNumber || req.body.nmcRegistrationNumber || req.body.registrationNumber || '').trim();
      const council = String(incomingProf.stateMedicalCouncil || req.body.stateMedicalCouncil || 'State Medical Council').trim();
      const phoneVal = String(req.body.phone || req.body.phoneNumber || '').trim();

      let location = undefined;
      const lat = incomingProf.latitude ?? req.body.latitude;
      const lng = incomingProf.longitude ?? req.body.longitude;
      if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
        location = {
          type: 'Point',
          coordinates: [Number(lng), Number(lat)]
        };
      } else if (incomingProf.location?.coordinates && Array.isArray(incomingProf.location.coordinates)) {
        location = {
          type: 'Point',
          coordinates: [Number(incomingProf.location.coordinates[0]), Number(incomingProf.location.coordinates[1])]
        };
      }

      if (!phoneVal || !quals || !spec || !nmcNum || (!clinicName && !clinicAddress)) {
        return res.status(400).json({
          success: false,
          error: 'Doctor registration requires phone number, medical qualification, specialization, registration number, and clinic/hospital details.',
          message: 'Doctor registration requires phone number, medical qualification, specialization, registration number, and clinic/hospital details.'
        });
      }
      const cTypes = Array.isArray(incomingProf.consultationTypes) && incomingProf.consultationTypes.length > 0
        ? incomingProf.consultationTypes
        : ['In-Person', 'Video'];
      const availDays = Array.isArray(incomingProf.availableDays) && incomingProf.availableDays.length > 0
        ? incomingProf.availableDays
        : DEFAULT_DOCTOR_DAYS;
      const availSlots = Array.isArray(incomingProf.availableSlots) && incomingProf.availableSlots.length > 0
        ? incomingProf.availableSlots
        : DEFAULT_DOCTOR_SLOTS;

      userProfilePayload.professionalDetails = {
        specialization: spec,
        qualifications: quals,
        experienceYears: Number.isFinite(exp) ? exp : 0,
        nmcRegistrationNumber: nmcNum,
        stateMedicalCouncil: council,
        consultationFee: Number.isFinite(fee) ? fee : 500,
        consultationTypes: cTypes,
        clinicName,
        clinicAddress,
        city,
        state,
        pincode,
        ...(location ? { location } : {}),
        availableDays: availDays,
        availableSlots: availSlots,
        availabilityText: incomingProf.availabilityText || `${availDays.join(', ')} (9:00 AM - 5:00 PM)`,
        slotDurationMinutes: Number(incomingProf.slotDurationMinutes) || 30,
        about: incomingProf.about || '',
        languages: Array.isArray(incomingProf.languages) ? incomingProf.languages : ['English']
      };
      // Doctors always start PENDING verification until reviewed/approved
      userProfilePayload.doctorVerification = {
        status: 'PENDING',
        nmcRegistrationNumber: nmcNum,
        stateMedicalCouncil: council,
        verifiedAt: null,
        verifiedBy: '',
        rejectionReason: ''
      };
    } else if (userRole === 'AMBULANCE_PARTNER') {
      userProfilePayload.vehicleDetails = req.body.vehicleDetails || {
        vehicleNumber: req.body.vehicleNumber,
        vehicleType: req.body.vehicleType || 'Basic Life Support (BLS)',
        driverName: req.body.driverName || name,
        driverPhone: req.body.driverPhone || req.body.phone || ''
      };
    } else if (userRole === 'PHARMACY') {
      userProfilePayload.licenseDetails = req.body.licenseDetails || {
        pharmacyName: req.body.pharmacyName || name,
        drugLicenseNumber: req.body.drugLicenseNumber,
        gstin: req.body.gstin || '29AAACJ1234F1Z5'
      };
    }

    const userRecord = await MongoDb.users.create(userProfilePayload);

    // Auto-create linked health_ids record in MongoDB for registered patients
    if (userRole === 'PATIENT' && generatedHealthId) {
      await MongoDb.healthIds.create({
        healthId: generatedHealthId,
        userId: userRecord._id || userRecord.id,
        fullName: userRecord.name,
        email: userRecord.email,
        phoneNumber: userRecord.phone || '',
        dateOfBirth: req.body.dateOfBirth || req.body.dob || '2000-01-01',
        gender: req.body.gender || 'Unspecified',
        bloodGroup: req.body.bloodGroup || 'O+',
        emergencyContact: req.body.emergencyContact || {},
        healthProfile: req.body.healthProfile || {}
      }).catch((err) => {
        console.warn('[Auth Controller] MongoDB healthIds create notice:', err.message);
      });
    }

    // 4. Record initial login session for registering device
    const sessionId = await recordLoginSession(userRecord, req);

    await recordAuditLog({
      actorId: userRecord._id || userRecord.id,
      actorRole: userRole,
      action: `${userRole}_REGISTER`,
      targetType: 'User',
      targetId: userRecord._id || userRecord.id,
      details: { email: cleanEmail },
      req
    });

    // 5. Generate JWT auth token & set HTTP-only cookie
    const token = generateToken(
      userRecord._id || userRecord.id,
      userRecord.email,
      userRecord.role,
      userRecord.name,
      userRecord.roleId,
      sessionId
    );

    res.cookie('token', token, getCookieOptions());

    return res.status(201).json({
      success: true,
      requireEmailConfirmation: false,
      requireOtp: false,
      token,
      sessionId,
      email,
      message: 'Account created successfully!',
      user: userRecord.toAuthJSON ? userRecord.toAuthJSON() : userRecord
    });
  } catch (error) {
    if (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000)) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
        message: 'An account with this email already exists.'
      });
    }
    console.error('[Backend Auth Signup Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server authentication error'
    });
  }
};

// @desc    Dispatch or Resend Email Verification / OTP
// @route   POST /api/auth/send-otp, POST /api/auth/resend-verification, POST /api/auth/resend-otp
// @access  Public / Private
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required to send verification email' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!isOtpEnabled() && !req.path.includes('verification')) {
      const resendResult = await resendVerificationEmail(cleanEmail);
      return res.status(resendResult.success ? 200 : 400).json(resendResult);
    }

    const targetUser = await MongoDb.users.findOne({ email: cleanEmail });
    if (targetUser && isOtpEnabled()) {
      const otpEntry = await createOTPEntry('signup_verification');
      targetUser.otpDetails = {
        codeHash: otpEntry.otpHash,
        expiresAt: otpEntry.expiresAt,
        resendAvailableAt: otpEntry.resendAvailableAt,
        purpose: 'signup_verification',
        attempts: 0
      };
      await targetUser.save();
    }

    const resendResult = await resendVerificationEmail(cleanEmail);
    if (!resendResult.success) {
      return res.status(400).json({
        success: false,
        error: resendResult.error || 'Failed to dispatch verification email',
        message: resendResult.error || 'Failed to dispatch verification email'
      });
    }

    return res.status(200).json({
      success: true,
      message: `Verification email dispatched to ${maskEmail(cleanEmail)}. Please check your inbox.`,
      maskedEmail: maskEmail(cleanEmail)
    });
  } catch (error) {
    console.error('[Send OTP Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error sending verification email' });
  }
};

// @desc    Verify Email / OTP (Native Backend Auth)
// @route   POST /api/auth/verify-otp, POST /api/auth/check-verification
// @access  Public / Private
const verifyOTP = async (req, res) => {
  try {
    const { email, code, token: inputToken } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let targetUser = await MongoDb.users.findOne({ email: cleanEmail });
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    const otpCode = (code || inputToken || '').trim();

    if (isOtpEnabled() && targetUser.otpDetails && otpCode) {
      const otpResult = await verifyOTPEntry(targetUser.otpDetails, otpCode, 'signup_verification');
      if (!otpResult.valid) {
        if (targetUser.otpDetails) {
          targetUser.otpDetails.attempts = (targetUser.otpDetails.attempts || 0) + 1;
          await targetUser.save();
        }
        return res.status(400).json({ success: false, error: otpResult.message });
      }
    }

    targetUser.emailVerified = true;
    targetUser.verified = true;
    targetUser.otpDetails = null;

    if (!targetUser.roleId) {
      targetUser.roleId = generateRoleId(targetUser.role);
    }

    if (targetUser.role === 'PATIENT') {
      targetUser.accountStatus = 'ACTIVE';
    } else if (targetUser.role === 'DOCTOR') {
      // Preserve existing verification status; never auto-approve unverified doctors on OTP verify
      if (targetUser.doctorVerification?.status === 'APPROVED') {
        targetUser.accountStatus = 'VERIFIED';
      } else {
        targetUser.accountStatus = 'PENDING_VERIFICATION';
      }
    } else if (targetUser.role === 'AMBULANCE_PARTNER') {
      targetUser.accountStatus = targetUser.vehicleDetails?.vehicleNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
    } else if (targetUser.role === 'PHARMACY') {
      targetUser.accountStatus = targetUser.licenseDetails?.drugLicenseNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
    } else {
      targetUser.accountStatus = 'ACTIVE';
    }

    await targetUser.save();

    const token = generateToken(
      targetUser._id || targetUser.id,
      targetUser.email,
      targetUser.role,
      targetUser.name,
      targetUser.roleId
    );

    res.cookie('token', token, getCookieOptions());

    const userAuthData = targetUser.toAuthJSON ? targetUser.toAuthJSON() : targetUser;

    return res.status(200).json({
      success: true,
      message: `Email verified successfully! Unique Role ID: ${targetUser.roleId}`,
      token,
      user: userAuthData
    });
  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Server error verifying OTP' });
  }
};

// @desc    Submit Stage 2 Professional/Business Verification Credentials
// @route   POST /api/auth/submit-verification
// @access  Private / Public
const submitRoleVerification = async (req, res) => {
  try {
    const { email, nmcRegistrationNumber, stateMedicalCouncil, vehicleNumber, category, drugLicenseNumber, gstin } = req.body;

    const targetEmail = (email || req.user?.email || '').toLowerCase().trim();
    let targetUser = await MongoDb.users.findOne({ email: targetEmail });
    if (!targetUser && req.user) {
      targetUser = await MongoDb.users.findById(req.user._id || req.user.id);
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User account not found' });
    }

    if (targetUser.role === 'DOCTOR' && nmcRegistrationNumber) {
      targetUser.professionalDetails = {
        ...(targetUser.professionalDetails || {}),
        nmcRegistrationNumber,
        stateMedicalCouncil: stateMedicalCouncil || 'State Medical Council',
        submittedAt: new Date()
      };
      // Doctors must go through secure verification review before appearing as approved
      targetUser.doctorVerification = {
        ...(targetUser.doctorVerification || {}),
        status: targetUser.doctorVerification?.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
        nmcRegistrationNumber,
        stateMedicalCouncil: stateMedicalCouncil || 'State Medical Council'
      };
      if (targetUser.doctorVerification.status !== 'APPROVED') {
        targetUser.accountStatus = 'PENDING_VERIFICATION';
      }
    } else if (targetUser.role === 'AMBULANCE_PARTNER' && vehicleNumber) {
      targetUser.vehicleDetails = {
        vehicleNumber,
        category: category || 'ICU Ambulance',
        verifiedAt: new Date()
      };
      targetUser.accountStatus = 'VERIFIED';
    } else if (targetUser.role === 'PHARMACY' && drugLicenseNumber) {
      targetUser.licenseDetails = {
        pharmacyName: targetUser.name,
        drugLicenseNumber,
        gstin: gstin || '29AAACJ1234F1Z5',
        verifiedAt: new Date()
      };
      targetUser.accountStatus = 'VERIFIED';
    }

    await targetUser.save();

    await recordAuditLog({
      actorId: targetUser._id || targetUser.id,
      actorRole: targetUser.role,
      action: 'VERIFICATION_SUBMITTED',
      targetType: 'User',
      targetId: targetUser._id || targetUser.id,
      details: { accountStatus: targetUser.accountStatus },
      req
    });

    return res.json({
      success: true,
      message: targetUser.role === 'DOCTOR' && targetUser.doctorVerification?.status !== 'APPROVED'
        ? 'Verification credentials submitted and pending approval review.'
        : 'Credentials submitted successfully.',
      roleId: targetUser.roleId,
      accountStatus: targetUser.accountStatus,
      doctorVerification: targetUser.doctorVerification || null
    });
  } catch (error) {
    console.error('[Submit Verification Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Error submitting verification credentials' });
  }
};

// @desc    Authenticate user & get JWT token (Unified Login with Brute-Force Protection)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid input data';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const { email, password } = validationResult.data;
    const cleanEmail = email.trim().toLowerCase();

    let user = await MongoDb.users.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password credentials',
        message: 'Invalid email or password credentials'
      });
    }

    // Check brute-force lockout
    if (user.isLocked()) {
      const remainingMins = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / (60 * 1000));
      return res.status(423).json({
        success: false,
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMins} minutes.`
      });
    }

    // Verify password using bcrypt
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        await user.save();
        return res.status(423).json({
          success: false,
          error: 'Account locked due to 5 consecutive failed login attempts. Please try again in 15 minutes.'
        });
      }
      await user.save();
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password credentials',
        message: 'Invalid email or password credentials'
      });
    }

    // Password matches! Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.emailVerified = true;
    user.verified = true;

    if (user.accountStatus === 'PENDING_EMAIL_VERIFICATION') {
      if (user.role === 'PATIENT') {
        user.accountStatus = 'ACTIVE';
      } else if (user.role === 'DOCTOR') {
        user.accountStatus = user.doctorVerification?.status === 'APPROVED' ? 'VERIFIED' : 'PENDING_VERIFICATION';
      } else if (user.role === 'AMBULANCE_PARTNER') {
        user.accountStatus = user.vehicleDetails?.vehicleNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
      } else if (user.role === 'PHARMACY') {
        user.accountStatus = user.licenseDetails?.drugLicenseNumber ? 'VERIFIED' : 'PENDING_DOCUMENT_REVIEW';
      } else {
        user.accountStatus = 'ACTIVE';
      }
    }

    if (!user.roleId) {
      user.roleId = generateRoleId(user.role);
    }

    await user.save();

    // Record authenticated login session
    const sessionId = await recordLoginSession(user, req);

    await recordAuditLog({
      actorId: user._id || user.id,
      actorRole: user.role,
      action: `${user.role}_LOGIN`,
      targetType: 'User',
      targetId: user._id || user.id,
      details: { role: user.role },
      req
    });

    const token = generateToken(
      user._id || user.id,
      user.email,
      user.role,
      user.name,
      user.roleId,
      sessionId
    );

    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: 'User logged in successfully',
      token,
      sessionId,
      user: user.toAuthJSON ? user.toAuthJSON() : user
    });
  } catch (error) {
    console.error('[Backend Auth Login Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server authentication error'
    });
  }
};

// @desc    Logout user & clear cookie (and revoke current session if present)
// @route   POST /api/auth/logout
// @access  Public / Private
const logoutUser = async (req, res) => {
  try {
    const sessionId = req.currentSessionId || req.body?.sessionId;
    if (sessionId && (isDatabaseConnected() || (MongoDb && MongoDb.isAvailable()))) {
      await MongoDb.sessions.updateOne(
        { sessionId },
        { $set: { isRevoked: true, revokedAt: new Date() } }
      ).catch(() => {});
    }
    if (req.user) {
      await recordAuditLog({
        actorId: req.user._id || req.user.id,
        actorRole: req.user.role,
        action: `${req.user.role}_LOGOUT`,
        targetType: 'Session',
        targetId: sessionId || '',
        req
      });
    }
  } catch (_) {}

  res.clearCookie('token', {
    httpOnly: true,
    secure: config.server.isProduction,
    sameSite: config.server.isProduction ? 'none' : 'lax'
  });
  return res.status(200).json({
    success: true,
    message: 'User logged out successfully'
  });
};

// @desc    Get active login sessions for authenticated user
// @route   GET /api/auth/sessions
// @access  Private (Authenticated User)
const getUserSessions = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized, please login first'
      });
    }

    if (!isDatabaseConnected() && (!MongoDb || !MongoDb.isAvailable())) {
      return res.status(200).json({
        success: true,
        count: 0,
        sessions: []
      });
    }

    const activeSessions = await MongoDb.sessions.find(
      { userId: String(userId), isRevoked: false },
      { lastActive: -1 }
    );

    const currentSessionId = req.currentSessionId || null;

    const formattedSessions = activeSessions.map((s) => ({
      id: s.sessionId,
      device: s.device || 'Unknown Device',
      location: s.location || 'Location Unavailable',
      ip: s.ip || 'Unknown IP',
      lastActive: formatLastActive(s.lastActive),
      lastActiveAt: s.lastActive,
      createdAt: s.createdAt,
      isCurrent: Boolean(currentSessionId && s.sessionId === currentSessionId)
    }));

    return res.status(200).json({
      success: true,
      count: formattedSessions.length,
      sessions: formattedSessions
    });
  } catch (error) {
    console.error('[Get User Sessions Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve active login sessions'
    });
  }
};

// @desc    Revoke specific login session
// @route   POST /api/auth/sessions/:sessionId/revoke, DELETE /api/auth/sessions/:sessionId
// @access  Private (Authenticated User)
const revokeSession = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    if (!isDatabaseConnected() && (!MongoDb || !MongoDb.isAvailable())) {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable'
      });
    }

    const session = await MongoDb.sessions.findOne({ sessionId: String(sessionId).trim() });

    if (!session || String(session.userId) !== String(userId)) {
      return res.status(404).json({
        success: false,
        message: 'Session not found or does not belong to your account'
      });
    }

    session.isRevoked = true;
    session.revokedAt = new Date();
    await session.save();

    if (req.currentSessionId && req.currentSessionId === session.sessionId) {
      res.clearCookie('token', {
        httpOnly: true,
        secure: config.server.isProduction,
        sameSite: config.server.isProduction ? 'none' : 'lax'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Device session revoked successfully',
      revokedSessionId: session.sessionId
    });
  } catch (error) {
    console.error('[Revoke Session Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to revoke session'
    });
  }
};

// @desc    Revoke all other active login sessions (Logout all other devices)
// @route   POST /api/auth/sessions/revoke-others
// @access  Private (Authenticated User)
const revokeAllOtherSessions = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const currentSessionId = req.currentSessionId || null;

    if (!isDatabaseConnected() && (!MongoDb || !MongoDb.isAvailable())) {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable'
      });
    }

    const query = {
      userId: String(userId),
      isRevoked: false
    };
    if (currentSessionId) {
      query.sessionId = { $ne: currentSessionId };
    }

    const result = await MongoDb.sessions.updateMany(query, {
      $set: {
        isRevoked: true,
        revokedAt: new Date()
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out of all other remote device sessions',
      revokedCount: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('[Revoke Other Sessions Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to revoke other sessions'
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const userData = req.user.toAuthJSON ? req.user.toAuthJSON() : {
      id: req.user.id || req.user._id,
      roleId: req.user.roleId,
      name: req.user.name,
      age: req.user.age,
      dob: req.user.dob || '',
      gender: req.user.gender || '',
      phone: req.user.phone || '',
      address: req.user.address || '',
      email: req.user.email,
      role: req.user.role,
      emailVerified: req.user.emailVerified,
      verified: req.user.verified,
      accountStatus: req.user.accountStatus,
      doctorVerification: req.user.doctorVerification || null,
      notificationPreferences: req.user.notificationPreferences || { inApp: true, email: true, appointmentReminders: true },
      privacySettings: req.user.privacySettings || { shareHealthSummaryOnBooking: false, allowEmergencyLookup: true, consentLogsEnabled: true },
      professionalDetails: req.user.professionalDetails || null,
      avatarUrl: req.user.avatarUrl || req.user.professionalDetails?.avatarUrl || req.user.usage?.avatarUrl || '',
      createdAt: req.user.createdAt || req.user.created_at,
      updatedAt: req.user.updatedAt || req.user.updated_at
    };

    return res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Error fetching user profile'
    });
  }
};

// @desc    Update user profile & account preferences
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const validationResult = updateProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid profile update data';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const {
      name,
      age,
      email,
      phone,
      dob,
      gender,
      address,
      bloodGroup,
      allergies,
      conditions,
      emergencyContact,
      notificationPreferences,
      privacySettings
    } = validationResult.data;

    const user = await MongoDb.users.findById(req.user._id || req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (name) user.name = name;
    if (age !== undefined) user.age = age;
    if (email) user.email = email.toLowerCase().trim();
    if (phone !== undefined) user.phone = phone;
    if (dob !== undefined) user.dob = dob;
    if (gender !== undefined) user.gender = gender;
    if (address !== undefined) user.address = address;

    if (notificationPreferences) {
      user.notificationPreferences = {
        ...(user.notificationPreferences || { inApp: true, email: true, appointmentReminders: true }),
        ...notificationPreferences
      };
    }

    if (privacySettings) {
      user.privacySettings = {
        ...(user.privacySettings || { shareHealthSummaryOnBooking: false, allowEmergencyLookup: true, consentLogsEnabled: true }),
        ...privacySettings
      };
    }

    await user.save();

    // Sync patient personal/health info with linked HealthId record if patient
    if (user.role === 'PATIENT') {
      const healthIdRecord = await MongoDb.healthIds.findOne({ userId: String(user._id || user.id) });
      if (healthIdRecord) {
        if (name) healthIdRecord.fullName = name;
        if (phone !== undefined) healthIdRecord.phoneNumber = phone;
        if (dob) healthIdRecord.dateOfBirth = dob;
        if (gender && ['Male', 'Female', 'Other', 'Unspecified'].includes(gender)) {
          healthIdRecord.gender = gender;
        }
        if (address !== undefined) healthIdRecord.address = address;
        if (bloodGroup) healthIdRecord.bloodGroup = bloodGroup;
        if (emergencyContact && typeof emergencyContact === 'object') {
          healthIdRecord.emergencyContact = {
            ...(healthIdRecord.emergencyContact || {}),
            ...emergencyContact
          };
        }
        if (allergies !== undefined || conditions !== undefined) {
          healthIdRecord.healthProfile = {
            ...(healthIdRecord.healthProfile || {}),
            ...(allergies !== undefined ? { allergies: String(allergies).split(',').map((s) => s.trim()).filter(Boolean) } : {}),
            ...(conditions !== undefined ? { chronicConditions: String(conditions).split(',').map((s) => s.trim()).filter(Boolean) } : {})
          };
        }
        if (typeof healthIdRecord.save === 'function') {
          await healthIdRecord.save().catch(() => {});
        }
      }
    }

    await recordAuditLog({
      actorId: user._id || user.id,
      actorRole: user.role,
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetId: user._id || user.id,
      details: { updatedFields: Object.keys(validationResult.data) },
      req
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toAuthJSON()
    });
  } catch (error) {
    console.error('[Update Profile Error]:', error);
    return res.status(500).json({ success: false, error: error.message || 'Server error updating profile' });
  }
};

// @desc    Change authenticated user's password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const validationResult = changePasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      const issues = validationResult.error.issues || [];
      const firstError = issues[0]?.message || 'Invalid password payload';
      return res.status(400).json({
        success: false,
        error: firstError,
        message: firstError,
        details: issues
      });
    }

    const { currentPassword, newPassword } = validationResult.data;
    const userId = req.user._id || req.user.id;
    const user = await MongoDb.users.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from your current password'
      });
    }

    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    await recordAuditLog({
      actorId: userId,
      actorRole: user.role,
      action: 'PASSWORD_CHANGED',
      targetType: 'User',
      targetId: userId,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('[Change Password Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update password'
    });
  }
};

// @desc    Get audit logs for current user
// @route   GET /api/auth/audit-logs
// @access  Private
const getMyAuditLogs = async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const logs = await MongoDb.auditLogs.find({
      $or: [{ actorId: userId }, { targetId: userId }]
    });
    return res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit logs'
    });
  }
};

// @desc    Upload / Update profile photo (Stored as Data URL in MongoDB)
// @route   POST /api/auth/profile-photo
// @access  Private
const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { image, mimeType } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'Image data is required' });
    }

    let base64Data = image;
    let detectedMime = mimeType || 'image/jpeg';
    if (typeof image === 'string' && image.startsWith('data:')) {
      const match = image.match(/^data:([a-zA-Z0-9\/+-]+);base64,(.+)$/);
      if (match) {
        detectedMime = match[1];
        base64Data = match[2];
      }
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!detectedMime || !allowedMimeTypes.includes(detectedMime.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image format. Allowed formats: JPG, JPEG, PNG, WEBP.'
      });
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (buffer.length > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'Image size exceeds maximum limit of 5MB.'
      });
    }

    const fullDataUrl = `data:${detectedMime};base64,${base64Data}`;

    // Persist in MongoDB User
    const user = await MongoDb.users.findById(userId);
    if (user) {
      user.avatarUrl = fullDataUrl;
      if (user.professionalDetails) user.professionalDetails.avatarUrl = fullDataUrl;
      if (user.usage) user.usage.avatarUrl = fullDataUrl;
      await user.save();
    }

    // Sync in linked HealthId
    const healthIdRecord = await MongoDb.healthIds.findOne({ userId });
    if (healthIdRecord) {
      healthIdRecord.healthProfile = {
        ...(healthIdRecord.healthProfile || {}),
        avatarUrl: fullDataUrl
      };
      await healthIdRecord.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo uploaded successfully',
      avatarUrl: fullDataUrl
    });
  } catch (error) {
    console.error('[Upload Profile Photo Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error processing profile photo'
    });
  }
};

// @desc    Remove profile photo
// @route   DELETE /api/auth/profile-photo
// @access  Private
const removeProfilePhoto = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await MongoDb.users.findById(userId);
    if (user) {
      user.avatarUrl = '';
      if (user.professionalDetails) user.professionalDetails.avatarUrl = '';
      if (user.usage) user.usage.avatarUrl = '';
      await user.save();
    }

    const healthIdRecord = await MongoDb.healthIds.findOne({ userId });
    if (healthIdRecord && healthIdRecord.healthProfile) {
      healthIdRecord.healthProfile.avatarUrl = '';
      await healthIdRecord.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo removed successfully'
    });
  } catch (error) {
    console.error('[Remove Profile Photo Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Server error removing profile photo'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateProfile,
  changePassword,
  getMyAuditLogs,
  sendOTP,
  verifyOTP,
  submitRoleVerification,
  uploadProfilePhoto,
  removeProfilePhoto,
  getUserSessions,
  revokeSession,
  revokeAllOtherSessions
};
