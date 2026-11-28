import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useHealthData, Appointment } from '../../context/HealthDataContext';
import {
  getDoctorDashboardApi,
  VerifiedDoctor
} from '../../services/doctorService';
import { getAppointmentByIdApi } from '../../services/clinicalService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import {
  Calendar, Clock, Settings, CheckCircle2, XCircle,
  AlertTriangle, FileText, RefreshCw, Eye, ShieldCheck,
  Video, Building2, Check, ClipboardCheck, Hourglass
} from 'lucide-react';

const STATUS_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  Pending: { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  Confirmed: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  Rejected: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  Cancelled: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  Completed: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
};

export const DoctorDashboard: React.FC = () => {
  const { user } = useAuth();
  const { updateAppointmentStatus, sharedReports } = useHealthData();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    upcoming: 0
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [doctorProfile, setDoctorProfile] = useState<VerifiedDoctor | null>(null);
  const [activeTab, setActiveTab] = useState<'Pending' | 'Confirmed' | 'History' | 'SharedReports'>('Pending');

  // Detail & Action Modals
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [detailSharedReports, setDetailSharedReports] = useState<any[]>([]);
  const [loadingDetailReports, setLoadingDetailReports] = useState(false);

  const [rejectAppt, setRejectAppt] = useState<Appointment | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [completeAppt, setCompleteAppt] = useState<Appointment | null>(null);
  const [completeSummary, setCompleteSummary] = useState('');

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getDoctorDashboardApi();
      if (res.success) {
        if (res.stats) setStats(res.stats);
        if (res.appointments) setAppointments(res.appointments);
        if (res.verificationStatus) setVerificationStatus(res.verificationStatus);
        if (res.doctorProfile) setDoctorProfile(res.doctorProfile);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleOpenDetails = async (appt: Appointment) => {
    setDetailAppt(appt);
    setDetailSharedReports([]);
    setLoadingDetailReports(true);
    try {
      const res = await getAppointmentByIdApi(appt.id);
      if (res.success && Array.isArray(res.sharedReports)) {
        setDetailSharedReports(res.sharedReports);
      }
    } finally {
      setLoadingDetailReports(false);
    }
  };

  const handleAccept = async (appt: Appointment) => {
    setActionLoadingId(appt.id);
    const res = await updateAppointmentStatus(appt.id, 'Confirmed');
    setActionLoadingId(null);
    if (res.success) {
      setToastMsg(`Confirmed appointment with ${appt.patientName}.`);
      loadDashboard();
    } else {
      setToastMsg(`Error: ${res.error || 'Could not confirm appointment.'}`);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectAppt) return;
    setActionLoadingId(rejectAppt.id);
    const res = await updateAppointmentStatus(rejectAppt.id, 'Rejected', {
      rejectionReason: rejectReason.trim()
    });
    setActionLoadingId(null);
    if (res.success) {
      setToastMsg(`Appointment with ${rejectAppt.patientName} rejected.`);
      setRejectAppt(null);
      setRejectReason('');
      loadDashboard();
    } else {
      setToastMsg(`Error: ${res.error || 'Could not reject appointment.'}`);
    }
  };

  const handleConfirmComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeAppt) return;
    setActionLoadingId(completeAppt.id);
    const res = await updateAppointmentStatus(completeAppt.id, 'Completed', {
      consultationSummary: completeSummary.trim()
    });
    setActionLoadingId(null);
    if (res.success) {
      setToastMsg(`Appointment with ${completeAppt.patientName} marked Completed.`);
      setCompleteAppt(null);
      setCompleteSummary('');
      loadDashboard();
    } else {
      setToastMsg(`Error: ${res.error || 'Could not complete appointment.'}`);
    }
  };

  const pendingList = appointments.filter((a) => a.status === 'Pending');
  const confirmedList = appointments.filter((a) => ['Confirmed', 'Upcoming', 'In Consultation'].includes(a.status));
  const historyList = appointments.filter((a) => ['Completed', 'Rejected', 'Cancelled'].includes(a.status));

  const displayedAppointments =
    activeTab === 'Pending' ? pendingList : activeTab === 'Confirmed' ? confirmedList : historyList;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER BANNER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #065f46 0%, #0f766e 60%, #0d9488 100%)',
          borderRadius: '20px',
          padding: '28px 32px',
          color: 'white',
          boxShadow: '0 10px 26px -8px rgba(6, 95, 70, 0.35)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              style={{ width: '64px', height: '64px', borderRadius: '18px', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' }}
            />
          ) : (
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: 900
              }}
            >
              {user?.name ? user.name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase() : 'D'}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', margin: 0 }}>
                {user?.name || 'Doctor Dashboard'}
              </h1>
              <span
                style={{
                  backgroundColor: verificationStatus === 'APPROVED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
                  border: '1px solid rgba(255,255,255,0.4)',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  color: 'white'
                }}
              >
                {verificationStatus === 'APPROVED' ? 'Verified Practitioner' : `Verification: ${verificationStatus}`}
              </span>
            </div>
            <p style={{ opacity: 0.92, fontSize: '0.86rem', marginTop: '4px', marginBottom: 0 }}>
              {doctorProfile?.specialization || user?.professionalDetails?.specialization || 'Medical Practitioner'}
              {doctorProfile?.clinicName ? ` • ${doctorProfile.clinicName}` : ''}
              {doctorProfile?.nmcRegistrationNumber ? ` • Reg: ${doctorProfile.nmcRegistrationNumber}` : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            onClick={loadDashboard}
            style={{
              backgroundColor: 'rgba(255,255,255,0.16)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: '12px',
              fontWeight: 700
            }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button
            onClick={() => navigate('/doctor/settings')}
            style={{
              backgroundColor: 'white',
              color: '#065f46',
              borderRadius: '12px',
              fontWeight: 800
            }}
          >
            <Settings size={16} />
            Manage Profile & Slots
          </Button>
        </div>
      </div>

      {/* VERIFICATION STATUS NOTICE */}
      {verificationStatus !== 'APPROVED' && (
        <div
          style={{
            backgroundColor: verificationStatus === 'REJECTED' ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${verificationStatus === 'REJECTED' ? '#fecaca' : '#fde68a'}`,
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={22} style={{ color: verificationStatus === 'REJECTED' ? '#dc2626' : '#d97706', flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.94rem', color: verificationStatus === 'REJECTED' ? '#991b1b' : '#92400e', display: 'block' }}>
                {verificationStatus === 'REJECTED'
                  ? 'Practitioner Verification Rejected'
                  : 'Practitioner Verification Pending Approval'}
              </strong>
              <span style={{ fontSize: '0.82rem', color: verificationStatus === 'REJECTED' ? '#b91c1c' : '#b45309' }}>
                Unverified doctor profiles do not appear in Patient Find Doctor until approved. Complete your profile and credentials in Doctor Profile Management.
              </span>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate('/doctor/settings')} style={{ borderRadius: '10px' }}>
            Update Profile & Credentials
          </Button>
        </div>
      )}

      {/* KPI SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }} className="grid-2-mobile">
        {[
          { label: 'Total Appointments', value: stats.total, icon: <Calendar size={18} />, bg: '#f0fdfa', color: '#0f766e' },
          { label: 'Pending', value: stats.pending, icon: <Hourglass size={18} />, bg: '#fffbeb', color: '#b45309' },
          { label: 'Confirmed', value: stats.confirmed, icon: <CheckCircle2 size={18} />, bg: '#ecfdf5', color: '#047857' },
          { label: 'Completed', value: stats.completed, icon: <ClipboardCheck size={18} />, bg: '#eff6ff', color: '#1d4ed8' },
          { label: 'Upcoming', value: stats.upcoming, icon: <Clock size={18} />, bg: '#f5f3ff', color: '#6d28d9' }
        ].map((kpi) => (
          <Card key={kpi.label} style={{ padding: '18px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {kpi.label}
              </span>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: kpi.bg, color: kpi.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {kpi.icon}
              </div>
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: 'var(--text-dark)' }}>
              {kpi.value}
            </div>
          </Card>
        ))}
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', gap: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'Pending', label: `Incoming Requests (${pendingList.length})` },
          { id: 'Confirmed', label: `Confirmed Appointments (${confirmedList.length})` },
          { id: 'History', label: `Appointment History (${historyList.length})` },
          { id: 'SharedReports', label: `Shared Reports (${sharedReports.length})` }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '12px 6px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid var(--primary)' : '3px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SHARED REPORTS TAB */}
      {activeTab === 'SharedReports' ? (
        <Card title="Patient Medical Reports Explicitly Shared With You" style={{ borderRadius: '20px' }}>
          {sharedReports.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FileText size={36} style={{ color: 'var(--text-light)', margin: '0 auto 10px auto' }} />
              <p style={{ margin: 0 }}>No medical reports have been shared with you yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sharedReports.map((sr) => (
                <div key={sr.id} style={{ border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: '0.96rem' }}>{sr.patientName} — {sr.reportTitle}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Shared: {sr.sharedAt || 'Recently'} • Review Status: {sr.reviewStatus}
                      </div>
                    </div>
                    {sr.healthScore ? (
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, padding: '4px 10px', borderRadius: '10px', backgroundColor: '#ecfdf5', color: '#047857' }}>
                        Score: {sr.healthScore}/100
                      </span>
                    ) : null}
                  </div>
                  {sr.analysisSummary && (
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '10px 0 0 0', backgroundColor: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      {sr.analysisSummary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        /* APPOINTMENTS LIST */
        <Card style={{ borderRadius: '20px', padding: '22px' }}>
          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading appointments...
            </div>
          ) : displayedAppointments.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Calendar size={38} style={{ color: 'var(--text-light)', margin: '0 auto 12px auto' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 6px 0' }}>
                No appointments in {activeTab}
              </h3>
              <p style={{ fontSize: '0.86rem', margin: 0 }}>
                Patient bookings assigned to your account will appear here automatically.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {displayedAppointments.map((appt) => {
                const st = STATUS_BADGE[appt.status] || STATUS_BADGE.Pending;
                return (
                  <div
                    key={appt.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      backgroundColor: 'white'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                          {appt.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>{appt.patientName}</h4>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '2px' }}>
                            <span><Calendar size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{appt.date}</span>
                            <span><Clock size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{appt.time}</span>
                            <span>
                              {appt.consultationType === 'Video' ? <Video size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> : <Building2 size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />}
                              {appt.consultationType || 'In-Person'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: st.bg,
                          color: st.color,
                          border: `1px solid ${st.border}`
                        }}
                      >
                        ● {appt.status}
                      </span>
                    </div>

                    {(appt.reason || appt.notes) && (
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '10px' }}>
                        <strong>Reason for Visit:</strong> {appt.reason || appt.notes}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <Button variant="outline" onClick={() => handleOpenDetails(appt)} style={{ borderRadius: '10px', fontSize: '0.82rem' }}>
                        <Eye size={14} />
                        View Details
                      </Button>

                      {appt.status === 'Pending' && (
                        <>
                          <Button
                            variant="danger"
                            onClick={() => {
                              setRejectAppt(appt);
                              setRejectReason('');
                            }}
                            disabled={actionLoadingId === appt.id}
                            style={{ borderRadius: '10px', fontSize: '0.82rem' }}
                          >
                            <XCircle size={14} />
                            Reject
                          </Button>
                          <Button
                            isLoading={actionLoadingId === appt.id}
                            onClick={() => handleAccept(appt)}
                            style={{ borderRadius: '10px', fontSize: '0.82rem' }}
                          >
                            <Check size={14} />
                            Accept Appointment
                          </Button>
                        </>
                      )}

                      {['Confirmed', 'Upcoming', 'In Consultation'].includes(appt.status) && (
                        <Button
                          onClick={() => {
                            setCompleteAppt(appt);
                            setCompleteSummary('');
                          }}
                          style={{ borderRadius: '10px', fontSize: '0.82rem' }}
                        >
                          <ClipboardCheck size={14} />
                          Mark Completed
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* PATIENT BOOKING DETAILS + CONSENTED REPORTS MODAL */}
      <Modal
        isOpen={Boolean(detailAppt)}
        onClose={() => setDetailAppt(null)}
        title="Appointment & Patient Details"
      >
        {detailAppt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <div><span style={{ color: 'var(--text-light)' }}>Patient</span><br /><strong>{detailAppt.patientName}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Status</span><br /><strong>{detailAppt.status}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Date & Slot</span><br /><strong>{detailAppt.date} • {detailAppt.time}</strong></div>
              <div><span style={{ color: 'var(--text-light)' }}>Consultation Type</span><br /><strong>{detailAppt.consultationType || 'In-Person'}</strong></div>
            </div>

            {(detailAppt.reason || detailAppt.notes) && (
              <div style={{ fontSize: '0.86rem' }}>
                <strong>Reason for Consultation:</strong>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{detailAppt.reason || detailAppt.notes}</p>
              </div>
            )}

            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', backgroundColor: '#f0fdfa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
                <strong style={{ fontSize: '0.88rem', color: '#0f766e' }}>
                  Reports Shared With Consent
                </strong>
              </div>
              {loadingDetailReports ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Checking consented reports...</p>
              ) : detailSharedReports.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  The patient has not shared any medical reports for this appointment.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {detailSharedReports.map((rep) => (
                    <div key={rep.id} style={{ backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', fontSize: '0.82rem' }}>
                      <strong>{rep.reportTitle || rep.fileName}</strong>
                      {rep.summary && <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>{rep.summary}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setDetailAppt(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* REJECT MODAL */}
      <Modal
        isOpen={Boolean(rejectAppt)}
        onClose={() => setRejectAppt(null)}
        title={`Reject Appointment: ${rejectAppt?.patientName || ''}`}
      >
        <form onSubmit={handleConfirmReject} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Reason for Rejection (Optional)"
            placeholder="e.g., Slot unavailable due to emergency surgery"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button type="button" variant="outline" onClick={() => setRejectAppt(null)}>Cancel</Button>
            <Button type="submit" variant="danger" isLoading={actionLoadingId === rejectAppt?.id}>
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>

      {/* COMPLETE APPOINTMENT MODAL */}
      <Modal
        isOpen={Boolean(completeAppt)}
        onClose={() => setCompleteAppt(null)}
        title={`Complete Appointment: ${completeAppt?.patientName || ''}`}
      >
        <form onSubmit={handleConfirmComplete} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Consultation Summary / Follow-up Note (Optional)"
            placeholder="e.g., Prescribed rest and hydration. Follow up in 7 days."
            value={completeSummary}
            onChange={(e) => setCompleteSummary(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button type="button" variant="outline" onClick={() => setCompleteAppt(null)}>Cancel</Button>
            <Button type="submit" isLoading={actionLoadingId === completeAppt?.id}>
              Mark as Completed
            </Button>
          </div>
        </form>
      </Modal>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
};
