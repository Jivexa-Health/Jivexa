const { z } = require('zod');

const ageSchema = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return undefined;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return undefined;
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
  }
  return val;
}, z
  .number({ error: 'Age must be a valid number' })
  .min(10, { error: 'Age must be at least 10' })
  .max(120, { error: 'Age must be at most 120' })
  .optional()
);

const strongPasswordSchema = z
  .string({ error: 'Password is required' })
  .min(8, { error: 'Password must be at least 8 characters long' })
  .max(64, { error: 'Password must be at most 64 characters long' })
  .regex(/[A-Z]/, { error: 'Password must contain at least one uppercase letter' })
  .regex(/[a-z]/, { error: 'Password must contain at least one lowercase letter' })
  .regex(/[0-9]/, { error: 'Password must contain at least one number' })
  .regex(/[^A-Za-z0-9]/, { error: 'Password must contain at least one special character' });

const signupSchema = z.object({
  name: z
    .string({ error: 'Full name is required' })
    .trim()
    .min(3, { error: 'Name must be at least 3 characters long' })
    .max(80, { error: 'Name must be at most 80 characters long' }),

  age: ageSchema,

  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ error: 'Email is required' }).email({ error: 'Invalid email address' })
  ),

  password: strongPasswordSchema,

  role: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 'PATIENT';
      if (typeof val === 'string') return val.trim().toUpperCase();
      return val;
    },
    z.enum(['PATIENT', 'DOCTOR', 'PHARMACY', 'AMBULANCE_PARTNER', 'ADMIN'], {
      error: 'Invalid user role specified'
    }).default('PATIENT')
  ).default('PATIENT'),

  phone: z.string().trim().optional(),
  phoneNumber: z.string().trim().optional(),
  healthId: z.string().trim().optional()
});

const loginSchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ error: 'Email is required' }).email({ error: 'Invalid email address' })
  ),

  password: z
    .string({ error: 'Password is required' })
    .min(1, { error: 'Password cannot be empty' })
});

const updateProfileSchema = z.object({
  name: z
    .string({ error: 'Name must be a valid string' })
    .trim()
    .min(3, { error: 'Name must be at least 3 characters long' })
    .max(80, { error: 'Name must be at most 80 characters long' })
    .optional(),

  age: ageSchema,

  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string({ error: 'Email must be a valid string' }).email({ error: 'Invalid email address' })
  ).optional(),

  phone: z.string().trim().max(30).optional(),
  dob: z.string().trim().max(30).optional(),
  gender: z.string().trim().max(30).optional(),
  address: z.string().trim().max(240).optional(),
  bloodGroup: z.string().trim().max(30).optional(),
  allergies: z.string().trim().max(500).optional(),
  conditions: z.string().trim().max(500).optional(),
  emergencyContact: z.any().optional(),
  notificationPreferences: z.object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
    appointmentReminders: z.boolean().optional()
  }).optional(),
  privacySettings: z.object({
    shareHealthSummaryOnBooking: z.boolean().optional(),
    allowEmergencyLookup: z.boolean().optional(),
    consentLogsEnabled: z.boolean().optional()
  }).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Current password is required' }).min(1, 'Current password is required'),
  newPassword: strongPasswordSchema
});

const doctorProfileUpdateSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  specialization: z.string().trim().min(2).max(80).optional(),
  qualifications: z.string().trim().min(2).max(200).optional(),
  experienceYears: z.coerce.number().min(0).max(70).optional(),
  clinicName: z.string().trim().max(120).optional(),
  clinicAddress: z.string().trim().max(240).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  pincode: z.string().trim().max(20).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  location: z.object({
    type: z.literal('Point').default('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  }).optional(),
  consultationFee: z.coerce.number().min(0).max(50000).optional(),
  consultationTypes: z.array(z.enum(['In-Person', 'Video'])).min(1).optional(),
  availableDays: z.array(z.string().trim()).optional(),
  availableSlots: z.array(z.string().trim()).optional(),
  availabilityText: z.string().trim().max(200).optional(),
  slotDurationMinutes: z.coerce.number().min(10).max(120).optional(),
  about: z.string().trim().max(1000).optional(),
  languages: z.array(z.string().trim()).optional(),
  nmcRegistrationNumber: z.string().trim().max(60).optional(),
  stateMedicalCouncil: z.string().trim().max(120).optional()
});

const appointmentCreateSchema = z.object({
  doctorId: z.string({ error: 'Doctor ID is required' }).trim().min(1, 'Doctor ID is required'),
  date: z.string({ error: 'Appointment date is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  time: z.string({ error: 'Appointment time slot is required' }).trim().min(3).max(30),
  consultationType: z.enum(['In-Person', 'Video']).default('In-Person'),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  sharedReportIds: z.array(z.string().trim()).max(20).optional()
});

module.exports = {
  signupSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  doctorProfileUpdateSchema,
  appointmentCreateSchema
};
