import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useHealthData, Appointment } from '../../context/HealthDataContext';
import { updateAppointmentConsentApi } from '../../services/clinicalService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Toast } from '../../components/ui/Toast';
import {
  Calendar, Clock, Video, Building2, XCircle, CheckCircle2,
  Stethoscope, FileText, ShieldCheck, Search, RefreshCw, Eye
} from 'lucide-react';

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  Pending: { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  Confirmed: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  Rejected: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  Cancelled: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  Completed: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  Upcoming: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  'In Consultation': { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
};

export const PatientAppointments: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    appointments,
    medicalReports,
    cancelAppointment,
    refreshAppointments
  } = useHealthData();

  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Previous'>('Upcoming');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [consentIds, setConsentIds] = useState<string[]>([]);
  const [isSavingConsent, setIsSavingConsent] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    setIsRefreshing(true);
    refreshAppointments().finally(() => setIsRefreshing(false));
  }, [refreshAppointments]);

  const patientAppts = appointments.filter((a) => !user?.id || a.patientId === user.id);

  const upcomingStatuses = ['Pending', 'Confirmed', 'Upcoming', 'In Consultation'];
  const previousStatuses = ['Completed', 'Rejected', 'Cancelled'];

  const filtered = patientAppts.filter((a) =>
    activeTab === 'Upcoming'
      ? upcomingStatuses.includes(a.status)
      : previousStatuses.includes(a.status)
  );

  const handleOpenDetails = (appt: Appointment) => {
    setSelectedAppt(appt);
    setConsentIds(Array.isArray(appt.sharedReportIds) ? appt.sharedReportIds : []);
  };

  const handleCancelClick = async (appt: Appointment) => {
    if (!window.confirm(`Cancel your ${appt.status.toLowerCase()} appointment with ${appt.doctorName} on ${appt.date} at ${appt.time}?`)) {
      return;
    }
    setCancellingId(appt.id);
    const res = await cancelAppointment(appt.id);
    setCancellingId(null);
    if (res.success) {
      setToastMsg('Appointment cancelled successfully.');
      if (selectedAppt?.id === appt.id) {
        setSelectedAppt(null);
      }
    } else {
      setToastMsg(`Error: ${res.error || 'Could not cancel appointment.'}`);
    }
  };

  const handleSaveConsent = async () => {
    if (!selectedAppt) return;
    setIsSavingConsent(true);
    const res = await updateAppointmentConsentApi(selectedAppt.id, consentIds);
    setIsSavingConsent(false);
    if (res.success) {
      await refreshAppointments();
      setToastMsg('Health record sharing consent updated.');
      setSelectedAppt((prev) => (prev ? { ...prev, sharedReportIds: consentIds } : null));
    } else {
      setToastMsg(`Error: ${res.error || 'Could not update consent.'}`);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #10b981 100%)',
          borderRadius: '20px',
          padding: '28px 32px',
          color: 'white',
          boxShadow: '0 10px 26px -8px rgba(15, 118, 110, 0.35)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0
            }}
          >
            <Calendar size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', margin: 0 }}>
              My Appointments
            </h1>
            <p style={{ opacity: 0.92, fontSize: '0.88rem', marginTop: '4px', marginBottom: 0 }}>
              Track upcoming consultations, doctor confirmations, past visits, and report sharing consent.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            onClick={() => {
              setIsRefreshing(true);
              refreshAppointments().finally(() => setIsRefreshing(false));
            }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: '12px',
              fontWeight: 700
            }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button
            onClick={() => navigate('/patient/doctors')}
            style={{
              backgroundColor: 'white',
              color: '#0f766e',
              borderRadius: '12px',
              fontWeight: 800
            }}
          >
            <Search size={16} />
            Find a Doctor
          </Button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', gap: '24px' }}>
        <button
          onClick={() => setActiveTab('Upcoming')}
          style={{
            padding: '12px 6px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'Upcoming' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'Upcoming' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.94rem',
            cursor: 'pointer'
          }}
        >
          Upcoming ({patientAppts.filter((a) => upcomingStatuses.includes(a.status)).length})
        </button>
        <button
          onClick={() => setActiveTab('Previous')}
          style={{
            padding: '12px 6px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'Previous' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'Previous' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.94rem',
            cursor: 'pointer'
          }}
        >
          Previous & Cancelled ({patientAppts.filter((a) => previousStatuses.includes(a.status)).length})
        </button>
      </div>

      {/* APPOINTMENTS LIST */}
      {filtered.length === 0 ? (
        <Card style={{ padding: '56px 24px', textAlign: 'center', borderRadius: '20px' }}>
          <Stethoscope size={42} style={{ color: 'var(--text-light)', margin: '0 auto 14px auto' }} />
          <h3 style={{ fontSize: '1.18rem', fontWeight: 800, margin: 0 }}>
            No {activeTab.toLowerCase()} appointments
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '8px auto 18px auto' }}>
            {activeTab === 'Upcoming'
              ? 'You have no upcoming doctor appointments. Search verified doctors to book an appointment.'
              : 'Your completed, rejected, and cancelled appointments will appear here.'}
          </p>
          <Button onClick={() => navigate('/patient/doctors')} style={{ borderRadius: '12px' }}>
            Find a Doctor
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.map((appt) => {
            const st = STATUS_STYLES[appt.status] || STATUS_STYLES.Pending;
            const canCancel = ['Pending', 'Confirmed', 'Upcoming'].includes(appt.status);

            return (
              <Card
                key={appt.id}
                style={{ borderRadius: '20px', padding: '22px', border: '1px solid var(--border)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '14px',
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '1.1rem'
                      }}
                    >
                      {appt.doctorName.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase() || 'D'}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0, color: 'var(--text-dark)' }}>
                        {appt.doctorName}
                      </h3>
                      <span style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 700 }}>
                        {appt.doctorSpecialty}
                        {appt.clinicName ? ` • ${appt.clinicName}` : ''}
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '5px 14px',
                      borderRadius: '14px',
                      backgroundColor: st.bg,
                      color: st.color,
                      border: `1px solid ${st.border}`
                    }}
                  >
                    ● {appt.status}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    backgroundColor: '#f8fafc',
                    padding: '14px 16px',
                    borderRadius: '14px',
                    border: '1px solid var(--border)',
                    marginTop: '16px',
                    fontSize: '0.85rem'
                  }}
                  className="grid-3-mobile"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={16} style={{ color: 'var(--primary)' }} />
                    <span>Date: <strong>{appt.date}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} style={{ color: 'var(--primary)' }} />
                    <span>Slot: <strong>{appt.time}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {appt.consultationType === 'Video' ? (
                      <Video size={16} style={{ color: 'var(--primary)' }} />
                    ) : (
                      <Building2 size={16} style={{ color: 'var(--primary)' }} />
                    )}
                    <span>Type: <strong>{appt.consultationType || 'In-Person'}</strong></span>
                  </div>
                </div>

                {(appt.reason || appt.notes) && (
                  <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <strong>Reason:</strong> {appt.reason || appt.notes}
                  </div>
                )}

                {appt.status === 'Rejected' && appt.rejectionReason && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.84rem', color: '#b91c1c' }}>
                    <strong>Doctor Note:</strong> {appt.rejectionReason}
                  </div>
                )}

                {appt.status === 'Completed' && appt.consultationSummary && (
                  <div style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.84rem', color: '#166534' }}>
                    <strong>Consultation Summary:</strong> {appt.consultationSummary}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <Button
                    variant="outline"
                    onClick={() => handleOpenDetails(appt)}
                    style={{ borderRadius: '10px', fontSize: '0.82rem' }}
                  >
                    <Eye size={14} />
                    View Details & Consent
                  </Button>

                  {canCancel && (
                    <Button
                      variant="danger"
                      isLoading={cancellingId === appt.id}
                      onClick={() => handleCancelClick(appt)}
                      style={{ borderRadius: '10px', fontSize: '0.82rem' }}
                    >
                      <XCircle size={14} />
                      Cancel Appointment
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* APPOINTMENT DETAILS & CONSENT MODAL */}
      <Modal
        isOpen={Boolean(selectedAppt)}
        onClose={() => setSelectedAppt(null)}
        title="Appointment Details"
      >
        {selectedAppt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-light)' }}>Doctor</span><br /><strong>{selectedAppt.doctorName}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Specialization</span><br /><strong>{selectedAppt.doctorSpecialty}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Date & Slot</span><br /><strong>{selectedAppt.date} • {selectedAppt.time}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Status</span><br /><strong>{selectedAppt.status}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Clinic</span><br /><strong>{selectedAppt.clinicName || 'Verified Clinic'}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Fee</span><br /><strong>₹{selectedAppt.consultationFee ?? 0}</strong></div>
            </div>

            {(selectedAppt.reason || selectedAppt.notes) && (
              <div style={{ fontSize: '0.86rem' }}>
                <strong>Consultation Reason:</strong>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{selectedAppt.reason || selectedAppt.notes}</p>
              </div>
            )}

            {/* Consent-Based Report Sharing Control */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', backgroundColor: '#f0fdfa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
                <strong style={{ fontSize: '0.88rem', color: '#0f766e' }}>Shared Medical Reports Consent</strong>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                Choose which medical reports {selectedAppt.doctorName} is authorized to view for this consultation:
              </p>

              {medicalReports.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                  No analyzed medical reports found in your Health Vault.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {medicalReports.map((rep) => {
                    const checked = consentIds.includes(rep.id);
                    return (
                      <label
                        key={rep.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          fontSize: '0.82rem',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setConsentIds((prev) =>
                              prev.includes(rep.id) ? prev.filter((x) => x !== rep.id) : [...prev, rep.id]
                            )
                          }
                        />
                        <FileText size={14} style={{ color: 'var(--primary)' }} />
                        <span style={{ flex: 1, fontWeight: 600 }}>{rep.analysis?.reportTitle || rep.fileName}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {medicalReports.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button size="sm" isLoading={isSavingConsent} onClick={handleSaveConsent} style={{ borderRadius: '10px' }}>
                    Save Sharing Consent
                  </Button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {['Pending', 'Confirmed', 'Upcoming'].includes(selectedAppt.status) && (
                <Button
                  variant="danger"
                  isLoading={cancellingId === selectedAppt.id}
                  onClick={() => handleCancelClick(selectedAppt)}
                >
                  Cancel Appointment
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelectedAppt(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
};
