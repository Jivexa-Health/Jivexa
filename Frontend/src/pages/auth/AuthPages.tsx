import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { BrandLogo } from '../../components/common/BrandLogo';
import { RoleIllustrationGraphic } from '../../components/common/RoleIllustrations';
import {
  Check, Lock, Mail, User, Stethoscope, Pill, Siren,
  CheckCircle2, AlertTriangle, Award, Building2, Phone, FileCheck
} from 'lucide-react';

// --- ROLE HIGHLIGHTS CONFIGURATION ---
const roleHighlights: Record<UserRole, {
  badge: string;
  title: string;
  desc: string;
  gradient: string;
  features: string[];
}> = {
  PATIENT: {
    badge: 'HEALTH VAULT',
    title: 'Your Complete Health Records & Digital Care.',
    desc: 'Easily manage your health records, lab reports, verified doctor appointments, and Digital Health ID in one secure place.',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0f766e 100%)',
    features: ['Instant Lab Report Analysis', 'Verified Doctor Booking', 'Secure Health ID Access']
  },
  DOCTOR: {
    badge: 'DOCTOR PORTAL',
    title: 'Streamlined Practice & Patient Appointment Management.',
    desc: 'Register your medical practice, manage consultation schedules, accept or review appointments, and view consented patient reports.',
    gradient: 'linear-gradient(135deg, #059669 0%, #065f46 100%)',
    features: ['Credential Verification Workflow', 'Appointment & Slot Management', 'Consent-Based Report Access']
  },
  AMBULANCE_PARTNER: {
    badge: 'COMING SOON (V4)',
    title: 'Emergency Dispatch Fleet.',
    desc: 'Ambulance partner onboarding is coming soon.',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
    features: ['Coming Soon (V4)']
  },
  PHARMACY: {
    badge: 'COMING SOON (V3)',
    title: 'Pharmacy Hub.',
    desc: 'Pharmacy onboarding is coming soon.',
    gradient: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
    features: ['Coming Soon (V3)']
  },
  ADMIN: {
    badge: 'ADMIN PORTAL',
    title: 'Administrative Security & System Control.',
    desc: 'Platform analytics, practitioner verification, and security compliance.',
    gradient: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
    features: ['System Verification', 'Practitioner Licensing', 'Platform Controls']
  }
};

// --- LEFT HERO ILLUSTRATION PANEL ---
const AuthHeroPanel: React.FC<{ activeRole: UserRole }> = ({ activeRole }) => {
  const graphic = roleHighlights[activeRole] || roleHighlights.PATIENT;

  return (
    <div
      style={{
        flex: '1.05',
        background: graphic.gradient,
        borderRadius: '28px',
        padding: '36px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: '24px',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 24px 48px -12px rgba(2, 132, 199, 0.35)',
        height: '100%',
        transition: 'background 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        boxSizing: 'border-box'
      }}
      className="sr-mobile-hide"
    >
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          right: '-10%',
          width: '360px',
          height: '360px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%)',
          filter: 'blur(45px)',
          pointerEvents: 'none'
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <BrandLogo size="sm" variant="light" />
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            backgroundColor: 'rgba(255, 255, 255, 0.18)',
            color: '#ffffff',
            padding: '6px 14px',
            borderRadius: '16px',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          {graphic.badge}
        </span>
      </div>

      <div style={{ position: 'relative', zIndex: 10, margin: '12px 0 8px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        <RoleIllustrationGraphic role={activeRole} />
      </div>

      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h2 style={{ fontSize: '1.55rem', fontWeight: 900, color: 'white', lineHeight: '1.25', letterSpacing: '-0.02em' }}>
          {graphic.title}
        </h2>
        <p style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: '1.55' }}>
          {graphic.desc}
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
          {graphic.features.map((feat) => (
            <span
              key={feat}
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Check size={12} style={{ color: '#38bdf8' }} />
              {feat}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- SELECTABLE ACCOUNT CATEGORY CARDS (FOR REGISTRATION PAGE) ---
const RoleSelectorCards: React.FC<{ activeRole: UserRole; onSelectRole: (role: UserRole) => void }> = ({
  activeRole,
  onSelectRole
}) => {
  const [notice, setNotice] = useState<string | null>(null);

  const roles = [
    {
      id: 'PATIENT' as UserRole,
      title: 'Patient',
      desc: 'Personal Health & Doctor Booking',
      icon: <User size={18} style={{ color: activeRole === 'PATIENT' ? '#0284c7' : 'var(--text-muted)' }} />,
      color: '#0284c7',
      active: true,
      soonLabel: ''
    },
    {
      id: 'DOCTOR' as UserRole,
      title: 'Doctor',
      desc: 'Clinical Practice & Appointments',
      icon: <Stethoscope size={18} style={{ color: activeRole === 'DOCTOR' ? '#10b981' : 'var(--text-muted)' }} />,
      color: '#10b981',
      active: true,
      soonLabel: ''
    },
    {
      id: 'PHARMACY' as UserRole,
      title: 'Pharmacy',
      desc: 'Coming Soon (V3)',
      icon: <Pill size={18} style={{ color: 'var(--text-muted)' }} />,
      color: '#f59e0b',
      active: false,
      soonLabel: 'COMING SOON'
    },
    {
      id: 'AMBULANCE_PARTNER' as UserRole,
      title: 'Ambulance',
      desc: 'Coming Soon (V4)',
      icon: <Siren size={18} style={{ color: 'var(--text-muted)' }} />,
      color: '#ef4444',
      active: false,
      soonLabel: 'COMING SOON'
    }
  ];

  const handleCardClick = (r: (typeof roles)[0]) => {
    if (!r.active) {
      setNotice(`${r.title} onboarding is ${r.desc}. Currently Patient and Doctor registrations are active.`);
      return;
    }
    setNotice(null);
    onSelectRole(r.id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
          Select Account Category:
        </label>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>
          Patient & Doctor Active
        </span>
      </div>

      {notice && (
        <div style={{ fontSize: '0.78rem', color: '#0369a1', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', padding: '6px 10px', borderRadius: '8px', fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div className="grid-2-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {roles.map((r) => {
          const isSelected = activeRole === r.id;
          const isRestricted = !r.active;
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(r);
                }
              }}
              style={{
                border: isSelected ? `2px solid ${r.color}` : '1.5px solid var(--border)',
                backgroundColor: isSelected ? 'var(--surface-raised)' : 'var(--surface)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                cursor: isRestricted ? 'not-allowed' : 'pointer',
                opacity: isRestricted ? 0.68 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isSelected ? '0 6px 18px -4px rgba(15, 118, 110, 0.2)' : 'none',
                position: 'relative'
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: isSelected ? 'var(--surface)' : 'var(--surface-raised)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {r.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.title}
                  </h4>
                  {isRestricted && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '1px 5px', borderRadius: '6px', backgroundColor: '#e2e8f0', color: '#64748b' }}>
                      {r.soonLabel}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: '1.2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 0 }}>
                  {r.desc}
                </p>
              </div>

              {isSelected && (
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                  <CheckCircle2 size={15} style={{ color: r.color }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SPECIALIZATIONS = [
  'General Physician',
  'Cardiologist',
  'Dermatologist',
  'Pediatrician',
  'Orthopedic Surgeon',
  'Neurologist',
  'Gynecologist',
  'Endocrinologist',
  'ENT Specialist',
  'Psychiatrist'
].map((s) => ({ value: s, label: s }));

// --- UNIFIED LOGIN VIEW (PATIENT & DOCTOR) ---
export const Login: React.FC = () => {
  const { isAuthenticated, role, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const routeForRole = (userRole: UserRole) => {
    const dashboardRoutes: Record<UserRole, string> = {
      PATIENT: '/patient/dashboard',
      DOCTOR: '/doctor/dashboard',
      PHARMACY: '/pharmacy/dashboard',
      ADMIN: '/admin/dashboard',
      AMBULANCE_PARTNER: '/ambulance/dashboard'
    };
    return dashboardRoutes[userRole] || '/patient/dashboard';
  };

  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(routeForRole(role), { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    let hasError = false;
    setEmailError('');
    setPasswordError('');
    setError('');

    if (!trimmedEmail) {
      setEmailError('Please enter your email address.');
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setEmailError('Please enter a valid email address (e.g. user@domain.com).');
        hasError = true;
      }
    }

    if (!trimmedPassword) {
      setPasswordError('Please enter your password.');
      hasError = true;
    } else if (trimmedPassword.length < 3) {
      setPasswordError('Password must be at least 3 characters long.');
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);

    try {
      const res = await login(trimmedEmail, trimmedPassword);
      if (res.success && res.role) {
        navigate(routeForRole(res.role), { replace: true });
      } else {
        const errMsg = res.error || 'Login failed. Please check your credentials.';
        if (errMsg.toLowerCase().includes('password')) {
          setPasswordError(errMsg);
        } else {
          setEmailError(errMsg);
        }
      }
    } catch (err) {
      setEmailError('An unexpected error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - var(--header-height) - 40px)',
        padding: '24px 20px',
        background: 'radial-gradient(circle at 50% 20%, rgba(2, 132, 199, 0.08) 0%, rgba(16, 185, 129, 0.04) 50%, transparent 80%)'
      }}
    >
      <div
        className="flex-col-mobile"
        style={{
          display: 'flex',
          maxWidth: '1040px',
          width: '100%',
          gap: '32px',
          alignItems: 'stretch'
        }}
      >
        <AuthHeroPanel activeRole="PATIENT" />

        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Card
            title={
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <div style={{ display: 'none' }} className="sr-mobile-block">
                  <BrandLogo size="md" />
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>
                  Sign In to JIVEXA Health
                </h2>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Enter your Patient or Doctor credentials to access your dashboard.
                </span>
              </div>
            }
            className="mobile-p-16"
            style={{ width: '100%', borderRadius: '24px', boxShadow: 'var(--shadow-xl)', padding: '32px' }}
          >
            {error && (
              <div
                style={{
                  backgroundColor: 'var(--error-light)',
                  border: '1px solid var(--error)',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  color: 'var(--error)',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}
              >
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <Input
                label="Email Address *"
                type="text"
                placeholder="name@domain.com"
                icon={<Mail size={16} />}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError('');
                  if (error) setError('');
                }}
                error={emailError}
                required
              />

              <Input
                label="Password *"
                type="password"
                placeholder="••••••••"
                icon={<Lock size={16} />}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError('');
                  if (error) setError('');
                }}
                error={passwordError}
                required
              />

              <div style={{ textAlign: 'right' }}>
                <Link to="/forgot-password" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}>
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" isLoading={isLoading} fullWidth style={{ height: '46px', fontSize: '0.98rem', fontWeight: 800 }}>
                Sign In
              </Button>

              <div style={{ textAlign: 'center', fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                Don't have an account?{' '}
                <Link to="/signup" style={{ fontWeight: 800, color: 'var(--primary)' }}>
                  Create Account
                </Link>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

// --- UNIFIED REGISTRATION VIEW (PATIENT & DOCTOR ACTIVE; AMBULANCE & PHARMACY COMING SOON) ---
export const Signup: React.FC = () => {
  const { signup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const getInitialRole = (): UserRole => {
    const params = new URLSearchParams(location.search);
    const roleParam = params.get('role')?.toUpperCase();
    if (roleParam === 'DOCTOR') return 'DOCTOR';
    return 'PATIENT';
  };

  const [role, setRole] = useState<UserRole>(getInitialRole);

  // Common Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Doctor Registration Fields
  const [qualification, setQualification] = useState('');
  const [specialization, setSpecialization] = useState('General Physician');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');

  // Field Level Error States
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setRole(getInitialRole());
  }, [location.search]);

  const handleRoleSwitch = (nextRole: UserRole) => {
    setRole(nextRole);
    setError('');
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmError('');
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    let hasError = false;
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmError('');
    setError('');

    if (!trimmedName) {
      setNameError('Please enter your full name.');
      hasError = true;
    } else if (trimmedName.length < 3) {
      setNameError('Full name must be at least 3 characters long.');
      hasError = true;
    }

    if (!trimmedEmail) {
      setEmailError('Please enter your email address.');
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setEmailError('Please enter a valid email address (e.g. user@domain.com).');
        hasError = true;
      }
    }

    if (role === 'DOCTOR') {
      if (!trimmedPhone) {
        setError('Please enter your phone number.');
        hasError = true;
      } else if (!qualification.trim()) {
        setError('Please enter your medical qualification (e.g. MBBS, MD).');
        hasError = true;
      } else if (!specialization.trim()) {
        setError('Please select your medical specialization.');
        hasError = true;
      } else if (!registrationNumber.trim()) {
        setError('Please enter your medical registration number.');
        hasError = true;
      } else if (!clinicName.trim() || !clinicAddress.trim()) {
        setError('Please enter your clinic/hospital name and address.');
        hasError = true;
      }
    }

    if (!trimmedPassword) {
      setPasswordError('Please choose a password.');
      hasError = true;
    } else if (trimmedPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      hasError = true;
    } else if (!/[A-Z]/.test(trimmedPassword)) {
      setPasswordError('Password must contain at least one uppercase letter (A-Z).');
      hasError = true;
    } else if (!/[a-z]/.test(trimmedPassword)) {
      setPasswordError('Password must contain at least one lowercase letter (a-z).');
      hasError = true;
    } else if (!/[0-9]/.test(trimmedPassword)) {
      setPasswordError('Password must contain at least one number (0-9).');
      hasError = true;
    } else if (!/[^A-Za-z0-9]/.test(trimmedPassword)) {
      setPasswordError('Password must contain at least one special symbol (@!#$ etc.).');
      hasError = true;
    }

    if (!trimmedConfirm) {
      setConfirmError('Please confirm your password.');
      hasError = true;
    } else if (trimmedPassword !== trimmedConfirm) {
      setConfirmError('Passwords do not match. Please re-enter your password.');
      hasError = true;
    }

    if (hasError) return;

    setIsLoading(true);

    try {
      const extraFields =
        role === 'DOCTOR'
          ? {
              phone: trimmedPhone,
              professionalDetails: {
                qualifications: qualification.trim(),
                specialization: specialization.trim(),
                nmcRegistrationNumber: registrationNumber.trim(),
                clinicName: clinicName.trim(),
                clinicAddress: clinicAddress.trim(),
                consultationTypes: ['In-Person', 'Video']
              }
            }
          : trimmedPhone
          ? { phone: trimmedPhone }
          : undefined;

      const res = await signup(trimmedEmail, trimmedName, role, trimmedPassword, extraFields);
      if (res.success) {
        const targetRoute = (res.role || role) === 'DOCTOR' ? '/doctor/dashboard' : '/patient/dashboard';
        navigate(targetRoute, { replace: true });
      } else {
        const errMsg = res.error || 'Registration failed.';
        if (errMsg.toLowerCase().includes('password')) {
          setPasswordError(errMsg);
        } else if (errMsg.toLowerCase().includes('name')) {
          setNameError(errMsg);
        } else if (errMsg.toLowerCase().includes('email') || errMsg.toLowerCase().includes('already exists')) {
          setEmailError(errMsg);
        } else {
          setError(errMsg);
        }
      }
    } catch (err) {
      setEmailError('An unexpected error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 'calc(100vh - var(--header-height) - 40px)',
        padding: '24px 20px',
        background: 'radial-gradient(circle at 50% 20%, rgba(2, 132, 199, 0.08) 0%, rgba(16, 185, 129, 0.04) 50%, transparent 80%)'
      }}
    >
      <div
        className="flex-col-mobile"
        style={{
          display: 'flex',
          maxWidth: '1080px',
          width: '100%',
          gap: '32px',
          alignItems: 'stretch'
        }}
      >
        <AuthHeroPanel activeRole={role} />

        <div style={{ flex: '1.15', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Card
            title={
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <div style={{ display: 'none' }} className="sr-mobile-block">
                  <BrandLogo size="md" />
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>
                  {role === 'DOCTOR' ? 'Create Doctor Account' : 'Create Patient Account'}
                </h2>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Select your account category below and enter your details to register.
                </span>
              </div>
            }
            className="mobile-p-16"
            style={{ width: '100%', borderRadius: '24px', boxShadow: 'var(--shadow-xl)', padding: '32px' }}
          >
            {error && (
              <div
                style={{
                  backgroundColor: 'var(--error-light)',
                  border: '1px solid var(--error)',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  color: 'var(--error)',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px'
                }}
              >
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            <RoleSelectorCards activeRole={role} onSelectRole={handleRoleSwitch} />

            <form onSubmit={handleSignupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Input
                label={role === 'DOCTOR' ? "Doctor's Full Name *" : 'Full Name *'}
                placeholder={role === 'DOCTOR' ? 'Dr. Full Name' : 'Your Full Name'}
                icon={<User size={16} />}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                  if (error) setError('');
                }}
                error={nameError}
                required
              />

              <div className={role === 'DOCTOR' ? 'grid-2-mobile' : undefined} style={role === 'DOCTOR' ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } : undefined}>
                <Input
                  label="Email Address *"
                  type="text"
                  placeholder="name@domain.com"
                  icon={<Mail size={16} />}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                    if (error) setError('');
                  }}
                  error={emailError}
                  required
                />

                {role === 'DOCTOR' && (
                  <Input
                    label="Phone Number *"
                    type="tel"
                    placeholder="+91 98765 43210"
                    icon={<Phone size={16} />}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />
                )}
              </div>

              {role === 'PATIENT' && (
                <Input
                  label="Phone Number (Optional)"
                  type="tel"
                  placeholder="+91 98765 43210"
                  icon={<Phone size={16} />}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              )}

              {role === 'DOCTOR' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="grid-2-mobile">
                    <Input
                      label="Medical Qualification *"
                      placeholder="e.g. MBBS, MD (Cardiology)"
                      icon={<Award size={16} />}
                      value={qualification}
                      onChange={(e) => {
                        setQualification(e.target.value);
                        if (error) setError('');
                      }}
                      required
                    />
                    <Select
                      label="Specialization *"
                      options={SPECIALIZATIONS}
                      value={specialization}
                      onChange={(val) => setSpecialization(val)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="grid-2-mobile">
                    <Input
                      label="Medical Registration Number *"
                      placeholder="e.g. MCI-123456"
                      icon={<FileCheck size={16} />}
                      value={registrationNumber}
                      onChange={(e) => {
                        setRegistrationNumber(e.target.value);
                        if (error) setError('');
                      }}
                      required
                    />
                    <Input
                      label="Clinic / Hospital Name *"
                      placeholder="e.g. City Care Clinic"
                      icon={<Building2 size={16} />}
                      value={clinicName}
                      onChange={(e) => {
                        setClinicName(e.target.value);
                        if (error) setError('');
                      }}
                      required
                    />
                  </div>

                  <Input
                    label="Clinic / Hospital Address & City *"
                    placeholder="Street, Area, City"
                    value={clinicAddress}
                    onChange={(e) => {
                      setClinicAddress(e.target.value);
                      if (error) setError('');
                    }}
                    required
                  />

                  <div style={{ fontSize: '0.78rem', color: '#0f766e', backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '10px', padding: '8px 12px' }}>
                    Doctor accounts are created with <strong>Pending Verification</strong> status and appear in Patient Find Doctor only after credential verification approval.
                  </div>
                </>
              )}

              <div className="grid-2-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input
                  label="Password *"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock size={16} />}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                    if (error) setError('');
                  }}
                  error={passwordError}
                  required
                />

                <Input
                  label="Confirm Password *"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock size={16} />}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (confirmError) setConfirmError('');
                    if (error) setError('');
                  }}
                  error={confirmError}
                  required
                />
              </div>

              <Button type="submit" isLoading={isLoading} fullWidth style={{ height: '48px', fontSize: '1rem', fontWeight: 800, marginTop: '6px' }}>
                {role === 'DOCTOR' ? 'Create Doctor Account' : 'Create Patient Account'}
              </Button>

              <div style={{ textAlign: 'center', fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Already have an account?{' '}
                <Link to="/login" style={{ fontWeight: 800, color: 'var(--primary)' }}>
                  Sign In
                </Link>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export const Verify: React.FC = () => {
  return <Signup />;
};

export const ForgotPassword: React.FC = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMsg('');
    const res = await resetPassword(email);
    setLoading(false);
    if (res.success) {
      setMsg('Password reset instructions have been sent to your email.');
    } else {
      setError(res.error || 'Password reset request failed.');
    }
  };

  return (
    <div style={{ maxWidth: '420px', margin: '40px auto', padding: '0 20px' }}>
      <Card title="Reset Account Password">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {msg && <div style={{ color: '#15803d', backgroundColor: '#dcfce7', padding: '10px 14px', borderRadius: '10px', fontSize: '0.86rem', fontWeight: 700 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--error)', backgroundColor: 'var(--error-light)', padding: '10px 14px', borderRadius: '10px', fontSize: '0.86rem', fontWeight: 600 }}>{error}</div>}
          <Input label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" isLoading={loading} style={{ borderRadius: '12px', fontWeight: 800 }}>Send Reset Link</Button>
        </form>
      </Card>
    </div>
  );
};
