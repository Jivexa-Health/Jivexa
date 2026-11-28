const { MongoDb } = require('../services/mongoDbService');
const { appointmentCreateSchema } = require('../validators/userValidators');
const { isDoctorApproved, computeSlotsForDate } = require('./doctorController');
const { recordAuditLog } = require('../services/auditService');

const ACTIVE_STATUSES = ['Pending', 'Confirmed', 'Upcoming', 'In Consultation'];
const TERMINAL_STATUSES = ['Rejected', 'Cancelled', 'Completed'];

const getLocalTodayStr = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// @desc    Create / Book a new Appointment (Atomic double-booking prevention)
// @route   POST /api/appointments
// @access  Private (PATIENT)
const createAppointment = async (req, res) => {
  try {
    if (req.user.role !== 'PATIENT' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only patient accounts can book doctor appointments'
      });
    }

    const parsed = appointmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues || [];
      return res.status(400).json({
        success: false,
        error: issues[0]?.message || 'Invalid appointment booking payload',
        details: issues
      });
    }

    const { doctorId, date, time, consultationType, reason = '', notes = '', sharedReportIds = [] } = parsed.data;

    // Validate date is not in the past
    const todayStr = getLocalTodayStr();
    if (date < todayStr) {
      return res.status(400).json({
        success: false,
        error: 'Appointment date cannot be in the past'
      });
    }

    // Verify doctor exists and is APPROVED
    const docUser = await MongoDb.users.findById(doctorId);
    if (!docUser || !isDoctorApproved(docUser)) {
      return res.status(400).json({
        success: false,
        error: 'Selected doctor is not verified or unavailable for booking'
      });
    }

    const resolvedDoctorId = String(docUser._id || docUser.id);
    const prof = docUser.professionalDetails || {};
    const supportedTypes = Array.isArray(prof.consultationTypes) && prof.consultationTypes.length > 0
      ? prof.consultationTypes
      : ['In-Person', 'Video'];

    if (!supportedTypes.includes(consultationType)) {
      return res.status(400).json({
        success: false,
        error: `This doctor only supports: ${supportedTypes.join(', ')}`
      });
    }

    // Validate slot against doctor schedule & existing active bookings
    const slotInfo = await computeSlotsForDate(docUser, date);
    if (!slotInfo.dayAvailable) {
      return res.status(400).json({
        success: false,
        error: `Dr. ${docUser.name} does not accept appointments on ${slotInfo.dayName}`
      });
    }

    const matchedSlot = slotInfo.slots.find(
      (s) => s.time.trim().toLowerCase() === time.trim().toLowerCase()
    );
    if (!matchedSlot) {
      return res.status(400).json({
        success: false,
        error: 'Selected time slot is not in this doctor\'s schedule'
      });
    }
    if (!matchedSlot.available) {
      return res.status(409).json({
        success: false,
        error: 'This appointment slot is already booked. Please choose another available slot.'
      });
    }

    const patientId = String(req.user._id || req.user.id);
    const patientName = req.user.name || 'Patient User';
    const patientPhone = req.user.phone || '';

    // Verify explicitly consented report IDs belong to this patient before sharing
    const verifiedSharedIds = [];
    if (Array.isArray(sharedReportIds) && sharedReportIds.length > 0) {
      for (const repId of sharedReportIds) {
        const rep = await MongoDb.medicalReports.findById(repId);
        if (!rep || String(rep.patientId) !== patientId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied: You can only share your own medical reports'
          });
        }
        verifiedSharedIds.push(String(rep._id || rep.id));
      }
    }

    let newAppointment;
    try {
      newAppointment = await MongoDb.appointments.create({
        patientId,
        patientName,
        patientPhone,
        doctorId: resolvedDoctorId,
        doctorName: docUser.name,
        doctorSpecialty: prof.specialization || 'General Physician',
        clinicName: prof.clinicName || '',
        clinicAddress: prof.clinicAddress || '',
        consultationFee: Number(prof.consultationFee ?? 500),
        date,
        time: matchedSlot.time,
        consultationType,
        status: 'Pending',
        activeSlot: true,
        reason: reason || notes,
        notes: notes || reason,
        sharedReportIds: verifiedSharedIds
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'This appointment slot was just booked by another patient. Please select a different slot.'
        });
      }
      throw createErr;
    }

    // Grant explicit per-report consent to this doctor for selected reports only
    for (const repId of verifiedSharedIds) {
      await MongoDb.medicalReports.shareWithDoctor(repId, patientId, {
        doctorId: resolvedDoctorId,
        doctorName: docUser.name
      }).catch(() => {});
    }

    const apptJson = newAppointment.toJSON ? newAppointment.toJSON() : newAppointment;

    await recordAuditLog({
      actorId: patientId,
      actorRole: req.user.role,
      action: 'APPOINTMENT_BOOKED',
      targetType: 'Appointment',
      targetId: apptJson.id || apptJson._id,
      details: {
        doctorId: resolvedDoctorId,
        date,
        time: matchedSlot.time,
        consultationType,
        sharedReportCount: verifiedSharedIds.length
      },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully and is pending doctor confirmation.',
      appointment: apptJson
    });
  } catch (error) {
    console.error('[Appointment Controller Create Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to book appointment'
    });
  }
};

// @desc    Get all appointments for the authenticated user (Patient / Doctor / Admin)
// @route   GET /api/appointments
// @access  Private
const getAppointments = async (req, res) => {
  try {
    const currentUserId = String(req.user._id || req.user.id);
    const userRole = req.user.role;
    const statusFilter = req.query.status ? String(req.query.status) : null;

    let filter = {};
    if (userRole === 'ADMIN') {
      filter = {};
    } else if (userRole === 'DOCTOR') {
      filter = { doctorId: currentUserId };
    } else {
      filter = { patientId: currentUserId };
    }

    if (statusFilter && statusFilter !== 'All') {
      filter.status = statusFilter;
    }

    const appointments = await MongoDb.appointments.find(filter);

    return res.status(200).json({
      success: true,
      count: appointments.length,
      appointments: appointments.map((a) => (a.toJSON ? a.toJSON() : a))
    });
  } catch (error) {
    console.error('[Appointment Controller Get Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch appointments'
    });
  }
};

// @desc    Get single appointment by ID (with strict ownership and consent-scoped shared reports)
// @route   GET /api/appointments/:id
// @access  Private
const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = String(req.user._id || req.user.id);

    const appointment = await MongoDb.appointments.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    const isPatient = String(appointment.patientId) === currentUserId;
    const isDoctor = req.user.role === 'DOCTOR' && String(appointment.doctorId) === currentUserId;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this appointment record'
      });
    }

    const apptJson = appointment.toJSON ? appointment.toJSON() : appointment;

    // Attach only explicitly consented shared reports for this doctor-patient pair
    let consentedReports = [];
    if (isDoctor || isPatient) {
      const reports = await MongoDb.medicalReports.find({
        patientId: String(appointment.patientId),
        'sharedWithDoctors.doctorId': String(appointment.doctorId)
      });
      consentedReports = reports.map((r) => ({
        id: String(r._id || r.id),
        reportTitle: r.reportTitle || r.fileName,
        fileName: r.fileName,
        reportDate: r.reportDate || '',
        healthScore: r.healthScore,
        scoreStatus: r.scoreStatus,
        summary: r.summary,
        createdAt: r.createdAt
      }));
    }

    return res.status(200).json({
      success: true,
      appointment: apptJson,
      sharedReports: consentedReports
    });
  } catch (error) {
    console.error('[Appointment Controller GetById Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch appointment details'
    });
  }
};

// @desc    Update appointment status or reschedule with strict RBAC & state machine
// @route   PATCH /api/appointments/:id, PATCH /api/appointments/:id/status
// @access  Private
const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = String(req.user._id || req.user.id);
    const userRole = req.user.role;
    const {
      status,
      date,
      time,
      notes,
      reason,
      consultationSummary,
      rejectionReason,
      cancellationReason
    } = req.body;

    const appointment = await MongoDb.appointments.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    const isPatient = userRole === 'PATIENT' && String(appointment.patientId) === currentUserId;
    const isDoctor = userRole === 'DOCTOR' && String(appointment.doctorId) === currentUserId;
    const isAdmin = userRole === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to modify this appointment'
      });
    }

    const currentStatus = appointment.status;
    const updates = {};

    if (status) {
      const normalizedStatus = String(status).trim();
      const validStatuses = ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed'];
      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Allowed values: ${validStatuses.join(', ')}`
        });
      }

      if (TERMINAL_STATUSES.includes(currentStatus)) {
        return res.status(400).json({
          success: false,
          error: `Cannot change status of an appointment that is already ${currentStatus}`
        });
      }

      if (isPatient) {
        if (normalizedStatus !== 'Cancelled') {
          return res.status(403).json({
            success: false,
            error: 'Patients can only cancel their appointments'
          });
        }
        if (!['Pending', 'Confirmed', 'Upcoming'].includes(currentStatus)) {
          return res.status(400).json({
            success: false,
            error: 'Only Pending or Confirmed appointments can be cancelled'
          });
        }
        updates.status = 'Cancelled';
        updates.activeSlot = false;
        updates.cancelledBy = 'PATIENT';
        if (cancellationReason) updates.cancellationReason = String(cancellationReason).trim();
      } else if (isDoctor || isAdmin) {
        if (normalizedStatus === 'Confirmed') {
          if (!['Pending', 'Upcoming'].includes(currentStatus)) {
            return res.status(400).json({
              success: false,
              error: 'Only Pending appointments can be confirmed'
            });
          }
          updates.status = 'Confirmed';
          updates.activeSlot = true;
        } else if (normalizedStatus === 'Rejected') {
          if (!['Pending', 'Upcoming'].includes(currentStatus)) {
            return res.status(400).json({
              success: false,
              error: 'Only Pending appointments can be rejected'
            });
          }
          updates.status = 'Rejected';
          updates.activeSlot = false;
          if (rejectionReason) updates.rejectionReason = String(rejectionReason).trim();
        } else if (normalizedStatus === 'Completed') {
          if (!['Confirmed', 'Upcoming', 'In Consultation'].includes(currentStatus)) {
            return res.status(400).json({
              success: false,
              error: 'Only Confirmed appointments can be marked as Completed'
            });
          }
          updates.status = 'Completed';
          updates.activeSlot = false;
        } else if (normalizedStatus === 'Cancelled') {
          updates.status = 'Cancelled';
          updates.activeSlot = false;
          updates.cancelledBy = userRole;
          if (cancellationReason) updates.cancellationReason = String(cancellationReason).trim();
        } else {
          return res.status(400).json({
            success: false,
            error: 'Invalid appointment status transition'
          });
        }
      }
    }

    // Handle rescheduling (only while Pending or Confirmed)
    if ((date || time) && !TERMINAL_STATUSES.includes(updates.status || currentStatus)) {
      if (!isPatient && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Only the booking patient can reschedule an appointment'
        });
      }
      const nextDate = date || appointment.date;
      const nextTime = time || appointment.time;
      if (nextDate < getLocalTodayStr()) {
        return res.status(400).json({
          success: false,
          error: 'Rescheduled date cannot be in the past'
        });
      }
      updates.date = nextDate;
      updates.time = nextTime;
      updates.status = 'Pending';
      updates.activeSlot = true;
    }

    if (isPatient && (notes !== undefined || reason !== undefined)) {
      if (notes !== undefined) updates.notes = String(notes);
      if (reason !== undefined) updates.reason = String(reason);
    }

    if ((isDoctor || isAdmin) && consultationSummary !== undefined) {
      updates.consultationSummary = String(consultationSummary);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid update fields provided'
      });
    }

    let updated;
    try {
      updated = await MongoDb.appointments.findOneAndUpdate(
        { _id: String(id) },
        { $set: updates }
      );
    } catch (updateErr) {
      if (updateErr.code === 11000) {
        return res.status(409).json({
          success: false,
          error: 'The selected date/time slot is already booked.'
        });
      }
      throw updateErr;
    }

    const finalAppt = updated ? (updated.toJSON ? updated.toJSON() : updated) : appointment;
    const auditAction = updates.status
      ? `APPOINTMENT_${updates.status.toUpperCase()}`
      : 'APPOINTMENT_UPDATED';

    await recordAuditLog({
      actorId: currentUserId,
      actorRole: userRole,
      action: auditAction,
      targetType: 'Appointment',
      targetId: String(id),
      details: updates,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Appointment updated successfully',
      appointment: finalAppt
    });
  } catch (error) {
    console.error('[Appointment Controller Update Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update appointment'
    });
  }
};

// @desc    Cancel an appointment (Enforces cancellation rules & releases slot atomically)
// @route   DELETE /api/appointments/:id
// @access  Private
const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = String(req.user._id || req.user.id);
    const userRole = req.user.role;

    const appointment = await MongoDb.appointments.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }

    const isPatient = userRole === 'PATIENT' && String(appointment.patientId) === currentUserId;
    const isDoctor = userRole === 'DOCTOR' && String(appointment.doctorId) === currentUserId;
    const isAdmin = userRole === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this appointment'
      });
    }

    if (TERMINAL_STATUSES.includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel an appointment that is already ${appointment.status}`
      });
    }

    const updated = await MongoDb.appointments.findOneAndUpdate(
      { _id: String(id) },
      {
        $set: {
          status: 'Cancelled',
          activeSlot: false,
          cancelledBy: userRole,
          cancellationReason: req.body?.reason ? String(req.body.reason).trim() : ''
        }
      }
    );

    await recordAuditLog({
      actorId: currentUserId,
      actorRole: userRole,
      action: 'APPOINTMENT_CANCELLED',
      targetType: 'Appointment',
      targetId: String(id),
      details: { previousStatus: appointment.status },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      appointment: updated ? (updated.toJSON ? updated.toJSON() : updated) : appointment
    });
  } catch (error) {
    console.error('[Appointment Controller Delete Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel appointment'
    });
  }
};

// @desc    Update explicit consent for reports shared with the appointment's doctor
// @route   PATCH /api/appointments/:id/consent
// @access  Private (PATIENT)
const updateAppointmentConsent = async (req, res) => {
  try {
    const { id } = req.params;
    const patientId = String(req.user._id || req.user.id);
    const { sharedReportIds } = req.body;

    if (!Array.isArray(sharedReportIds)) {
      return res.status(400).json({
        success: false,
        error: 'sharedReportIds must be an array of report IDs'
      });
    }

    const appointment = await MongoDb.appointments.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }
    if (String(appointment.patientId) !== patientId) {
      return res.status(403).json({
        success: false,
        error: 'Only the owning patient can manage consent for this appointment'
      });
    }

    const doctorId = String(appointment.doctorId);
    const doctorName = appointment.doctorName || 'Doctor';

    // Validate ownership of every requested report
    const cleanTargetIds = [];
    for (const repId of sharedReportIds) {
      const rep = await MongoDb.medicalReports.findById(repId);
      if (!rep || String(rep.patientId) !== patientId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You can only share your own medical reports'
        });
      }
      cleanTargetIds.push(String(rep._id || rep.id));
    }

    const prevIds = Array.isArray(appointment.sharedReportIds) ? appointment.sharedReportIds.map(String) : [];

    // Share newly added reports
    for (const repId of cleanTargetIds) {
      await MongoDb.medicalReports.shareWithDoctor(repId, patientId, { doctorId, doctorName });
    }

    // Revoke previously shared reports that were unchecked
    for (const oldId of prevIds) {
      if (!cleanTargetIds.includes(oldId)) {
        await MongoDb.medicalReports.revokeDoctorAccess(oldId, patientId, doctorId);
      }
    }

    const updated = await MongoDb.appointments.findOneAndUpdate(
      { _id: String(id) },
      { $set: { sharedReportIds: cleanTargetIds } }
    );

    await recordAuditLog({
      actorId: patientId,
      actorRole: 'PATIENT',
      action: 'CONSENT_UPDATED',
      targetType: 'Appointment',
      targetId: String(id),
      details: { doctorId, sharedReportIds: cleanTargetIds },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Health record sharing consent updated successfully',
      appointment: updated ? (updated.toJSON ? updated.toJSON() : updated) : appointment
    });
  } catch (error) {
    console.error('[Appointment Consent Error]:', error);
    return res.status(500).json({ success: false, error: 'Failed to update consent settings' });
  }
};

module.exports = {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  updateAppointmentConsent
};
