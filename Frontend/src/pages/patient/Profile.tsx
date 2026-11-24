import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useHealthData } from '../../context/HealthDataContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Toast } from '../../components/ui/Toast';
import { 
  Shield, User, Heart, AlertCircle, Activity, 
  Phone, Mail, Calendar, Droplets, Stethoscope, 
  FileText, ShieldCheck, CheckCircle2, Award, Scale,
  Camera, Trash2, Loader2
} from 'lucide-react';

export const PatientProfileEdit: React.FC = () => {
  const { user, updateOnboarding, uploadProfilePhoto, removeProfilePhoto } = useAuth();
  const { patientProfile, updatePatientProfile } = useHealthData();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const currentAvatarUrl = photoPreview || user?.avatarUrl || patientProfile?.avatarUrl || '';
  
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    dob: user?.dob || '',
    gender: 'Male',
    height: '175',
    weight: '68',
    bloodGroup: patientProfile?.bloodGroup || 'O+ Positive',
    allergies: patientProfile?.allergies || 'Peanuts, Penicillin (mild)',
    conditions: patientProfile?.conditions || 'Mild Asthma',
    emergencyName: 'Ramesh Gangwar',
    emergencyRelation: 'Father',
    emergencyContact: patientProfile?.emergencyContact || '+91 98765 43210',
    insuranceProvider: 'Star Health Allied Insurance',
    policyNumber: 'SH-99482710-X',
    organDonor: 'Yes',
    primaryDoctor: 'Dr. Sarah Jenkins (Cardiology)'
  });

  const [toastMessage, setToastMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Image file size must be less than 5MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setError('');
    setIsUploadingPhoto(true);

    try {
      const res = await uploadProfilePhoto(file);
      if (res.success && res.avatarUrl) {
        setPhotoPreview(res.avatarUrl);
        updatePatientProfile({ avatarUrl: res.avatarUrl });
        setLastSavedAt(new Date().toISOString());
        setToastMessage('📸 Profile photo uploaded and saved successfully!');
      } else {
        setPhotoPreview(null);
        setError(res.error || 'Failed to upload profile photo.');
      }
    } catch (err: any) {
      setPhotoPreview(null);
      setError(err.message || 'Error uploading profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoRemove = async () => {
    if (!currentAvatarUrl) return;
    setIsUploadingPhoto(true);
    setError('');
    try {
      const res = await removeProfilePhoto();
      if (res.success) {
        setPhotoPreview(null);
        updatePatientProfile({ avatarUrl: '' });
        setLastSavedAt(new Date().toISOString());
        setToastMessage('🗑️ Profile photo removed.');
      } else {
        setError(res.error || 'Failed to remove profile photo.');
      }
    } catch (err: any) {
      setError(err.message || 'Error removing profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Auto-calculate BMI
  const heightM = (parseFloat(form.height) || 170) / 100;
  const weightKg = parseFloat(form.weight) || 70;
  const bmiVal = (weightKg / (heightM * heightM)).toFixed(1);
  const bmiNum = parseFloat(bmiVal);
  const bmiCategory = bmiNum < 18.5 ? 'Underweight' : bmiNum < 24.9 ? 'Healthy / Normal' : bmiNum < 29.9 ? 'Overweight' : 'Obese';
  const bmiBadgeColor = bmiNum >= 18.5 && bmiNum <= 24.9 ? '#10b981' : '#f59e0b';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.dob) {
      setError('Please fill in all required personal details.');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

      updatePatientProfile({
        bloodGroup: form.bloodGroup,
        allergies: form.allergies,
        conditions: form.conditions,
        emergencyContact: `${form.emergencyName} (${form.emergencyRelation}): ${form.emergencyContact}`
      });

      await updateOnboarding({
        name: form.name,
        phone: form.phone,
        dob: form.dob
      });

      setLastSavedAt(new Date().toISOString());
      setToastMessage('🎉 Profile updated successfully! All medical preferences saved.');
    } catch (e) {
      setError('Failed to save profile settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const bloodGroupOptions = [
    { value: 'A+ Positive', label: 'A+ Positive' },
    { value: 'A- Negative', label: 'A- Negative' },
    { value: 'B+ Positive', label: 'B+ Positive' },
    { value: 'B- Negative', label: 'B- Negative' },
    { value: 'AB+ Positive', label: 'AB+ Positive' },
    { value: 'AB- Negative', label: 'AB- Negative' },
    { value: 'O+ Positive', label: 'O+ Positive' },
    { value: 'O- Negative', label: 'O- Negative' }
  ];

  const genderOptions = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Other', label: 'Other / Prefer not to say' }
  ];

  const organDonorOptions = [
    { value: 'Yes', label: 'Registered Organ Donor' },
    { value: 'No', label: 'Not Registered' }
  ];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* CLINICAL PROFILE HERO BANNER */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        padding: '28px 32px',
        boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle accent bar on the top edge */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #059669 0%, #0d9488 50%, #10b981 100%)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Circular Avatar with Camera Overlay & Optional Remove */}
          <div style={{ position: 'relative', width: '76px', height: '76px', flexShrink: 0 }}>
            <div 
              onClick={() => !isUploadingPhoto && fileInputRef.current?.click()}
              style={{
                width: '76px',
                height: '76px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--primary-light)',
                border: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--font-size-2xl)',
                fontWeight: 900,
                color: 'var(--primary)',
                overflow: 'hidden',
                cursor: isUploadingPhoto ? 'wait' : 'pointer',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                position: 'relative'
              }}
              title="Click to change profile photo"
            >
              {currentAvatarUrl ? (
                <img 
                  src={currentAvatarUrl} 
                  alt={form.name || 'Profile'} 
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-full)'
                  }}
                  onError={() => {
                    setPhotoPreview(null);
                  }}
                />
              ) : (
                <span>{form.name ? form.name.charAt(0).toUpperCase() : 'P'}</span>
              )}

              {/* Uploading loading overlay */}
              {isUploadingPhoto && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(5, 150, 105, 0.75)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-full)',
                  color: 'white'
                }}>
                  <Loader2 size={24} className="animate-spin" />
                </div>
              )}
            </div>

            {/* Camera / Edit button badge */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isUploadingPhoto}
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: '2px solid #ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
                padding: 0
              }}
              title={currentAvatarUrl ? 'Change Photo' : 'Upload Photo'}
            >
              <Camera size={13} />
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                {form.name || 'Patient Profile'}
              </h1>
              <span style={{ 
                backgroundColor: '#ecfdf5', 
                border: '1px solid #a7f3d0',
                fontSize: '0.72rem', 
                fontWeight: 700, 
                padding: '3px 10px', 
                borderRadius: '20px', 
                color: '#047857' 
              }}>
                Verified Patient
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px', marginBottom: '8px' }}>
              JIVEXA Patient ID: JVX-889420 • Connected to Secure Health Ecosystem
            </p>
            {/* Quick action buttons for photo */}
            {currentAvatarUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Change Photo
                </button>
                <span style={{ color: '#cbd5e1', fontSize: '0.76rem' }}>•</span>
                <button
                  type="button"
                  onClick={handlePhotoRemove}
                  disabled={isUploadingPhoto}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--error)',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0
                  }}
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 18px', borderRadius: '14px', textAlign: 'center', minWidth: '95px' }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Blood Group</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>{form.bloodGroup.split(' ')[0]}</div>
          </div>

          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 18px', borderRadius: '14px', textAlign: 'center', minWidth: '95px' }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, display: 'block' }}>Calculated BMI</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>{bmiVal}</div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        
        {error && (
          <div style={{ backgroundColor: 'var(--error-light)', border: '1.5px solid var(--error)', padding: '14px 18px', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: 'var(--font-size-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. PERSONAL INFORMATION CARD */}
        <Card
          headingLevel="h2"
          style={{ borderRadius: 'var(--radius-xl)', padding: '28px' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
              <User size={22} />
              <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--text-dark)' }}>Personal Information</span>
            </span>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="grid-2-mobile">
            <Input 
              label="Full Name *" 
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input 
              label="Contact Phone *" 
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
            <Input 
              label="Date of Birth *" 
              type="date"
              value={form.dob}
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
              required
            />
            <Select
              label="Gender"
              options={genderOptions}
              value={form.gender}
              onChange={(val) => setForm({ ...form, gender: val })}
            />
            <Input 
              label="Primary Email" 
              type="email"
              value={user?.email || 'patient@jivexa.com'}
              disabled
              helperText="Email changes require security verification."
            />
            <Input 
              label="Preferred Clinic / Hospital"
              value={form.primaryDoctor}
              onChange={(e) => setForm({ ...form, primaryDoctor: e.target.value })}
            />
          </div>
        </Card>

        {/* 2. VITALS & BIOMETRICS CARD */}
        <Card
          headingLevel="h2"
          style={{ borderRadius: 'var(--radius-xl)', padding: '28px' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
              <Scale size={22} />
              <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--text-dark)' }}>Vitals & Biometrics</span>
            </span>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }} className="grid-2-mobile">
            <Input 
              label="Height (cm)" 
              type="number"
              value={form.height}
              onChange={(e) => setForm({ ...form, height: e.target.value })}
            />
            <Input 
              label="Weight (kg)" 
              type="number"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--text-dark)' }}>Body Mass Index (BMI)</label>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 900, color: 'var(--text-dark)' }}>{bmiVal}</span>
                <span style={{ backgroundColor: bmiBadgeColor, color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 800, padding: '3px 10px', borderRadius: 'var(--radius-md)' }}>
                  {bmiCategory}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* 3. HEALTH & CLINICAL INFORMATION CARD */}
        <Card
          headingLevel="h2"
          style={{ borderRadius: 'var(--radius-xl)', padding: '28px' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
              <Heart size={22} />
              <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--text-dark)' }}>Clinical Health Profile</span>
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="grid-2-mobile">
              <Select 
                label="Blood Group"
                options={bloodGroupOptions}
                value={form.bloodGroup}
                onChange={(val) => setForm({ ...form, bloodGroup: val })}
              />
              <Select 
                label="Organ Donor Status"
                options={organDonorOptions}
                value={form.organDonor}
                onChange={(val) => setForm({ ...form, organDonor: val })}
              />
            </div>
            
            <Input 
              label="Known Active Allergies" 
              placeholder="e.g. Peanuts, Penicillin, Dust (leave blank if none)" 
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
              helperText="Highlighted automatically during emergency consultations."
            />
            
            <Input 
              label="Chronic Medical Conditions" 
              placeholder="e.g. Mild Asthma, Hypertension, Type 2 Diabetes" 
              value={form.conditions}
              onChange={(e) => setForm({ ...form, conditions: e.target.value })}
              helperText="Assists doctors in selecting safer prescription dosages."
            />
          </div>
        </Card>

        {/* 4. EMERGENCY CONTACT & INSURANCE CARD */}
        <Card
          headingLevel="h2"
          style={{ borderRadius: 'var(--radius-xl)', padding: '28px' }}
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
              <Phone size={22} />
              <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--text-dark)' }}>Emergency Contacts & Health Insurance</span>
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }} className="grid-2-mobile">
              <Input 
                label="Emergency Contact Name" 
                placeholder="Full Name"
                value={form.emergencyName}
                onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
              />
              <Input 
                label="Relationship" 
                placeholder="Parent / Spouse / Sibling"
                value={form.emergencyRelation}
                onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })}
              />
              <Input 
                label="Emergency Phone" 
                placeholder="+91 Mobile Number"
                value={form.emergencyContact}
                onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="grid-2-mobile">
              <Input 
                label="Health Insurance Provider" 
                placeholder="Provider Name (e.g. Star Health)"
                value={form.insuranceProvider}
                onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })}
              />
              <Input 
                label="Policy / Member ID Number" 
                placeholder="Policy Reference Number"
                value={form.policyNumber}
                onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* ACTION BUTTONS */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '8px' }}>
          <Button type="button" variant="secondary" onClick={() => window.history.back()} style={{ borderRadius: 'var(--radius-md)', padding: '12px 24px', fontWeight: 700 }}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving} style={{ borderRadius: 'var(--radius-md)', padding: '12px 32px', fontWeight: 800 }}>
            Save Profile Updates
          </Button>
        </div>

      </form>

      {/* PRIVACY AND SECURITY FOOTER */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', backgroundColor: '#f0fdfa', padding: '18px 24px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(15, 118, 110, 0.2)' }}>
        <ShieldCheck size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-main)', lineHeight: '1.5' }}>
          <strong>JIVEXA Clinical Privacy Standard:</strong> Your personal medical records and emergency logs are encrypted in transit via TLS 1.3 and stored with database encryption at rest. Information is shared only with authorized healthcare practitioners during verified clinical consults.
        </span>
      </div>

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage('')} />
      )}

    </div>
  );
};
