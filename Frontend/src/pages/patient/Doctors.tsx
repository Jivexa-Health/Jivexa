import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchNearbyDoctorsApi,
  VerifiedDoctor
} from '../../services/doctorService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import {
  Search, MapPin, Clock, Building2, CheckCircle2,
  Stethoscope, RefreshCw, AlertCircle, Calendar, Navigation,
  Compass, Crosshair, ChevronRight
} from 'lucide-react';

interface LocationState {
  lat?: number;
  lng?: number;
  label: string;
  isGps: boolean;
  city?: string;
  pincode?: string;
}

const POPULAR_HUBS: { name: string; lat: number; lng: number; city: string }[] = [
  { name: 'Delhi NCR', lat: 28.6139, lng: 77.2090, city: 'Delhi' },
  { name: 'Bengaluru, KA', lat: 12.9716, lng: 77.5946, city: 'Bengaluru' },
  { name: 'Mumbai, MH', lat: 19.0760, lng: 72.8777, city: 'Mumbai' },
  { name: 'Hyderabad, TS', lat: 17.3850, lng: 78.4867, city: 'Hyderabad' },
  { name: 'Chennai, TN', lat: 13.0827, lng: 80.2707, city: 'Chennai' },
  { name: 'Pune, MH', lat: 18.5204, lng: 73.8567, city: 'Pune' },
  { name: 'Kolkata, WB', lat: 22.5726, lng: 88.3639, city: 'Kolkata' },
  { name: 'Gurugram, HR', lat: 28.4595, lng: 77.0266, city: 'Gurugram' }
];

const DEFAULT_SPECIALTIES = [
  'General Physician',
  'Cardiologist',
  'Cardiology',
  'Dermatologist',
  'Pediatrician',
  'Pediatrics',
  'Orthopedic Surgeon',
  'Neurologist',
  'Neurology',
  'Gynecologist',
  'Endocrinologist'
];

export const DoctorDiscovery: React.FC = () => {
  const navigate = useNavigate();

  const [doctors, setDoctors] = useState<VerifiedDoctor[]>([]);
  const [knownSpecialties, setKnownSpecialties] = useState<string[]>(DEFAULT_SPECIALTIES);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Location State
  const [location, setLocation] = useState<LocationState>({
    label: 'Detecting live GPS location...',
    isGps: true
  });
  const [gpsReady, setGpsReady] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(25);

  // Filters State
  const [search, setSearch] = useState('');
  const [specialization, setSpecialization] = useState('All');
  const [consultationType, setConsultationType] = useState('All');

  // Automatic GPS Location Detection
  const detectLiveGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setLocation({
        label: 'Location unavailable — Select city or PIN code',
        isGps: false
      });
      setGpsError('Browser geolocation is not supported. Use Change Location to search by city, locality, or PIN code.');
      setIsLocating(false);
      setGpsReady(true);
      return;
    }

    setIsLocating(true);
    setGpsError(null);
    setLocation((prev) => ({
      ...prev,
      label: 'Detecting live GPS location...',
      isGps: true
    }));

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let addr = `GPS: ${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
        let detectedCity = '';

        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
          );
          if (res.ok) {
            const data = await res.json();
            const locality = data.locality || '';
            const city = data.city || data.principalSubdivision || '';
            const state = data.principalSubdivision || '';
            detectedCity = city || locality;

            const parts = Array.from(new Set([locality, city, state].filter(Boolean)));
            if (parts.length > 0) {
              addr = parts.join(', ');
            }
          }
        } catch {
          // Keep GPS coordinate string fallback
        }

        setLocation({
          lat,
          lng,
          label: addr,
          isGps: true,
          city: detectedCity
        });
        setGpsError(null);
        setIsLocating(false);
        setGpsReady(true);
      },
      (err) => {
        console.warn('[Geolocation Error]:', err.message);
        setLocation({
          label: 'GPS permission denied or unavailable',
          isGps: false
        });
        setGpsError('Location permission denied or GPS unavailable. Showing all verified doctors — use Change Location to search by city or PIN code.');
        setIsLocating(false);
        setGpsReady(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, []);

  // Request location on initial mount
  useEffect(() => {
    detectLiveGPS();
  }, [detectLiveGPS]);

  // Load nearby or filtered approved doctors using GET /api/doctors/nearby
  const loadDoctors = useCallback(async () => {
    if (!gpsReady) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const hasCoords = location.lat !== undefined && location.lng !== undefined;
      const res = await fetchNearbyDoctorsApi(
        hasCoords
          ? {
              latitude: location.lat,
              longitude: location.lng,
              radius: radiusKm,
              specialization,
              search
            }
          : {
              specialization,
              search,
              city: location.city,
              pincode: location.pincode
            }
      );

      if (res.success) {
        const activeApproved = (res.doctors || []).filter(
          (doc) => doc.isVerified && doc.verificationStatus === 'APPROVED'
        );
        setDoctors(activeApproved);
        const fetchedSpecs = activeApproved.map((d) => d.specialization).filter(Boolean);
        if (fetchedSpecs.length > 0) {
          setKnownSpecialties((prev) => Array.from(new Set([...prev, ...fetchedSpecs])));
        }
      } else {
        setErrorMsg(res.error || 'Unable to retrieve nearby doctors.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to connect to healthcare server.');
    } finally {
      setIsLoading(false);
    }
  }, [gpsReady, location, radiusKm, specialization, search]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const filteredDoctors = doctors.filter((doc) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      doc.name.toLowerCase().includes(q) ||
      doc.specialization.toLowerCase().includes(q) ||
      doc.qualifications.toLowerCase().includes(q) ||
      doc.clinicName.toLowerCase().includes(q) ||
      doc.clinicAddress.toLowerCase().includes(q) ||
      doc.city.toLowerCase().includes(q) ||
      (doc.pincode && doc.pincode.toLowerCase().includes(q));

    const matchesSpec =
      specialization === 'All' ||
      doc.specialization.toLowerCase() === specialization.toLowerCase();

    const matchesType =
      consultationType === 'All' ||
      doc.consultationTypes.some((t) => t.toLowerCase() === consultationType.toLowerCase());

    return matchesSearch && matchesSpec && matchesType;
  });

  // Handle manual city, locality or PIN code search
  const handleManualLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = manualQuery.trim();
    if (!q) return;

    const isPincode = /^\d{5,6}$/.test(q);

    // Check if query matches a known hub
    const matchedHub = !isPincode
      ? POPULAR_HUBS.find(
          (h) =>
            h.name.toLowerCase().includes(q.toLowerCase()) ||
            h.city.toLowerCase().includes(q.toLowerCase())
        )
      : undefined;

    if (matchedHub) {
      setLocation({
        lat: matchedHub.lat,
        lng: matchedHub.lng,
        label: matchedHub.name,
        isGps: false,
        city: matchedHub.city
      });
    } else if (isPincode) {
      setLocation({
        label: `PIN Code: ${q}`,
        isGps: false,
        pincode: q
      });
    } else {
      setLocation({
        label: q,
        isGps: false,
        city: q
      });
    }

    setGpsError(null);
    setGpsReady(true);
    setIsLocationModalOpen(false);
  };

  const handleSelectHub = (hub: (typeof POPULAR_HUBS)[0]) => {
    setLocation({
      lat: hub.lat,
      lng: hub.lng,
      label: hub.name,
      isGps: false,
      city: hub.city
    });
    setGpsError(null);
    setGpsReady(true);
    setIsLocationModalOpen(false);
  };

  const handleResetToGps = () => {
    setManualQuery('');
    setIsLocationModalOpen(false);
    detectLiveGPS();
  };

  const handleExpandRadius = () => {
    if (radiusKm < 25) {
      setRadiusKm(25);
    } else if (radiusKm < 50) {
      setRadiusKm(50);
    } else {
      setRadiusKm(100);
    }
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* HEADER BANNER */}
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
            <Stethoscope size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', margin: 0 }}>
                Find My Doctor
              </h1>
              <span
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.22)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  color: 'white'
                }}
              >
                GPS Location-Aware Discovery
              </span>
            </div>
            <p style={{ opacity: 0.92, fontSize: '0.88rem', marginTop: '4px', marginBottom: 0 }}>
              Discover approved medical practitioners near your location, check distances, and book verified consultation slots.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate('/patient/appointments')}
          style={{
            backgroundColor: 'white',
            color: '#0f766e',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 18px',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Calendar size={16} />
          My Appointments
        </Button>
      </div>

      {/* LOCATION SELECTOR & GPS CONTROL BAR */}
      <Card style={{ borderRadius: '18px', padding: '16px 20px', border: '1px solid #99f6e4', backgroundColor: 'var(--secondary-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: gpsError ? '#fef3c7' : '#ccfbf1',
                color: gpsError ? '#b45309' : '#0f766e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {isLocating ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : gpsError ? (
                <AlertCircle size={18} />
              ) : location.isGps ? (
                <Navigation size={18} />
              ) : (
                <Compass size={18} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#0f766e', letterSpacing: '0.04em' }}>
                  {isLocating
                    ? 'Locating via GPS...'
                    : location.isGps
                      ? 'Current GPS Location'
                      : 'Selected Location'}
                </span>
                {location.isGps && !isLocating && !gpsError && (
                  <span style={{ fontSize: '0.64rem', fontWeight: 800, backgroundColor: '#0f766e', color: 'white', padding: '1px 7px', borderRadius: '6px' }}>
                    LIVE GPS
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isLocating ? 'Requesting browser GPS coordinates...' : location.label}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Radius Filter Pills (When coordinates are present) */}
            {location.lat !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--surface)', padding: '4px', borderRadius: '12px', border: '1px solid #99f6e4' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0f766e', padding: '0 6px' }}>Radius:</span>
                {[10, 25, 50].map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={radiusKm === r}
                    onClick={() => setRadiusKm(r)}
                    style={{
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 11px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      backgroundColor: radiusKm === r ? '#0f766e' : 'transparent',
                      color: radiusKm === r ? 'white' : '#0f766e',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsLocationModalOpen(true)}
              style={{
                borderRadius: '10px',
                height: '36px',
                padding: '0 14px',
                fontWeight: 700,
                fontSize: '0.82rem',
                backgroundColor: 'var(--surface)',
                borderColor: '#99f6e4',
                color: '#0f766e',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <MapPin size={14} />
              Change Location
            </Button>

            {(!location.isGps || gpsError) && (
              <Button
                size="sm"
                onClick={handleResetToGps}
                isLoading={isLocating}
                style={{
                  borderRadius: '10px',
                  height: '36px',
                  padding: '0 14px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Crosshair size={14} />
                Use Current GPS
              </Button>
            )}
          </div>
        </div>

        {gpsError && (
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{gpsError}</span>
            </div>
          </div>
        )}
      </Card>

      {/* SEARCH & SPECIALIZATION FILTERS */}
      <Card style={{ borderRadius: '18px', padding: '18px 22px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '14px' }} className="grid-3-mobile">
          <Input
            placeholder="Search by doctor name, clinic, city, or PIN code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search size={16} style={{ color: 'var(--text-light)' }} />}
            style={{ height: '42px', borderRadius: '12px' }}
          />
          <Select
            options={[
              { value: 'All', label: 'All Specializations' },
              ...knownSpecialties.map((s) => ({ value: s, label: s }))
            ]}
            value={specialization}
            onChange={(val) => setSpecialization(val)}
            style={{ height: '42px', borderRadius: '12px' }}
          />
          <Select
            options={[
              { value: 'All', label: 'All Consultation Types' },
              { value: 'In-Person', label: 'In-Person Clinic Visit' },
              { value: 'Video', label: 'Video Consultation' }
            ]}
            value={consultationType}
            onChange={(val) => setConsultationType(val)}
            style={{ height: '42px', borderRadius: '12px' }}
          />
        </div>
      </Card>

      {/* LOADING STATE */}
      {(isLoading || isLocating) && (
        <Card style={{ padding: '48px 24px', textAlign: 'center', borderRadius: '20px' }}>
          <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto 12px auto' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', fontWeight: 600, margin: 0 }}>
            {isLocating
              ? 'Detecting your live GPS location...'
              : `Scanning verified doctors near ${location.label}...`}
          </p>
        </Card>
      )}

      {/* ERROR STATE */}
      {!isLoading && !isLocating && errorMsg && (
        <Card style={{ padding: '32px 24px', textAlign: 'center', borderRadius: '20px', border: '1px solid #fecaca', backgroundColor: '#fef2f2' }}>
          <AlertCircle size={32} style={{ color: '#dc2626', margin: '0 auto 10px auto' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#991b1b', margin: '0 0 6px 0' }}>
            Unable to load nearby doctors
          </h3>
          <p style={{ fontSize: '0.86rem', color: '#b91c1c', margin: '0 0 16px 0' }}>{errorMsg}</p>
          <Button onClick={loadDoctors} style={{ borderRadius: '12px' }}>
            Try Again
          </Button>
        </Card>
      )}

      {/* EMPTY STATE */}
      {!isLoading && !isLocating && !errorMsg && filteredDoctors.length === 0 && (
        <Card style={{ padding: '56px 24px', textAlign: 'center', borderRadius: '20px' }}>
          <Stethoscope size={42} style={{ color: 'var(--text-light)', margin: '0 auto 14px auto' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
            No verified doctors found near this location.
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '8px auto 18px auto' }}>
            {doctors.length === 0
              ? location.lat !== undefined
                ? `No approved and active doctors were found within ${radiusKm} km of ${location.label}.`
                : `No approved and active doctors matched ${location.label}.`
              : 'No doctors match your active search or specialization filters.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {location.lat !== undefined && radiusKm < 100 && (
              <Button onClick={handleExpandRadius} style={{ borderRadius: '10px' }}>
                Expand Search Radius
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsLocationModalOpen(true)} style={{ borderRadius: '10px' }}>
              Change Location
            </Button>
            {doctors.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setSpecialization('All');
                  setConsultationType('All');
                }}
                style={{ borderRadius: '10px' }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* DOCTORS CARDS GRID */}
      {!isLoading && !isLocating && !errorMsg && filteredDoctors.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredDoctors.map((doc) => (
            <Card
              key={doc.id}
              style={{
                borderRadius: '20px',
                border: '1px solid var(--border)',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div>
                {/* Header */}
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {doc.avatarUrl ? (
                      <img
                        src={doc.avatarUrl}
                        alt={doc.name}
                        style={{
                          width: '62px',
                          height: '62px',
                          borderRadius: '16px',
                          objectFit: 'cover',
                          border: '2px solid var(--border)'
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '62px',
                          height: '62px',
                          borderRadius: '16px',
                          background: 'linear-gradient(135deg, #0f766e 0%, #10b981 100%)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.2rem'
                        }}
                      >
                        {doc.name.replace(/^Dr\.?\s*/i, '').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'DR'}
                      </div>
                    )}
                    <div
                      title="Verified & Approved Doctor"
                      style={{
                        position: 'absolute',
                        bottom: '-4px',
                        right: '-4px',
                        backgroundColor: '#10b981',
                        color: 'white',
                        borderRadius: '50%',
                        padding: '3px',
                        border: '2px solid white'
                      }}
                    >
                      <CheckCircle2 size={13} />
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                        {doc.name}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            backgroundColor: '#ecfdf5',
                            color: '#047857',
                            border: '1px solid #a7f3d0',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <CheckCircle2 size={10} />
                          Verified
                        </span>
                        {doc.distanceText && (
                          <span
                            style={{
                              backgroundColor: doc.distanceKm !== null && doc.distanceKm !== undefined && doc.distanceKm <= 5 ? '#ecfdf5' : '#eff6ff',
                              color: doc.distanceKm !== null && doc.distanceKm !== undefined && doc.distanceKm <= 5 ? '#047857' : '#1d4ed8',
                              border: `1px solid ${doc.distanceKm !== null && doc.distanceKm !== undefined && doc.distanceKm <= 5 ? '#a7f3d0' : '#bfdbfe'}`,
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              whiteSpace: 'nowrap',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                          >
                            <Navigation size={10} />
                            {doc.distanceText}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
                      {doc.specialization} • {doc.experienceYears} yrs exp
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '3px' }}>
                      {doc.qualifications}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {(doc.clinicName || doc.clinicAddress || doc.city) && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <Building2 size={15} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '2px' }} />
                      <span>
                        <strong style={{ color: 'var(--text-main)' }}>{doc.clinicName || 'Clinic'}</strong>
                        {([doc.clinicAddress, doc.city, doc.state, doc.pincode].filter(Boolean).length > 0)
                          ? ` — ${[doc.clinicAddress, doc.city, doc.state, doc.pincode].filter(Boolean).join(', ')}`
                          : ''}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={15} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                    <span>
                      Consultation: <strong style={{ color: 'var(--text-main)' }}>{doc.consultationTypes.join(' & ')}</strong>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={15} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                    <span>{doc.availabilityText || `Available: ${doc.availableDays.join(', ')}`}</span>
                  </div>

                  {doc.availableSlots && doc.availableSlots.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {doc.availableSlots.slice(0, 4).map((slot) => (
                        <span
                          key={slot}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--secondary-light)',
                            color: 'var(--secondary)',
                            border: '1px solid #99f6e4'
                          }}
                        >
                          {slot}
                        </span>
                      ))}
                      {doc.availableSlots.length > 4 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontWeight: 600, padding: '3px 4px' }}>
                          +{doc.availableSlots.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Consultation Fee
                  </span>
                  <span style={{ fontSize: '1.18rem', fontWeight: 900, color: 'var(--text-main)' }}>
                    ₹{doc.consultationFee}
                  </span>
                </div>

                <Button
                  onClick={() => navigate(`/patient/doctors/${doc.id}`)}
                  style={{
                    borderRadius: '12px',
                    padding: '10px 18px',
                    fontWeight: 800,
                    fontSize: '0.86rem'
                  }}
                >
                  Book Appointment
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* CHANGE LOCATION MODAL */}
      <Modal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} title="Change Consultation Location">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '8px 0' }}>
          <form onSubmit={handleManualLocationSubmit} style={{ display: 'flex', gap: '10px' }}>
            <Input
              placeholder="Search by city, locality or PIN code (e.g. Bengaluru, 560001)..."
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              icon={<Search size={16} />}
              style={{ flex: 1, borderRadius: '12px' }}
            />
            <Button type="submit" style={{ borderRadius: '12px', padding: '0 20px', fontWeight: 800 }}>
              Search
            </Button>
          </form>

          <div>
            <span style={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-light)', letterSpacing: '0.04em', display: 'block', marginBottom: '10px' }}>
              Or choose a major healthcare hub:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }} className="grid-2-mobile">
              {POPULAR_HUBS.map((hub) => (
                <button
                  key={hub.name}
                  type="button"
                  onClick={() => handleSelectHub(hub)}
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building2 size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>{hub.name}</span>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-light)' }} />
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetToGps}
              style={{
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700
              }}
            >
              <Crosshair size={15} />
              Use Current GPS
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsLocationModalOpen(false)} style={{ borderRadius: '10px' }}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
