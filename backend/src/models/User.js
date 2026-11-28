const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const doctorVerificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING'
    },
    nmcRegistrationNumber: { type: String, trim: true, default: '' },
    stateMedicalCouncil: { type: String, trim: true, default: '' },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: String, default: '' },
    rejectionReason: { type: String, default: '' }
  },
  { _id: false }
);

const professionalDetailsSchema = new mongoose.Schema(
  {
    qualifications: { type: String, trim: true, default: '' },
    specialization: { type: String, trim: true, default: '' },
    nmcRegistrationNumber: { type: String, trim: true, default: '' },
    stateMedicalCouncil: { type: String, trim: true, default: '' },
    experienceYears: { type: Number, default: 0 },
    clinicName: { type: String, trim: true, default: '' },
    clinicAddress: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude] in GeoJSON format
        default: undefined
      }
    },
    consultationFee: { type: Number, default: 500 },
    consultationTypes: { type: [String], default: undefined },
    availableDays: { type: [String], default: undefined },
    availableSlots: { type: [String], default: undefined },
    availabilityText: { type: String, trim: true, default: '' },
    slotDurationMinutes: { type: Number, default: 30 },
    about: { type: String, trim: true, default: '' },
    languages: { type: [String], default: undefined },
    avatarUrl: { type: String, default: '' }
  },
  { _id: false, strict: false }
);

const userSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    roleId: {
      type: String,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    role: {
      type: String,
      enum: ['PATIENT', 'DOCTOR', 'PHARMACY', 'ADMIN', 'AMBULANCE_PARTNER'],
      default: 'PATIENT',
      index: true
    },
    healthId: {
      type: String,
      trim: true,
      default: undefined,
      index: true
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    age: {
      type: Number,
      default: null
    },
    dob: {
      type: String,
      trim: true,
      default: ''
    },
    gender: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    emailVerified: {
      type: Boolean,
      default: true
    },
    verified: {
      type: Boolean,
      default: true
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    accountStatus: {
      type: String,
      default: 'ACTIVE'
    },
    doctorVerification: {
      type: doctorVerificationSchema,
      default: undefined
    },
    notificationPreferences: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      appointmentReminders: { type: Boolean, default: true }
    },
    privacySettings: {
      shareHealthSummaryOnBooking: { type: Boolean, default: false },
      allowEmergencyLookup: { type: Boolean, default: true },
      consentLogsEnabled: { type: Boolean, default: true }
    },
    otpDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    },
    professionalDetails: {
      type: professionalDetailsSchema,
      default: undefined
    },
    vehicleDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    licenseDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    usage: {
      tokenUsed: { type: Number, default: 0 },
      tokenLimit: { type: Number, default: 10000 },
      totalTokenUsed: { type: Number, default: 0 },
      resetAt: { type: Date, default: null },
      avatarUrl: { type: String, default: '' },
      avatarPath: { type: String, default: '' }
    },
    avatarUrl: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual id field matching _id
userSchema.virtual('id').get(function () {
  return this._id;
});

// GeoJSON 2dsphere geospatial index for location-aware Doctor discovery (sparse so non-doctor users are unaffected)
userSchema.index({ 'professionalDetails.location': '2dsphere' }, { sparse: true });

// Pre-save hook to hash password with bcrypt (12 rounds) if modified
userSchema.pre('save', async function () {
  // Hash only when the password changes and is not already bcrypt-hashed
  if (this.isModified('password') && this.password && !this.password.startsWith('$2')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Sync avatarUrl inside professionalDetails and usage
  if (this.avatarUrl) {
    if (this.professionalDetails) {
      this.professionalDetails.avatarUrl = this.avatarUrl;
    }
    if (this.usage) {
      this.usage.avatarUrl = this.avatarUrl;
    }
  }
});

// Instance method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password || !enteredPassword) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance method to check brute-force lockout status
userSchema.methods.isLocked = function () {
  return Boolean(this.lockUntil && this.lockUntil > new Date());
};

// Safe JSON representation for auth responses (never leaks password or sensitive hashes)
userSchema.methods.toAuthJSON = function () {
  return {
    id: this._id,
    _id: this._id,
    roleId: this.roleId,
    name: this.name,
    phone: this.phone || '',
    healthId: this.healthId || '',
    age: this.age,
    dob: this.dob || '',
    gender: this.gender || '',
    address: this.address || '',
    email: this.email,
    role: this.role,
    emailVerified: Boolean(this.emailVerified),
    verified: Boolean(this.verified || this.emailVerified),
    twoFactorEnabled: Boolean(this.twoFactorEnabled),
    accountStatus: this.accountStatus,
    doctorVerification: this.role === 'DOCTOR' ? (this.doctorVerification || null) : null,
    notificationPreferences: this.notificationPreferences || { inApp: true, email: true, appointmentReminders: true },
    privacySettings: this.privacySettings || { shareHealthSummaryOnBooking: false, allowEmergencyLookup: true, consentLogsEnabled: true },
    professionalDetails: this.professionalDetails || null,
    vehicleDetails: this.vehicleDetails,
    licenseDetails: this.licenseDetails,
    usage: this.usage,
    avatarUrl: this.avatarUrl || this.professionalDetails?.avatarUrl || this.usage?.avatarUrl || '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
