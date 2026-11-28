import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useHealthData } from '../../context/HealthDataContext';
import {
  fetchDoctorProfileApi,
  fetchDoctorSlotsApi,
  VerifiedDoctor,
  SlotAvailability
} from '../../services/doctorService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import {
  ArrowLeft, CheckCircle2, Building2, MapPin, Clock, Video,
  Stethoscope, Award, Calendar, FileText, ShieldCheck, AlertCircle, RefreshCw, Check
} from 'lucide-react';

export const DoctorProfilePage: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>();
  const navigate = useNavigate();
  const { medicalReports, bookAppointment } = useHealthData();

  const [doctor, setDoctor] = useState<VerifiedDoctor | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [dayAvailable, setDayAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Booking Steps State
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [selectedTime, setSelectedTime] = useState('');
  const [consultationType, setConsultationType] = useState<'In-Person' | 'Video'>('In-Person');
  const [reason, setReason] = useState('');
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [step, setStep] = useState<'select' | 'review' | 'confirmed'>('select');
  const [bookingError, setBookingError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedAppt, setConfirmedAppt] = useState<any>(null);
  const [toastMsg, setToastMsg] = useState('');

  const nextDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return {
      fullDate: `${y}-${m}-${day}`,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    };
  });

  const loadProfile = useCallback(async () => {
    if (!doctorId) return;
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetchDoctorProfileApi(doctorId, selectedDate);
      if (res.success && res.doctor) {
        setDoctor(res.doctor);
        setSlots(res.availability?.slots || []);
        setDayAvailable(res.availability?.dayAvailable ?? true);
        if (res.doctor.consultationTypes && res.doctor.consultationTypes.length > 0) {
          setConsultationType(res.doctor.consultationTypes[0]);
        }
      } else {
        setLoadError(res.error || 'Verified doctor profile not found.');
      }
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load doctor profile.');
    } finally {
      setIsLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleDateChange = async (newDate: string) => {
    setSelectedDate(newDate);
    setSelectedTime('');
    setBookingError('');
    if (!doctorId) return;
    setIsLoadingSlots(true);
    try {
      const res = await fetchDoctorSlotsApi(doctorId, newDate);
      if (res.success && res.availability) {
        setSlots(res.availability.slots);
        setDayAvailable(res.availability.dayAvailable);
      }
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const toggleReportShare = (repId: string) => {
    setSelectedReportIds((prev) =>
      prev.includes(repId) ? prev.filter((id) => id !== repId) : [...prev, repId]
    );
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    if (!selectedDate) {
      setBookingError('Please select an appointment date.');
      return;
    }
    if (!selectedTime) {
      setBookingError('Please select an available time slot.');
      return;
    }
    if (!reason.trim()) {
      setBookingError('Please enter a short reason for your consultation.');
      return;
    }
    setStep('review');
  };

  const handleConfirmBooking = async () => {
    if (!doctor) return;
    setBookingError('');
    setIsSubmitting(true);
    try {
      const res = await bookAppointment(
        doctor.id,
        selectedDate,
        selectedTime,
        reason.trim(),
        consultationType,
        selectedReportIds
      );
      if (res.success && res.appointment) {
        setConfirmedAppt(res.appointment);
        setStep('confirmed');
        setToastMsg('Appointment booked successfully! Status: Pending confirmation.');
      } else {
        setBookingError(res.error || 'Could not confirm appointment.');
        setStep('select');
        handleDateChange(selectedDate);
      }
    } catch (err: any) {
      setBookingError(err.message || 'Unexpected error during booking.');
      setStep('select');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card style={{ padding: '56px 24px', textAlign: 'center', borderRadius: '20px' }}>
        <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Loading doctor profile...</p>
      </Card>
    );
  }

  if (loadError || !doctor) {
    return (
      <Card style={{ padding: '48px 24px', textAlign: 'center', borderRadius: '20px' }}>
        <AlertCircle size={36} style={{ color: 'var(--error)', margin: '0 auto 12px auto' }} />
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 8px 0' }}>Doctor Profile Unavailable</h3>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 18px 0' }}>{loadError || 'This doctor profile could not be found.'}</p>
        <Button onClick={() => navigate('/patient/doctors')}>Back to Find Doctor</Button>
      </Card>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <Button
          variant="outline"
          onClick={() => navigate('/patient/doctors')}
          style={{ borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={16} />
          Back to Find Doctor
        </Button>
      </div>

      {/* DOCTOR PROFILE HEADER CARD */}
      <Card style={{ borderRadius: '22px', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {doctor.avatarUrl ? (
              <img
                src={doctor.avatarUrl}
                alt={doctor.name}
                style={{ width: '92px', height: '92px', borderRadius: '22px', objectFit: 'cover', border: '2px solid var(--border)' }}
              />
            ) : (
              <div
                style={{
                  width: '92px',
                  height: '92px',
                  borderRadius: '22px',
                  background: 'linear-gradient(135deg, #0f766e 0%, #10b981 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                  fontWeight: 900
                }}
              >
                {doctor.name.replace(/^Dr\.?\s*/i, '').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'DR'}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: 'var(--text-dark)' }}>{doctor.name}</h1>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                    padding: '3px 10px',
                    borderRadius: '14px',
                    fontSize: '0.74rem',
                    fontWeight: 800
                  }}
                >
                  <CheckCircle2 size={13} />
                  Verified & Approved Doctor
                </span>
              </div>

              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {doctor.specialization} • {doctor.experienceYears} Years Experience
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <Award size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {doctor.qualifications}
                {doctor.nmcRegistrationNumber ? ` • Reg: ${doctor.nmcRegistrationNumber}` : ''}
              </div>
              {doctor.languages && doctor.languages.length > 0 && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Languages: {doctor.languages.join(', ')}
                </div>
              )}
            </div>
          </div>

          <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', padding: '16px 22px', borderRadius: '16px', textAlign: 'right' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#0f766e', display: 'block' }}>
              Consultation Fee
            </span>
            <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f766e' }}>
              ₹{doctor.consultationFee}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              {doctor.consultationTypes.join(' / ')}
            </span>
          </div>
        </div>

        {/* Clinic & About Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }} className="grid-2-mobile">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={16} style={{ color: 'var(--primary)' }} />
              Clinic / Hospital Details
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-dark)', fontWeight: 700, margin: 0 }}>
              {doctor.clinicName || 'Verified Medical Clinic'}
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              {[doctor.clinicAddress, doctor.city].filter(Boolean).join(', ') || 'Location provided upon confirmation'}
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0 }}>
              <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              {doctor.availabilityText || `Available: ${doctor.availableDays.join(', ')}`}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={16} style={{ color: 'var(--primary)' }} />
              About Doctor
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
              {doctor.about || `${doctor.name} is a verified ${doctor.specialization} offering ${doctor.consultationTypes.join(' and ')} consultations.`}
            </p>
          </div>
        </div>
      </Card>

      {/* BOOKING WORKFLOW */}
      {step === 'confirmed' && confirmedAppt ? (
        <Card style={{ borderRadius: '22px', padding: '32px', border: '1.5px solid #a7f3d0', backgroundColor: '#f0fdf4' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={34} />
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#14532d', margin: 0 }}>
              Appointment Request Submitted
            </h2>
            <p style={{ fontSize: '0.92rem', color: '#166534', maxWidth: '520px', margin: 0 }}>
              Your appointment with <strong>{confirmedAppt.doctorName}</strong> on <strong>{confirmedAppt.date}</strong> at <strong>{confirmedAppt.time}</strong> has been created and is currently <strong>{confirmedAppt.status}</strong> doctor confirmation.
            </p>

            <div style={{ backgroundColor: 'white', border: '1px solid #bbf7d0', borderRadius: '16px', padding: '18px 24px', width: '100%', maxWidth: '520px', textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-light)' }}>Booking ID</span><br /><strong>{confirmedAppt.id}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Status</span><br /><strong style={{ color: '#d97706' }}>{confirmedAppt.status}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Consultation Type</span><br /><strong>{confirmedAppt.consultationType}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Fee</span><br /><strong>₹{confirmedAppt.consultationFee ?? doctor.consultationFee}</strong></div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
              <Button onClick={() => navigate('/patient/appointments')} style={{ borderRadius: '12px', fontWeight: 800 }}>
                Go to My Appointments
              </Button>
              <Button variant="outline" onClick={() => navigate('/patient/doctors')} style={{ borderRadius: '12px' }}>
                Browse More Doctors
              </Button>
            </div>
          </div>
        </Card>
      ) : step === 'review' ? (
        <Card
          title={<span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Review Booking Details</span>}
          style={{ borderRadius: '22px', padding: '24px' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {bookingError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', color: '#b91c1c', fontSize: '0.86rem', fontWeight: 600 }}>
                {bookingError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', backgroundColor: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid var(--border)', fontSize: '0.88rem' }} className="grid-2-mobile">
              <div><span style={{ color: 'var(--text-light)', display: 'block', fontSize: '0.76rem' }}>Doctor</span><strong>{doctor.name} ({doctor.specialization})</strong></div>
              <div><span style={{ color: 'var(--text-light)', display: 'block', fontSize: '0.76rem' }}>Clinic / Hospital</span><strong>{doctor.clinicName || 'Verified Clinic'}</strong></div>
              <div><span style={{ color: 'var(--text-light)', display: 'block', fontSize: '0.76rem' }}>Date & Time Slot</span><strong>{selectedDate} at {selectedTime}</strong></div>
              <div><span style={{ color: 'var(--text-light)', display: 'block', fontSize: '0.76rem' }}>Consultation Type</span><strong>{consultationType}</strong></div>
              <div><span style={{ color: 'var(--text-light)', display: 'block', fontSize: '0.76rem' }}>Consultation Fee</span><strong>₹{doctor.consultationFee}</strong></div>
              <div><span style={{ color: 'var(--text-light)', display: 'block', fontSize: '0.76rem' }}>Shared Reports</span><strong>{selectedReportIds.length} report(s) explicitly selected</strong></div>
            </div>

            <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', padding: '14px 16px', borderRadius: '12px', fontSize: '0.86rem' }}>
              <strong style={{ color: '#0f766e', display: 'block', marginBottom: '4px' }}>Reason for Consultation:</strong>
              <span>{reason}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button variant="outline" onClick={() => setStep('select')} disabled={isSubmitting} style={{ borderRadius: '12px' }}>
                Edit Details
              </Button>
              <Button onClick={handleConfirmBooking} isLoading={isSubmitting} style={{ borderRadius: '12px', fontWeight: 800 }}>
                Confirm Appointment
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} style={{ color: 'var(--primary)' }} />
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Book Appointment</span>
            </div>
          }
          style={{ borderRadius: '22px', padding: '24px' }}
        >
          <form onSubmit={handleProceedToReview} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {bookingError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', color: '#b91c1c', fontSize: '0.86rem', fontWeight: 600 }}>
                {bookingError}
              </div>
            )}

            {/* 1. Date Selection */}
            <div>
              <label style={{ fontSize: '0.88rem', fontWeight: 800, display: 'block', marginBottom: '10px' }}>
                1. Select Available Date *
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {nextDates.map((d) => (
                  <button
                    key={d.fullDate}
                    type="button"
                    onClick={() => handleDateChange(d.fullDate)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid',
                      borderColor: selectedDate === d.fullDate ? 'var(--primary)' : 'var(--border)',
                      backgroundColor: selectedDate === d.fullDate ? 'var(--primary-light)' : 'white',
                      color: selectedDate === d.fullDate ? 'var(--primary)' : 'var(--text-dark)',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div style={{ maxWidth: '220px' }}>
                <Input
                  type="date"
                  min={todayStr}
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>
            </div>

            {/* 2. Time Slot Selection */}
            <div>
              <label style={{ fontSize: '0.88rem', fontWeight: 800, display: 'block', marginBottom: '10px' }}>
                2. Select Available Time Slot *
              </label>
              {isLoadingSlots ? (
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Checking live slot availability...</div>
              ) : !dayAvailable ? (
                <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.85rem' }}>
                  Doctor is not available on this day ({doctor.availableDays.join(', ')} only). Please select another date.
                </div>
              ) : slots.length === 0 ? (
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No appointment slots configured for this date.</div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {slots.map((slot) => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        style={{
                          padding: '9px 15px',
                          borderRadius: '10px',
                          border: '1.5px solid',
                          borderColor: !slot.available ? '#e2e8f0' : (isSelected ? 'var(--primary)' : 'var(--border)'),
                          backgroundColor: !slot.available ? '#f1f5f9' : (isSelected ? 'var(--primary)' : 'white'),
                          color: !slot.available ? '#94a3b8' : (isSelected ? 'white' : 'var(--text-dark)'),
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          cursor: !slot.available ? 'not-allowed' : 'pointer',
                          textDecoration: !slot.available ? 'line-through' : 'none'
                        }}
                      >
                        {slot.time} {!slot.available ? '(Booked)' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Consultation Type */}
            <div>
              <label style={{ fontSize: '0.88rem', fontWeight: 800, display: 'block', marginBottom: '10px' }}>
                3. Select Consultation Type *
              </label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {doctor.consultationTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setConsultationType(type)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '12px',
                      border: '2px solid',
                      borderColor: consultationType === type ? 'var(--primary)' : 'var(--border)',
                      backgroundColor: consultationType === type ? 'var(--primary-light)' : 'white',
                      color: consultationType === type ? 'var(--primary)' : 'var(--text-dark)',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {type === 'Video' ? <Video size={16} /> : <Building2 size={16} />}
                    {type === 'Video' ? 'Video Consultation' : 'In-Person Clinic Visit'}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Reason for Consultation */}
            <div>
              <Input
                label="4. Short Reason for Consultation *"
                placeholder="e.g., Persistent headache for 3 days, blood pressure follow-up..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {/* 5. Explicit Health Record Consent */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', backgroundColor: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>
                  5. Consent-Based Report Sharing (Optional)
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                Booking does not automatically grant access to your health records. Select only the specific reports you want to share with {doctor.name}:
              </p>

              {medicalReports.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
                  No analyzed lab reports in your vault to attach. You can also share reports later from My Appointments.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {medicalReports.map((rep) => {
                    const checked = selectedReportIds.includes(rep.id);
                    return (
                      <label
                        key={rep.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          backgroundColor: 'white',
                          border: '1px solid',
                          borderColor: checked ? 'var(--primary)' : 'var(--border)',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '0.84rem'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleReportShare(rep.id)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                        />
                        <FileText size={16} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: 700, flex: 1 }}>{rep.analysis?.reportTitle || rep.fileName}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(rep.uploadedAt).toLocaleDateString()}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" style={{ borderRadius: '12px', padding: '12px 28px', fontWeight: 800 }}>
                <Check size={16} />
                Review Booking Details
              </Button>
            </div>
          </form>
        </Card>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
};
