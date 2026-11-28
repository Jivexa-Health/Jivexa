const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    patientId: {
      type: String,
      required: [true, 'Patient ID is required'],
      index: true
    },
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true
    },
    patientPhone: {
      type: String,
      default: '',
      trim: true
    },
    doctorId: {
      type: String,
      required: [true, 'Doctor ID is required'],
      index: true
    },
    doctorName: {
      type: String,
      required: [true, 'Doctor name is required'],
      trim: true
    },
    doctorSpecialty: {
      type: String,
      default: 'General Medicine',
      trim: true
    },
    clinicName: {
      type: String,
      default: '',
      trim: true
    },
    clinicAddress: {
      type: String,
      default: '',
      trim: true
    },
    consultationFee: {
      type: Number,
      default: 0
    },
    date: {
      type: String,
      required: [true, 'Appointment date is required'],
      index: true
    },
    time: {
      type: String,
      required: [true, 'Appointment time is required'],
      trim: true
    },
    consultationType: {
      type: String,
      enum: ['In-Person', 'Video'],
      default: 'In-Person'
    },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed', 'Upcoming', 'In Consultation'],
      default: 'Pending',
      index: true
    },
    activeSlot: {
      type: Boolean,
      default: true
    },
    reason: {
      type: String,
      default: '',
      trim: true
    },
    notes: {
      type: String,
      default: '',
      trim: true
    },
    consultationSummary: {
      type: String,
      default: ''
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    cancellationReason: {
      type: String,
      default: ''
    },
    cancelledBy: {
      type: String,
      default: ''
    },
    sharedReportIds: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Atomic database-level double-booking guard for active slots across all application instances
appointmentSchema.index(
  { doctorId: 1, date: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: { activeSlot: true }
  }
);

appointmentSchema.virtual('id').get(function () {
  return this._id;
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
