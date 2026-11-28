import React, { useState, useEffect, useCallback } from 'react';
import { adminListDoctorsApi, adminVerifyDoctorApi } from '../../services/doctorService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import {
  Stethoscope, CheckCircle2, XCircle, Search, RefreshCw, Building2, ShieldCheck
} from 'lucide-react';

export const DoctorOnboardingAdmin: React.FC = () => {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    const res = await adminListDoctorsApi();
    if (res.success && res.doctors) {
      setDoctors(res.doctors);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const handleVerify = async (doctorId: string, status: 'APPROVED' | 'REJECTED') => {
    setActionId(doctorId);
    const res = await adminVerifyDoctorApi(doctorId, status, notesMap[doctorId] || '');
    setActionId(null);
    if (res.success) {
      setToastMsg(`Doctor verification updated to ${status}.`);
      loadDoctors();
    } else {
      setToastMsg(`Error: ${res.error || 'Failed to update doctor status.'}`);
    }
  };

  const filtered = doctors.filter((d) => {
    const vStatus = d.doctorVerification?.status || d.verificationStatus || 'PENDING';
    if (filterStatus !== 'ALL' && vStatus !== filterStatus) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(d.name || '').toLowerCase().includes(q) ||
      String(d.specialization || '').toLowerCase().includes(q) ||
      String(d.nmcRegistrationNumber || '').toLowerCase().includes(q) ||
      String(d.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <span style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase' }}>
            Practitioner Verification
          </span>
          <h1 style={{ fontWeight: 800, margin: '4px 0 0 0' }}>Doctor Verification Console</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px' }}>
            Review registered doctors and approve verified practitioners so they appear in Patient Find Doctor.
          </p>
        </div>
        <Button variant="outline" onClick={loadDoctors}>
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      <Card style={{ padding: '16px 20px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <Input
              placeholder="Search by doctor name, specialization, NMC number, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
              <Button
                key={st}
                size="sm"
                variant={filterStatus === st ? 'primary' : 'outline'}
                onClick={() => setFilterStatus(st)}
              >
                {st}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card style={{ padding: '40px', textAlign: 'center' }}>Loading registered doctors...</Card>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '48px', textAlign: 'center' }}>
          <Stethoscope size={36} style={{ color: 'var(--text-light)', margin: '0 auto 10px auto' }} />
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No doctor records match this filter.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filtered.map((doc) => {
            const vStatus = doc.doctorVerification?.status || doc.verificationStatus || 'PENDING';
            return (
              <Card key={doc.id} style={{ padding: '20px', borderRadius: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{doc.name}</h3>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '10px',
                          backgroundColor: vStatus === 'APPROVED' ? '#ecfdf5' : vStatus === 'REJECTED' ? '#fef2f2' : '#fffbeb',
                          color: vStatus === 'APPROVED' ? '#047857' : vStatus === 'REJECTED' ? '#b91c1c' : '#b45309'
                        }}
                      >
                        {vStatus}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                      {doc.specialization} • {doc.qualifications} • {doc.experienceYears} yrs exp
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                      NMC Reg: <strong>{doc.nmcRegistrationNumber || 'Not provided'}</strong> • Email: {doc.email}
                    </div>
                    {doc.clinicName && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        {doc.clinicName} {[doc.clinicAddress, doc.city].filter(Boolean).join(', ')} • Fee: ₹{doc.consultationFee}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Input
                      placeholder="Verification notes (optional)"
                      value={notesMap[doc.id] || ''}
                      onChange={(e) => setNotesMap({ ...notesMap, [doc.id]: e.target.value })}
                      style={{ width: '220px' }}
                    />
                    {vStatus !== 'APPROVED' && (
                      <Button
                        size="sm"
                        isLoading={actionId === doc.id}
                        onClick={() => handleVerify(doc.id, 'APPROVED')}
                      >
                        <CheckCircle2 size={14} />
                        Approve
                      </Button>
                    )}
                    {vStatus !== 'REJECTED' && (
                      <Button
                        size="sm"
                        variant="danger"
                        isLoading={actionId === doc.id}
                        onClick={() => handleVerify(doc.id, 'REJECTED')}
                      >
                        <XCircle size={14} />
                        Reject
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
};
