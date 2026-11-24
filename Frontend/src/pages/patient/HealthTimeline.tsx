import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useHealthData } from '../../context/HealthDataContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  Activity, Calendar, FileText, ShoppingBag, 
  UserPlus, CheckCircle, ArrowDown, ArrowUp 
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  type: 'account' | 'record' | 'appointment' | 'prescription' | 'order';
}

export const PatientHealthTimeline: React.FC = () => {
  const { user } = useAuth();
  const { appointments, healthRecords, prescriptions, orders, medicalReports, patientProfile } = useHealthData();
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Format date using user's local timezone and browser locale
  const formatTimelineDate = (dateString: string): string => {
    if (!dateString) return 'Date unavailable';
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) {
      return dateString;
    }
    return parsed.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const timelineEvents: TimelineEvent[] = [];

  // 1. Account Creation Event (Dynamic from user.createdAt / created_at)
  const accountCreatedDate = user?.createdAt || (user as any)?.created_at;
  if (accountCreatedDate) {
    timelineEvents.push({
      id: 'evt_acc',
      date: accountCreatedDate,
      title: 'Account Created',
      description: 'Welcome to Jivexa Health OS. Secure health vault initialized.',
      icon: <UserPlus size={16} />,
      color: 'var(--primary)',
      bgColor: 'var(--primary-light)',
      type: 'account'
    });
  }

  // 2. Health Profile Configured Event (Dynamic from patientProfile configuredAt / updatedAt / user)
  if (user?.onboarded) {
    const profileDate = 
      patientProfile?.configuredAt || 
      patientProfile?.updatedAt || 
      user?.updatedAt || 
      accountCreatedDate || 
      new Date().toISOString();

    timelineEvents.push({
      id: 'evt_onb',
      date: profileDate,
      title: 'Health Profile Configured',
      description: 'Completed onboarding metrics: Blood Group, Allergies, and emergency details logged.',
      icon: <CheckCircle size={16} />,
      color: 'var(--secondary)',
      bgColor: 'var(--secondary-light)',
      type: 'account'
    });
  }

  // 3. AI Health Reports & Document Uploads
  if (medicalReports && medicalReports.length > 0) {
    medicalReports
      .filter((r) => r.patientId === user?.id || !r.patientId)
      .forEach((rep) => {
        const repDate = rep.uploadedAt || rep.analysis?.analyzedAt || new Date().toISOString();
        const scoreText = rep.analysis?.healthScore !== undefined ? ` • Health Score: ${rep.analysis.healthScore}/100` : '';
        const statusText = rep.analysis?.scoreStatus ? ` (${rep.analysis.scoreStatus})` : '';
        timelineEvents.push({
          id: `evt_ai_rep_${rep.id}`,
          date: repDate,
          title: `AI Health Report Analysis: "${rep.fileName}"`,
          description: `Category: Medical Report • ${rep.fileSize || 'Uploaded'}${scoreText}${statusText}`,
          icon: <FileText size={16} />,
          color: 'var(--primary)',
          bgColor: 'var(--primary-light)',
          type: 'record'
        });
      });
  }

  // 4. Manual Health Vault Records
  healthRecords
    .filter((r) => r.patientId === user?.id)
    .forEach((rec) => {
      timelineEvents.push({
        id: `evt_rec_${rec.id}`,
        date: rec.date,
        title: `Uploaded document: "${rec.name}"`,
        description: `Category: ${rec.type} • File: ${rec.fileName}`,
        icon: <FileText size={16} />,
        color: 'var(--info)',
        bgColor: 'var(--info-light)',
        type: 'record'
      });
    });

  // 5. Doctor Consultations
  appointments
    .filter((a) => a.patientId === user?.id)
    .forEach((appt) => {
      let desc = `Practitioner: ${appt.doctorName} (${appt.doctorSpecialty}) • Time: ${appt.time}`;
      if (appt.status === 'Completed' && appt.consultationSummary) {
        desc += ` • Summary: "${appt.consultationSummary}"`;
      }
      timelineEvents.push({
        id: `evt_appt_${appt.id}`,
        date: appt.date,
        title: `Doctor consultation: ${appt.status}`,
        description: desc,
        icon: <Calendar size={16} />,
        color: appt.status === 'Cancelled' ? 'var(--error)' : 'var(--primary)',
        bgColor: appt.status === 'Cancelled' ? 'var(--error-light)' : 'var(--primary-light)',
        type: 'appointment'
      });
    });

  // 6. Digital Prescriptions
  prescriptions
    .filter((p) => p.patientId === user?.id)
    .forEach((pres) => {
      const medNames = pres.medications.map((m) => m.name).join(', ');
      timelineEvents.push({
        id: `evt_pres_${pres.id}`,
        date: pres.date,
        title: `Digital Prescription issued`,
        description: `Doctor: ${pres.doctorName} • Prescribed: ${medNames}`,
        icon: <Activity size={16} />,
        color: 'var(--secondary)',
        bgColor: 'var(--secondary-light)',
        type: 'prescription'
      });
    });

  // 7. Pharmacy Orders
  orders
    .filter((o) => o.patientId === user?.id)
    .forEach((ord) => {
      const itemsText = ord.items.map((i) => `${i.name} (x${i.quantity})`).join(', ');
      timelineEvents.push({
        id: `evt_ord_${ord.id}`,
        date: ord.date,
        title: `Pharmacy Order: ${ord.status}`,
        description: `Items: ${itemsText} • Total price paid: ₹${ord.totalPrice}`,
        icon: <ShoppingBag size={16} />,
        color: ord.status === 'Completed' ? 'var(--secondary)' : 'var(--warning)',
        bgColor: ord.status === 'Completed' ? 'var(--secondary-light)' : 'var(--warning-light)',
        type: 'order'
      });
    });

  const sortedEvents = [...timelineEvents].sort((a, b) => {
    const dateA = new Date(a.date).getTime() || 0;
    const dateB = new Date(b.date).getTime() || 0;
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* CLINICAL TIMELINE HERO BANNER */}
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
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Activity size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                My Medical Health Timeline
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
                Chronological Vault
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px', marginBottom: 0 }}>
              A comprehensive chronological audit log of your consultations, report uploads, and prescription orders.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '12px',
            padding: '10px 18px',
            fontSize: '0.86rem',
            fontWeight: 700
          }}
        >
          {sortOrder === 'desc' ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
          Sort: {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
        </Button>
      </div>

      <div style={{ position: 'relative', paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div style={{
          position: 'absolute',
          left: '15px',
          top: '12px',
          bottom: '12px',
          width: '2px',
          backgroundColor: 'var(--border)'
        }} />

        {sortedEvents.map((evt) => (
          <div key={evt.id} style={{ position: 'relative', animation: 'fadeIn 0.3s ease' }}>
            
            <div style={{
              position: 'absolute',
              left: '-32px',
              top: '4px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: evt.bgColor,
              color: evt.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid white',
              boxShadow: 'var(--shadow-sm)',
              transform: 'translateX(-50%)',
              zIndex: 10
            }}>
              {evt.icon}
            </div>

            <Card style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', marginBottom: '8px' }} className="flex-col-mobile">
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>{evt.title}</h4>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-light)', fontWeight: 600 }}>
                  {formatTimelineDate(evt.date)}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                {evt.description}
              </p>
            </Card>

          </div>
        ))}
      </div>

    </div>
  );
};
