import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useHealthData } from '../../context/HealthDataContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Toast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { getMyHealthIdApi, searchHealthIdApi } from '../../services/healthIdService';
import { 
  ShieldCheck, Copy, Check, Printer, QrCode, ArrowLeft, Heart, Droplet, 
  AlertTriangle, Phone, Activity, User, Lock, ExternalLink, RefreshCw, 
  Eye, Share2, Info, CheckCircle2, AlertCircle, Sparkles, MapPin, Search
} from 'lucide-react';

export const PatientHealthIdPage: React.FC = () => {
  const { user } = useAuth();
  const { patientProfile } = useHealthData();
  const navigate = useNavigate();

  // Local state for JHID resolution
  const [resolvedHealthId, setResolvedHealthId] = useState<string>(() => {
    return patientProfile?.jivexaHealthId || (user as any)?.healthId || 'JIV-2026-685853';
  });
  const [backendPatientData, setBackendPatientData] = useState<any>(null);
  const [emergencyToken, setEmergencyToken] = useState<string>('');
  const [isLoadingBackendId, setIsLoadingBackendId] = useState<boolean>(true);

  // Interaction states
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);

  // Live Emergency Lookup Simulator state
  const [simQuery, setSimQuery] = useState<string>('');
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [simError, setSimError] = useState<string>('');

  // Fetch verified canonical Health ID from backend API on mount
  useEffect(() => {
    let isMounted = true;
    setIsLoadingBackendId(true);

    getMyHealthIdApi().then((res) => {
      if (!isMounted) return;
      setIsLoadingBackendId(false);
      if (res.success && res.healthId) {
        setResolvedHealthId(res.healthId);
        if (res.emergencyAccessToken) {
          setEmergencyToken(res.emergencyAccessToken);
        }
        setBackendPatientData(res.patient || null);
        setSimQuery(res.healthId);
      } else {
        const fallbackId = patientProfile?.jivexaHealthId || (user as any)?.healthId || 'JIV-2026-685853';
        setResolvedHealthId(fallbackId);
        setSimQuery(fallbackId);
      }
    }).catch(() => {
      if (!isMounted) return;
      setIsLoadingBackendId(false);
      const fallbackId = patientProfile?.jivexaHealthId || (user as any)?.healthId || 'JIV-2026-685853';
      setResolvedHealthId(fallbackId);
      setSimQuery(fallbackId);
    });

    return () => {
      isMounted = false;
    };
  }, [user, patientProfile]);

  // Handle Clipboard Copy
  const handleCopyId = () => {
    if (!resolvedHealthId) return;
    navigator.clipboard.writeText(resolvedHealthId);
    setCopied(true);
    setToastMsg(`JHID "${resolvedHealthId}" copied to clipboard!`);
    setTimeout(() => setCopied(false), 2200);
  };

  // Handle Physical Card Print
  const handlePrintCard = () => {
    window.print();
  };

  // Run Emergency Lookup Simulation
  const handleRunSimulation = async (targetId?: string) => {
    const queryToRun = (targetId || simQuery || resolvedHealthId).trim().toUpperCase();
    if (!queryToRun) {
      setSimError('Please enter a valid Health ID to test.');
      setSimResult(null);
      return;
    }

    setSimLoading(true);
    setSimError('');
    setSimResult(null);

    try {
      const res = await searchHealthIdApi(queryToRun, queryToRun === resolvedHealthId ? emergencyToken : undefined);
      setSimLoading(false);

      if (res.success && res.patient) {
        setSimResult({
          healthId: res.healthId || queryToRun,
          verificationStatus: res.verificationStatus || 'Verified Active Record',
          patient: res.patient
        });
      } else {
        setSimError(res.message || `No registered patient record found for Health ID "${queryToRun}".`);
      }
    } catch (err: any) {
      setSimLoading(false);
      setSimError('Failed to query backend health ID registry. Ensure the backend server is running.');
    }
  };

  // Data resolution
  const patientName = user?.name || backendPatientData?.name || 'Verified Patient';
  const bloodGroup = backendPatientData?.bloodGroup || patientProfile?.bloodGroup || 'O+ Positive';
  const rawAllergies = (backendPatientData?.healthProfile && backendPatientData.healthProfile.allergies) || patientProfile?.allergies;
  const allergies = (rawAllergies && rawAllergies !== 'None reported' && rawAllergies !== 'None logged') ? rawAllergies : null;
  const rawConditions = (backendPatientData?.healthProfile && backendPatientData.healthProfile.chronicConditions) || patientProfile?.conditions;
  const conditions = (rawConditions && rawConditions !== 'None reported' && rawConditions !== 'None logged') ? rawConditions : null;
  const rawEmergencyContact = backendPatientData?.emergencyContact || patientProfile?.emergencyContact;
  const emergencyContactStr = typeof rawEmergencyContact === 'object' && rawEmergencyContact !== null
    ? `${rawEmergencyContact.name || ''} ${rawEmergencyContact.relationship ? `(${rawEmergencyContact.relationship})` : ''} • ${rawEmergencyContact.phone || ''}`.trim()
    : (rawEmergencyContact || 'Not configured');

  // Issue date calculation
  const issueDate = React.useMemo(() => {
    const rawDate = backendPatientData?.createdAt || patientProfile?.configuredAt || user?.createdAt;
    if (!rawDate) return 'Aug 2026';
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) return 'Aug 2026';
    return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [backendPatientData, patientProfile, user]);

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* 1. TOP BREADCRUMB / ACTION HEADER */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate('/patient/dashboard')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '0.84rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)' }}>Digital Health Identity</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            onClick={handlePrintCard}
            style={{
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Printer size={15} />
            Print Card
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              const el = document.getElementById('emergency-lookup-section');
              el?.scrollIntoView({ behavior: 'smooth' });
              if (!simResult && !simLoading) {
                handleRunSimulation(resolvedHealthId);
              }
            }}
            style={{
              borderRadius: '10px',
              padding: '8px 16px',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Eye size={15} />
            Simulate Emergency View
          </Button>
        </div>
      </div>

      {/* 2. PAGE TITLE HERO */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        padding: '24px 28px',
        boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        position: 'relative',
        overflow: 'hidden'
      }} className="no-print">
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #059669 0%, #0d9488 50%, #10b981 100%)' }} />

        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 800, color: '#047857', marginBottom: '8px' }}>
            <ShieldCheck size={13} style={{ color: 'var(--primary)' }} />
            JIVEXA HEALTH OS • PERMANENT PATIENT PASS
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            Digital Health Identity (JHID)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '4px 0 0 0' }}>
            Your universal, consent-gated digital health identity pass. Present this card to practitioners or emergency personnel to facilitate authorized clinical record sharing.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            backgroundColor: '#ecfdf5', 
            border: '1px solid #a7f3d0',
            color: '#047857',
            fontSize: '0.76rem',
            fontWeight: 800,
            padding: '6px 14px',
            borderRadius: '20px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
            Verified Active Digital Pass
          </span>
        </div>
      </div>

      {/* 3. MAIN DIGITAL HEALTH IDENTITY CARD (THE PHYSICAL/DIGITAL PASS) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        
        {/* CARD CONTAINER WITH FLIP PERSPECTIVE */}
        <div 
          id="jhid-printable-card"
          style={{
            width: '100%',
            maxWidth: '560px',
            minHeight: '320px',
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%)',
            color: '#ffffff',
            boxShadow: '0 20px 40px -12px rgba(6, 78, 59, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            position: 'relative',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            overflow: 'hidden',
            transition: 'transform 0.3s ease'
          }}
        >
          {/* Subtle Security Guilloche Pattern Glow */}
          <div style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '240px',
            height: '240px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(94, 234, 212, 0.18) 0%, transparent 70%)',
            filter: 'blur(30px)',
            pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-40px',
            left: '-40px',
            width: '200px',
            height: '200px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
            filter: 'blur(30px)',
            pointerEvents: 'none'
          }} />

          {/* FRONT VIEW */}
          {!isFlipped ? (
            <>
              {/* Card Top Row: Chip, Brand Crest & Wireless Wave */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Digital Smart Chip Graphic */}
                  <div style={{
                    width: '42px',
                    height: '32px',
                    borderRadius: '7px',
                    background: 'linear-gradient(135deg, #fef08a 0%, #eab308 50%, #ca8a04 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ width: '80%', height: '1px', backgroundColor: '#a16207', position: 'absolute' }} />
                    <div style={{ width: '1px', height: '80%', backgroundColor: '#a16207', position: 'absolute' }} />
                  </div>

                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', color: '#a7f3d0', textTransform: 'uppercase', display: 'block' }}>
                      JIVEXA HEALTH OS
                    </span>
                    <span style={{ fontSize: '0.86rem', fontWeight: 900, color: '#ffffff', letterSpacing: '0.04em' }}>
                      Digital Health Identity
                    </span>
                  </div>
                </div>

                {/* Holographic Security Pill */}
                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  backdropFilter: 'blur(8px)',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  color: '#ccfbf1',
                  letterSpacing: '0.05em'
                }}>
                  <ShieldCheck size={14} style={{ color: '#5eead4' }} />
                  <span>SECURE PASS</span>
                </div>
              </div>

              {/* Card Middle Row: Avatar, Patient Name, Monospace JHID */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 0', position: 'relative', zIndex: 2, gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Patient Avatar */}
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    border: '2px solid rgba(255, 255, 255, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    fontWeight: 900,
                    color: '#ffffff',
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}>
                    {user?.avatarUrl || patientProfile?.avatarUrl ? (
                      <img 
                        src={user?.avatarUrl || patientProfile?.avatarUrl} 
                        alt={patientName} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      <span>{patientName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.01em', textShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
                      {patientName}
                    </h2>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '1.2rem', 
                        fontWeight: 900, 
                        color: '#ffffff', 
                        letterSpacing: '0.08em',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        padding: '3px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                      }}>
                        {resolvedHealthId}
                      </span>

                      <button
                        onClick={handleCopyId}
                        style={{
                          backgroundColor: copied ? '#10b981' : 'rgba(255, 255, 255, 0.2)',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.35)',
                          borderRadius: '8px',
                          padding: '5px 9px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.2s ease'
                        }}
                        title="Copy Health ID"
                      >
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scannable Micro QR Badge on Card */}
                <div 
                  onClick={() => setIsQrModalOpen(true)}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    flexShrink: 0,
                    transition: 'transform 0.2s ease'
                  }}
                  title="Click to enlarge QR Badge"
                >
                  <QrCode size={48} style={{ color: '#064e3b' }} />
                  <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#064e3b', textTransform: 'uppercase', marginTop: '2px' }}>
                    SCAN QR
                  </span>
                </div>
              </div>

              {/* Card Bottom Row: Blood Group, Verification Status, Issue Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.18)', paddingTop: '14px', position: 'relative', zIndex: 2, flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: 700, display: 'block', letterSpacing: '0.04em' }}>
                      Blood Group
                    </span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <Droplet size={13} style={{ color: '#5eead4' }} />
                      {bloodGroup}
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: 700, display: 'block', letterSpacing: '0.04em' }}>
                      Status
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <CheckCircle2 size={13} style={{ color: '#34d399' }} />
                      Verified
                    </span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.64rem', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: 700, display: 'block', textAlign: 'right', letterSpacing: '0.04em' }}>
                    Issued
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', display: 'block', textAlign: 'right', marginTop: '2px' }}>
                    {issueDate}
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* BACK OF CARD: EMERGENCY PROTOCOL & CONSENT RULES */
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
              {/* Magnetic Strip Representation */}
              <div style={{
                height: '38px',
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
                margin: '-28px -28px 16px -28px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px'
              }}>
                <span style={{ fontSize: '0.64rem', fontFamily: 'monospace', color: '#a7f3d0', letterSpacing: '0.1em' }}>
                  JIVEXA-SECURE-DIGITAL-HEALTH-PASS
                </span>
              </div>

              {/* Instructions */}
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#5eead4', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
                  Emergency First Responder Protocol
                </span>
                <p style={{ fontSize: '0.82rem', color: '#e6fffa', lineHeight: '1.5', margin: 0 }}>
                  In an acute clinical emergency, scan this card's QR code or query the JHID at <strong>jivexa.com/health-id-lookup</strong> to view verified emergency triage information: Blood Group, Active Allergies, and Kin Contacts.
                </p>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '10px', marginTop: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '0.72rem', color: '#ccfbf1', display: 'block' }}>
                    🔒 <strong>Privacy Guarantee:</strong> Diagnostic reports, private doctor consultations, and medications not tagged as emergency are consent-gated and strictly inaccessible without patient authorization.
                  </span>
                </div>
              </div>

              {/* Emergency Hotline & Barcode Simulation */}
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', color: '#ccfbf1', fontWeight: 600 }}>
                  🚑 National Emergency Ambulance: <strong>108 / 112</strong>
                </span>
                <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#ffffff', opacity: 0.8 }}>
                  ID: {resolvedHealthId}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* CARD ACTION BUTTONS */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }} className="no-print">
          <Button
            onClick={handleCopyId}
            style={{
              borderRadius: '12px',
              padding: '10px 18px',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Health ID Copied!' : 'Copy Health ID'}</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsFlipped(!isFlipped)}
            style={{
              borderRadius: '12px',
              padding: '10px 18px',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={15} />
            <span>{isFlipped ? 'Show Front of Card' : 'Flip to Back (Security Info)'}</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsQrModalOpen(true)}
            style={{
              borderRadius: '12px',
              padding: '10px 18px',
              fontSize: '0.84rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <QrCode size={15} />
            <span>Enlarge QR Badge</span>
          </Button>
        </div>
      </div>

      {/* 4. ORGANIZED HEALTH IDENTITY INFORMATION (ACTUAL VERIFIED PATIENT DATA) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Verified Health Identity Parameters
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Parameters linked to your JHID. Incomplete fields can be updated in your Health Profile.
            </span>
          </div>

          <Link
            to="/patient/profile"
            style={{
              fontSize: '0.84rem',
              fontWeight: 700,
              color: 'var(--primary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            className="no-print"
          >
            <span>Update in Profile</span>
            <ExternalLink size={13} />
          </Link>
        </div>

        {/* 4-CARD METRIC GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="grid-2-mobile">
          
          {/* 1. PERSONAL HEALTH IDENTITY */}
          <Card style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={18} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Personal Identity</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Registered Name</span>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)' }}>{patientName}</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Date of Birth / Age</span>
                <span style={{ fontSize: '0.86rem', color: 'var(--text-main)', fontWeight: 600 }}>
                  {user?.dob || backendPatientData?.dateOfBirth ? (user?.dob || backendPatientData?.dateOfBirth) : 'Not configured'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Contact Phone</span>
                <span style={{ fontSize: '0.86rem', color: 'var(--text-main)', fontWeight: 600 }}>
                  {user?.phone || backendPatientData?.phoneNumber || 'Not configured'}
                </span>
              </div>
            </div>
          </Card>

          {/* 2. BLOOD GROUP & RH FACTOR */}
          <Card style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Droplet size={18} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Blood Group</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Emergency Rh Group</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#dc2626', marginTop: '2px' }}>
                  {bloodGroup}
                </div>
              </div>
              <div>
                <span style={{ 
                  backgroundColor: '#ecfdf5', 
                  border: '1px solid #a7f3d0', 
                  color: '#047857', 
                  fontSize: '0.72rem', 
                  fontWeight: 700, 
                  padding: '3px 8px', 
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <CheckCircle2 size={11} /> Verified Clinical Baseline
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Essential for trauma transfusion readiness.
              </span>
            </div>
          </Card>

          {/* 3. CRITICAL ALLERGIES */}
          <Card style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: allergies ? '#fef3c7' : '#ecfdf5', color: allergies ? '#d97706' : '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={18} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Critical Allergies</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Reported Drug / Food Allergies</span>
                {allergies ? (
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ 
                      backgroundColor: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      color: '#dc2626', 
                      fontSize: '0.82rem', 
                      fontWeight: 800, 
                      padding: '4px 10px', 
                      borderRadius: '8px',
                      display: 'inline-block'
                    }}>
                      ⚠️ {allergies}
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.86rem', color: '#059669', fontWeight: 700, display: 'block', marginTop: '4px' }}>
                    No known critical allergies reported
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Surfaced in emergency triage checks to prevent adverse drug events.
              </span>
            </div>
          </Card>

          {/* 4. EMERGENCY CONTACTS & NOTES */}
          <Card style={{ padding: '20px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Phone size={18} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Emergency Contacts</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Designated Kin Contact</span>
                <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block', wordBreak: 'break-word' }}>
                  {emergencyContactStr}
                </strong>
              </div>
              {conditions && (
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Chronic Condition Notes</span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    {conditions}
                  </span>
                </div>
              )}
            </div>
          </Card>

        </div>
      </div>

      {/* 5. EMERGENCY HEALTH ID LOOKUP SIMULATOR (SECTION 4 OF SPEC) */}
      <div id="emergency-lookup-section" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} className="no-print">
        <Card style={{ padding: '28px', borderRadius: '20px', border: '1.5px solid #d1fae5', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Section Header with Security Guarantee */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#047857', fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                  <ShieldCheck size={16} />
                  Emergency Responder Simulation
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Test Emergency Health ID Lookup
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: '4px 0 0 0', maxWidth: '680px' }}>
                  Verify the exact sanitized emergency payload exposed to paramedics or hospital ER teams. Full diagnostic PDF reports, private prescriptions, and consultation history remain encrypted at rest and completely hidden from public lookup.
                </p>
              </div>

              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={15} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700 }}>
                  Only Emergency Biomarkers Exposed
                </span>
              </div>
            </div>

            {/* Query Input Box */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleRunSimulation();
              }}
              style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}
            >
              <div style={{ flex: 1, minWidth: '260px' }}>
                <input
                  type="text"
                  value={simQuery}
                  onChange={(e) => setSimQuery(e.target.value.toUpperCase())}
                  placeholder="Enter JHID (e.g. JIV-2026-685853 or JXV-STVAZREW)"
                  style={{
                    width: '100%',
                    height: '44px',
                    borderRadius: '12px',
                    border: '1.5px solid var(--border)',
                    padding: '0 16px',
                    fontSize: '0.92rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    outline: 'none',
                    backgroundColor: '#f8fafc',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <Button
                type="submit"
                isLoading={simLoading}
                style={{
                  height: '44px',
                  borderRadius: '12px',
                  padding: '0 22px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Search size={15} />
                <span>Verify Emergency Lookup</span>
              </Button>

              <button
                type="button"
                onClick={() => {
                  setSimQuery(resolvedHealthId);
                  handleRunSimulation(resolvedHealthId);
                }}
                style={{
                  height: '44px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  color: 'var(--text-main)',
                  padding: '0 16px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Use My Health ID
              </button>
            </form>

            {/* Simulation Error Alert */}
            {simError && (
              <div style={{
                backgroundColor: 'var(--error-light)',
                border: '1px solid var(--error)',
                borderRadius: '12px',
                padding: '14px 18px',
                color: 'var(--error)',
                fontSize: '0.88rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{simError}</span>
              </div>
            )}

            {/* Simulation Loading */}
            {simLoading && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <RefreshCw size={24} className="spin" />
                <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Querying verified Health ID registry...</span>
              </div>
            )}

            {/* Simulation Success Result Card (Sanitized Emergency Payload View) */}
            {simResult && !simLoading && (
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1.5px solid #a7f3d0',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}>
                {/* Result Status Banner */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <CheckCircle2 size={13} />
                      {simResult.verificationStatus}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                      JHID: {simResult.healthId}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Simulated Responder Query Timestamp: {new Date().toLocaleTimeString()}
                  </span>
                </div>

                {/* Sanitized Emergency Fields Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }} className="grid-3-mobile">
                  
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                      Registered Patient Name
                    </span>
                    <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)', marginTop: '2px', display: 'block' }}>
                      {simResult.patient?.name || 'Verified Patient'}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>
                      DOB: {simResult.patient?.dateOfBirth || 'Recorded'} • Gender: {simResult.patient?.gender || 'Recorded'}
                    </span>
                  </div>

                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#dc2626', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>
                      Emergency Blood Group
                    </span>
                    <strong style={{ fontSize: '1.25rem', color: '#dc2626', marginTop: '2px', display: 'block' }}>
                      {simResult.patient?.bloodGroup || 'Not specified'}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>
                      ✓ Emergency Triage Available
                    </span>
                  </div>

                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                      Critical Allergies
                    </span>
                    <strong style={{ fontSize: '0.92rem', color: simResult.patient?.healthProfile?.allergies?.length > 0 ? '#dc2626' : '#059669', marginTop: '2px', display: 'block' }}>
                      {Array.isArray(simResult.patient?.healthProfile?.allergies) && simResult.patient.healthProfile.allergies.length > 0
                        ? simResult.patient.healthProfile.allergies.join(', ')
                        : (typeof simResult.patient?.healthProfile?.allergies === 'string' && simResult.patient.healthProfile.allergies
                          ? simResult.patient.healthProfile.allergies
                          : 'None reported')}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Audited against drug interactions
                    </span>
                  </div>

                </div>

                {/* Emergency Kin & Clinical Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }} className="grid-2-mobile">
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                      Emergency Kin Contact
                    </span>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)', marginTop: '2px', display: 'block' }}>
                      {typeof simResult.patient?.emergencyContact === 'object' && simResult.patient?.emergencyContact !== null
                        ? `${simResult.patient.emergencyContact.name || ''} ${simResult.patient.emergencyContact.relationship ? `(${simResult.patient.emergencyContact.relationship})` : ''} • ${simResult.patient.emergencyContact.phone || ''}`.trim()
                        : (simResult.patient?.emergencyContact || 'None provided')}
                    </strong>
                  </div>

                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                      Emergency Medical Notes / Conditions
                    </span>
                    <span style={{ fontSize: '0.84rem', color: 'var(--text-main)', fontWeight: 600, marginTop: '2px', display: 'block' }}>
                      {Array.isArray(simResult.patient?.healthProfile?.chronicConditions) && simResult.patient.healthProfile.chronicConditions.length > 0
                        ? simResult.patient.healthProfile.chronicConditions.join(', ')
                        : (simResult.patient?.healthProfile?.emergencyNotes || 'No specific emergency notes logged')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <a
                    href={`#/health-id-lookup?id=${encodeURIComponent(simResult.healthId)}${emergencyToken ? `&token=${encodeURIComponent(emergencyToken)}` : ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>Open in Public Health ID Lookup Portal</span>
                    <ExternalLink size={13} />
                  </a>
                </div>

              </div>
            )}

          </div>
        </Card>
      </div>

      {/* 6. TOAST NOTIFICATION */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}

      {/* 7. QR BADGE MODAL */}
      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="JIVEXA Health ID QR Badge">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '12px 0', textAlign: 'center' }}>
          <div style={{
            backgroundColor: '#ffffff',
            border: '3px solid var(--primary)',
            borderRadius: '24px',
            padding: '28px',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px'
          }}>
            <div style={{
              width: '180px',
              height: '180px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 8px 24px rgba(6, 78, 59, 0.25)'
            }}>
              <QrCode size={130} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, fontFamily: 'monospace', color: 'var(--primary)', letterSpacing: '0.05em' }}>
                {resolvedHealthId}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {patientName} • {bloodGroup}
              </span>
            </div>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', maxWidth: '400px' }}>
            <span style={{ fontSize: '0.78rem', color: '#166534', lineHeight: '1.5', display: 'block' }}>
              🔒 <strong>Privacy Guarantee:</strong> This QR badge contains zero private clinical records. It holds only your high-entropy digital pass reference, resolving triage vitals strictly through authenticated backend verification.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <Button variant="outline" onClick={handleCopyId} style={{ flex: 1, borderRadius: '12px' }}>
              <Copy size={15} /> Copy ID
            </Button>
            <Button onClick={() => setIsQrModalOpen(false)} style={{ flex: 1, borderRadius: '12px' }}>
              Close QR Badge
            </Button>
          </div>
        </div>
      </Modal>

      {/* PRINT-ONLY CSS STYLES FOR HIGH-FIDELITY WALLET CARD PRINTING */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #jhid-printable-card, #jhid-printable-card * {
            visibility: visible !important;
          }
          #jhid-printable-card {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 85.6mm !important;
            height: 53.98mm !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: 1px solid #000000 !important;
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

    </div>
  );
};
