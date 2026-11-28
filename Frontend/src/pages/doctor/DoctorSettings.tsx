import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useHealthData } from '../../context/HealthDataContext';
import { getOwnDoctorProfileApi, updateOwnDoctorProfileApi } from '../../services/doctorService';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import {
  Calendar, DollarSign, MapPin, ArrowLeft, Stethoscope,
  Building, ShieldCheck, Save, Camera, Trash2, Clock, Plus, RefreshCw
} from 'lucide-react';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PRESET_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '05:00 PM', '06:00 PM'
];

export const DoctorSettings: React.FC = () => {
  const { user, uploadProfilePhoto, removeProfilePhoto, refreshUser } = useAuth();
  const { refreshDoctors } = useHealthData();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [customSlotInput, setCustomSlotInput] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    specialization: 'General Physician',
    qualifications: 'MBBS',
    experienceYears: '0',
    nmcRegistrationNumber: '',
    stateMedicalCouncil: '',
    clinicName: '',
    clinicAddress: '',
    city: '',
    consultationFee: '500',
    consultationMode: 'Both' as 'In-Person' | 'Video' | 'Both',
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    availableSlots: ['09:00 AM', '10:00 AM', '10:30 AM', '11:30 AM', '02:00 PM', '03:30 PM', '05:00 PM'],
    availabilityText: '',
    languages: 'English',
    about: ''
  });

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      const res = await getOwnDoctorProfileApi();
      if (res.success && res.profile) {
        const p = res.profile;
        const cTypes: string[] = Array.isArray(p.consultationTypes) ? p.consultationTypes : ['In-Person', 'Video'];
        const mode: 'In-Person' | 'Video' | 'Both' =
          cTypes.includes('In-Person') && cTypes.includes('Video')
            ? 'Both'
            : (cTypes.includes('Video') ? 'Video' : 'In-Person');

        setVerificationStatus(p.doctorVerification?.status || p.verificationStatus || 'PENDING');
        setForm({
          name: p.name || user?.name || '',
          phone: p.phone || user?.phone || '',
          specialization: p.specialization || 'General Physician',
          qualifications: p.qualifications || 'MBBS',
          experienceYears: String(p.experienceYears ?? 0),
          nmcRegistrationNumber: p.nmcRegistrationNumber || '',
          stateMedicalCouncil: p.stateMedicalCouncil || '',
          clinicName: p.clinicName || '',
          clinicAddress: p.clinicAddress || '',
          city: p.city || '',
          consultationFee: String(p.consultationFee ?? 500),
          consultationMode: mode,
          availableDays: Array.isArray(p.availableDays) && p.availableDays.length > 0 ? p.availableDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          availableSlots: Array.isArray(p.availableSlots) && p.availableSlots.length > 0 ? p.availableSlots : ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '04:00 PM'],
          availabilityText: p.availabilityText || '',
          languages: Array.isArray(p.languages) ? p.languages.join(', ') : 'English',
          about: p.about || ''
        });
      }
      setIsLoading(false);
    };
    loadProfile();
  }, [user?.name, user?.phone]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIsUploadingPhoto(true);
    const res = await uploadProfilePhoto(file);
    setIsUploadingPhoto(false);
    if (res.success) {
      setToastMsg('Profile photo updated successfully.');
      refreshDoctors();
    } else {
      setErrorMsg(res.error || 'Failed to upload photo.');
    }
  };

  const handlePhotoRemove = async () => {
    setIsUploadingPhoto(true);
    const res = await removeProfilePhoto();
    setIsUploadingPhoto(false);
    if (res.success) {
      setToastMsg('Profile photo removed.');
      refreshDoctors();
    }
  };

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter((d) => d !== day)
        : [...prev.availableDays, day]
    }));
  };

  const toggleSlot = (slot: string) => {
    setForm((prev) => ({
      ...prev,
      availableSlots: prev.availableSlots.includes(slot)
        ? prev.availableSlots.filter((s) => s !== slot)
        : [...prev.availableSlots, slot]
    }));
  };

  const handleAddCustomSlot = () => {
    const clean = customSlotInput.trim().toUpperCase();
    if (!clean) return;
    if (!form.availableSlots.includes(clean)) {
      setForm((prev) => ({ ...prev, availableSlots: [...prev.availableSlots, clean] }));
    }
    setCustomSlotInput('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (form.availableSlots.length === 0) {
      setErrorMsg('Please select at least one available appointment time slot.');
      return;
    }

    setIsSaving(true);
    const consultationTypes: ('In-Person' | 'Video')[] =
      form.consultationMode === 'Both'
        ? ['In-Person', 'Video']
        : [form.consultationMode];

    const res = await updateOwnDoctorProfileApi({
      name: form.name.trim(),
      phone: form.phone.trim(),
      specialization: form.specialization,
      qualifications: form.qualifications.trim(),
      experienceYears: Number(form.experienceYears) || 0,
      nmcRegistrationNumber: form.nmcRegistrationNumber.trim(),
      stateMedicalCouncil: form.stateMedicalCouncil.trim(),
      clinicName: form.clinicName.trim(),
      clinicAddress: form.clinicAddress.trim(),
      city: form.city.trim(),
      consultationFee: Number(form.consultationFee) || 0,
      consultationTypes,
      availableDays: form.availableDays,
      availableSlots: form.availableSlots,
      availabilityText: form.availabilityText.trim() || `${form.availableDays.join(', ')}`,
      languages: form.languages.split(',').map((l) => l.trim()).filter(Boolean),
      about: form.about.trim()
    });

    setIsSaving(false);
    if (res.success) {
      await refreshUser();
      await refreshDoctors();
      setToastMsg('Doctor profile & availability updated successfully.');
    } else {
      setErrorMsg(res.error || 'Failed to save doctor profile.');
    }
  };

  const specialtyOptions = [
    'General Physician',
    'Cardiologist',
    'Dermatologist',
    'Pediatrician',
    'Endocrinologist',
    'Neurologist',
    'Orthopedic Surgeon',
    'Gynecologist',
    'ENT Specialist',
    'Psychiatrist'
  ].map((s) => ({ value: s, label: s }));

  if (isLoading) {
    return (
      <Card style={{ padding: '48px', textAlign: 'center', borderRadius: '20px' }}>
        <RefreshCw size={26} className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto 10px auto' }} />
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading doctor profile...</p>
      </Card>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #065f46 0%, #0f766e 60%, #0d9488 100%)',
          borderRadius: '20px',
          padding: '28px 32px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/doctor/dashboard')}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              padding: '10px',
              borderRadius: '50%',
              cursor: 'pointer',
              color: 'white',
              display: 'flex'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', margin: 0 }}>
              Doctor Profile & Availability Settings
            </h1>
            <p style={{ opacity: 0.92, fontSize: '0.86rem', marginTop: '4px', marginBottom: 0 }}>
              Manage your photo, qualifications, clinic details, consultation fees, and appointment slots.
            </p>
          </div>
        </div>

        <span
          style={{
            backgroundColor: verificationStatus === 'APPROVED' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)',
            border: '1px solid rgba(255,255,255,0.45)',
            padding: '6px 14px',
            borderRadius: '14px',
            fontSize: '0.78rem',
            fontWeight: 800
          }}
        >
          Verification Status: {verificationStatus}
        </span>
      </div>

      {errorMsg && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', color: '#b91c1c', fontSize: '0.86rem', fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* PROFILE PHOTO & IDENTITY */}
        <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Stethoscope size={20} style={{ color: 'var(--primary)' }} /><span>Profile Photo & Credentials</span></div>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <div style={{ width: '76px', height: '76px', borderRadius: '20px', overflow: 'hidden', border: '2px solid var(--border)', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.5rem', color: 'var(--primary)' }}>
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={form.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span>{form.name ? form.name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase() : 'D'}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                <Button type="button" variant="outline" isLoading={isUploadingPhoto} onClick={() => fileInputRef.current?.click()} style={{ borderRadius: '10px' }}>
                  <Camera size={15} />
                  {user?.avatarUrl ? 'Change Photo' : 'Upload Photo'}
                </Button>
                {user?.avatarUrl && (
                  <Button type="button" variant="danger" onClick={handlePhotoRemove} style={{ borderRadius: '10px' }}>
                    <Trash2 size={15} />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="grid-2-mobile">
              <Input label="Doctor Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Select label="Medical Specialization *" options={specialtyOptions} value={form.specialization} onChange={(val) => setForm({ ...form, specialization: val })} />
              <Input label="Qualifications *" placeholder="MBBS, MD" value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} required />
              <Input label="Experience (Years) *" type="number" min={0} value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} required />
              <Input label="NMC / Registration Number *" value={form.nmcRegistrationNumber} onChange={(e) => setForm({ ...form, nmcRegistrationNumber: e.target.value })} required />
              <Input label="State Medical Council" value={form.stateMedicalCouncil} onChange={(e) => setForm({ ...form, stateMedicalCouncil: e.target.value })} />
              <Input label="Contact Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="Languages Spoken" placeholder="English, Hindi" value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} />
            </div>

            <div>
              <label style={{ fontSize: '0.86rem', fontWeight: 700, display: 'block', marginBottom: '6px' }}>About / Professional Bio</label>
              <textarea
                rows={3}
                value={form.about}
                onChange={(e) => setForm({ ...form, about: e.target.value })}
                placeholder="Describe your clinical focus and patient care approach..."
                style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', fontFamily: 'inherit', fontSize: '0.88rem' }}
              />
            </div>
          </div>
        </Card>

        {/* CLINIC & FEE */}
        <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><DollarSign size={20} style={{ color: 'var(--primary)' }} /><span>Clinic Details & Consultation Fee</span></div>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }} className="grid-2-mobile">
              {(['In-Person', 'Video', 'Both'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setForm({ ...form, consultationMode: mode })}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    border: form.consultationMode === mode ? '2px solid var(--primary)' : '1px solid var(--border)',
                    backgroundColor: form.consultationMode === mode ? '#f0fdfa' : 'white',
                    color: form.consultationMode === mode ? '#0f766e' : 'var(--text-dark)',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {mode === 'Both' ? 'Both In-Person & Video' : mode}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="grid-2-mobile">
              <Input label="Consultation Fee (₹) *" type="number" min={0} value={form.consultationFee} onChange={(e) => setForm({ ...form, consultationFee: e.target.value })} required />
              <Input label="Clinic / Hospital Name" icon={<Building size={15} />} value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />
              <Input label="Clinic Address" icon={<MapPin size={15} />} value={form.clinicAddress} onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })} />
              <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
        </Card>

        {/* AVAILABILITY & TIME SLOTS */}
        <Card title={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={20} style={{ color: 'var(--primary)' }} /><span>Available Days & Appointment Time Slots</span></div>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ fontSize: '0.86rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Practice Days</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ALL_DAYS.map((day) => {
                  const active = form.availableDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: active ? '#f0fdfa' : 'white',
                        color: active ? '#0f766e' : 'var(--text-dark)',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.86rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Available Appointment Slots</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Array.from(new Set([...PRESET_SLOTS, ...form.availableSlots])).map((slot) => {
                  const active = form.availableSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleSlot(slot)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '10px',
                        border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: active ? 'var(--primary)' : 'white',
                        color: active ? 'white' : 'var(--text-dark)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', maxWidth: '320px' }}>
                <Input
                  placeholder="Add custom slot (e.g. 07:00 PM)"
                  value={customSlotInput}
                  onChange={(e) => setCustomSlotInput(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={handleAddCustomSlot} style={{ borderRadius: '10px' }}>
                  <Plus size={15} />
                  Add
                </Button>
              </div>
            </div>

            <Input
              label="Availability Summary Text"
              placeholder="e.g., Mon - Fri (9:00 AM - 5:00 PM)"
              value={form.availabilityText}
              onChange={(e) => setForm({ ...form, availabilityText: e.target.value })}
            />
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button type="button" variant="outline" onClick={() => navigate('/doctor/dashboard')}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} style={{ borderRadius: '12px', padding: '12px 28px', fontWeight: 800 }}>
            <Save size={16} />
            Save Profile & Schedule
          </Button>
        </div>
      </form>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
};
