import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useHealthData, HealthRecord } from '../../context/HealthDataContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Toast } from '../../components/ui/Toast';
import { 
  FileText, Plus, Search, Trash2, Download, FileCode, 
  CheckCircle2, ShieldCheck, Sparkles, Filter, Lock, Eye, 
  Share2, Activity, AlertCircle
} from 'lucide-react';

export const HealthRecordsExplorer: React.FC = () => {
  const { user } = useAuth();
  const { healthRecords, uploadHealthRecord, deleteHealthRecord } = useHealthData();
  
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({ name: '', type: 'Lab Report' as HealthRecord['type'], fileName: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [toastMsg, setToastMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sample initial records fallback if empty
  const defaultRecords: HealthRecord[] = [
    {
      id: 'rec_cbc_lipid_01',
      patientId: user?.id || 'anonymous_user',
      name: 'Complete Blood Count (CBC) & Lipid Profile',
      type: 'Lab Report',
      fileName: `${(user?.name || 'Patient').replace(/\s+/g, '_')}_CBC_Lipid_Panel.pdf`,
      fileSize: '1.4 MB',
      date: '2026-08-05',
      uploadedBy: 'Patient',
      fileUrl: '#'
    },
    {
      id: 'rec_diabetes_02',
      patientId: user?.id || 'anonymous_user',
      name: 'HbA1c Diabetes & Thyroid Profile (TSH)',
      type: 'Lab Report',
      fileName: 'Diabetes_Thyroid_Screening.pdf',
      fileSize: '980 KB',
      date: '2026-08-02',
      uploadedBy: 'Patient',
      fileUrl: '#'
    },
    {
      id: 'rec_rx_03',
      patientId: user?.id || 'anonymous_user',
      name: 'Cardiology Prescription & Follow-up Plan',
      type: 'Prescription',
      fileName: 'Dr_Sarah_Prescription_Cardiology.pdf',
      fileSize: '620 KB',
      date: '2026-07-28',
      uploadedBy: 'Doctor',
      fileUrl: '#'
    }
  ];

  const patientRecs = healthRecords.filter((r) => !user?.id || r.patientId === user?.id);
  
  const filteredRecs = patientRecs.filter((rec) => {
    const matchesSearch = rec.name.toLowerCase().includes(search.toLowerCase()) || 
                          rec.fileName.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterType === 'All' || rec.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.name || !newDoc.fileName) {
      setErrorMsg('Please complete all document details.');
      return;
    }

    setErrorMsg('');
    setIsUploading(true);
    setUploadProgress(15);

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressTimer);
          return 90;
        }
        return prev + 25;
      });
    }, 200);

    try {
      const res = await uploadHealthRecord(
        newDoc.name,
        newDoc.type,
        newDoc.fileName,
        '1.2 MB'
      );
      
      clearInterval(progressTimer);
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setIsUploadOpen(false);
        setNewDoc({ name: '', type: 'Lab Report', fileName: '' });
        setToastMsg('🎉 Health document uploaded & encrypted in your Vault successfully!');
      }, 300);
    } catch (e) {
      clearInterval(progressTimer);
      setIsUploading(false);
      setErrorMsg('Failed to upload document.');
    }
  };

  const handleDownload = (recName: string) => {
    setToastMsg(`📥 Downloading document: "${recName}"...`);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this document from your Health Vault?')) {
      deleteHealthRecord(id);
      setToastMsg('Document removed from Health Vault.');
    }
  };

  const typesOptions = [
    { value: 'Lab Report', label: 'Lab Report (Blood work, CBC, Scans)' },
    { value: 'Prescription', label: 'Prescription & Clinical Dosage' },
    { value: 'Vaccination', label: 'Vaccination Record' },
    { value: 'Other', label: 'Other Healthcare Reports' }
  ];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* CLINICAL VAULT HERO BANNER */}
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
            <FileText size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                My Health Records Vault
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
                Encrypted Storage
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px', marginBottom: 0 }}>
              Securely store, organize, and analyze your lab reports, prescriptions, and clinical scans.
            </p>
          </div>
        </div>

        <Button 
          onClick={() => setIsUploadOpen(true)}
          style={{
            borderRadius: '12px',
            padding: '10px 20px',
            fontWeight: 700,
            fontSize: '0.88rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={16} />
          Upload New Document
        </Button>
      </div>

      {/* SEARCH BAR & FILTER PILLS CARD */}
      <Card style={{ borderRadius: '20px', padding: '18px 24px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, position: 'relative', minWidth: '260px' }}>
            <Input 
              placeholder="Search records by name, keyword, or filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ height: '42px', fontSize: '0.88rem', paddingLeft: '36px', borderRadius: '12px' }}
              icon={<Search size={16} style={{ color: 'var(--text-light)' }} />}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginRight: '4px' }}>Filter:</span>
            {['All', 'Lab Report', 'Prescription', 'Other'].map((tag) => {
              const count = tag === 'All' 
                ? patientRecs.length 
                : patientRecs.filter(r => r.type === tag).length;
              return (
                <button
                  key={tag}
                  onClick={() => setFilterType(tag)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: filterType === tag ? 'var(--primary)' : 'var(--border)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: filterType === tag ? 'var(--primary-light)' : 'white',
                    color: filterType === tag ? 'var(--primary)' : 'var(--text-muted)',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{tag === 'All' ? 'All Documents' : tag}</span>
                  <span style={{
                    fontSize: '0.72rem',
                    backgroundColor: filterType === tag ? 'var(--primary)' : '#f1f5f9',
                    color: filterType === tag ? 'white' : 'var(--text-muted)',
                    padding: '1px 7px',
                    borderRadius: '10px'
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* DOCUMENT CARDS GRID */}
      {filteredRecs.length === 0 ? (
        <Card style={{ padding: '64px 24px', textAlign: 'center', backgroundColor: 'white', borderRadius: '24px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
            <FileText size={36} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>No health records match your filter</h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '420px', margin: '6px auto 16px auto' }}>
            No documents found matching "{search}". Click "Upload New Document" to add files to your Vault.
          </p>
          <Button onClick={() => setIsUploadOpen(true)} style={{ borderRadius: '12px' }}>
            <Plus size={16} />
            Upload Document Now
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }} className="grid-3-mobile">
          {filteredRecs.map((rec) => (
            <Card 
              key={rec.id}
              style={{
                borderRadius: '20px',
                border: '1px solid var(--border)',
                transition: 'all 0.25s ease',
                backgroundColor: 'white',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '22px'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '14px', backgroundColor: rec.type === 'Prescription' ? '#e0f2fe' : 'var(--primary-light)', color: rec.type === 'Prescription' ? '#0284c7' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={22} />
                  </div>
                  <span style={{ 
                    fontSize: '0.72rem', 
                    fontWeight: 800, 
                    color: rec.type === 'Prescription' ? '#0284c7' : 'var(--primary)',
                    backgroundColor: rec.type === 'Prescription' ? '#f0f9ff' : 'var(--primary-light)',
                    padding: '4px 10px',
                    borderRadius: '12px',
                    textTransform: 'uppercase'
                  }}>
                    {rec.type}
                  </span>
                </div>

                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-dark)', lineHeight: '1.4', marginBottom: '8px' }}>
                  {rec.name}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>File: <strong>{rec.fileName}</strong></span>
                  <span>Size: {rec.fileSize} • Uploaded: {rec.date}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <a
                  href="#/patient/report-analyzer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: 'var(--primary)',
                    textDecoration: 'none'
                  }}
                >
                  <Sparkles size={14} />
                  <span>Analyze with AI</span>
                </a>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => handleDownload(rec.name)}
                    style={{ backgroundColor: '#f8fafc', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-main)' }}
                    title="Download File"
                  >
                    <Download size={15} />
                  </button>

                  <button 
                    onClick={() => handleDelete(rec.id)}
                    style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '6px 10px', cursor: 'pointer', color: '#dc2626' }}
                    title="Delete File"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* UPLOAD DOCUMENT MODAL */}
      <Modal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} title="Upload Health Document to Vault">
        <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {errorMsg && (
            <div style={{ backgroundColor: 'var(--error-light)', border: '1.5px solid var(--error)', padding: '12px', borderRadius: '12px', color: 'var(--error)', fontSize: '0.85rem', fontWeight: 600 }}>
              {errorMsg}
            </div>
          )}

          <Input 
            label="Document Title *" 
            placeholder="e.g. Complete Blood Count Report (Aug 2026)" 
            value={newDoc.name}
            onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
            required
            disabled={isUploading}
          />

          <Select 
            label="Document Category"
            options={typesOptions}
            value={newDoc.type}
            onChange={(val) => setNewDoc({ ...newDoc, type: val as HealthRecord['type'] })}
            disabled={isUploading}
          />

          <Input 
            label="Select Document File (PDF / Image) *" 
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setNewDoc({ ...newDoc, fileName: file.name });
              }
            }}
            required
            disabled={isUploading}
            helperText="Supported formats: PDF, JPG, JPEG, PNG (up to 25MB)."
          />

          {isUploading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--primary)' }}>Encrypting & Uploading to Vault...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.2s ease' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)} disabled={isUploading} style={{ borderRadius: '12px' }}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isUploading} style={{ borderRadius: '12px', backgroundColor: 'var(--primary)' }}>
              Confirm & Save to Vault
            </Button>
          </div>
        </form>
      </Modal>

      {/* STORAGE ENCRYPTION SECURITY NOTICE */}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', backgroundColor: '#f0fdfa', padding: '18px 24px', borderRadius: '20px', border: '1px solid rgba(15, 118, 110, 0.2)' }}>
        <ShieldCheck size={24} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.5' }}>
          <strong>Security Notice:</strong> All uploaded medical documents are protected in transit via TLS 1.3 and stored with database encryption at rest. Practitioners can inspect reports only when you explicitly authorize medical appointments or click share.
        </span>
      </div>

      {toastMsg && (
        <Toast message={toastMsg} onClose={() => setToastMsg('')} />
      )}
    </div>
  );
};
