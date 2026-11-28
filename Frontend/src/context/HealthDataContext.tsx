import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { createHealthIdApi, getMyHealthIdApi, searchHealthIdApi } from '../services/healthIdService';
import { fetchApprovedDoctorsApi, VerifiedDoctor } from '../services/doctorService';
import {
  createAppointmentApi,
  getAppointmentsApi,
  updateAppointmentApi,
  cancelAppointmentApi,
  createPrescriptionApi,
  getPrescriptionsApi,
  updatePrescriptionApi,
  getMedicalReportsApi,
  saveMedicalReportApi,
  deleteMedicalReportApi,
  shareMedicalReportApi
} from '../services/clinicalService';
import {
  createPharmacyOrderApi,
  getPharmacyOrdersApi,
  updatePharmacyOrderApi
} from '../services/pharmacyService';
import {
  createAmbulanceRequestApi,
  getAmbulanceRequestsApi,
  updateAmbulanceRequestApi
} from '../services/ambulanceService';
import { MedicalReportRecord, SharedReportRecord } from '../types';

// --- TYPES ---
export interface Doctor {
  id: string;
  roleId?: string;
  name: string;
  specialty: string;
  specialization?: string;
  experience: number;
  experienceYears?: number;
  location: string;
  clinicAddress?: string;
  city?: string;
  availability: string;
  availabilityText?: string;
  consultationType: 'Video' | 'In-Person' | 'Both';
  consultationTypes?: ('In-Person' | 'Video')[];
  availableDays?: string[];
  availableSlots?: string[];
  rating?: number;
  education: string;
  qualifications?: string;
  about: string;
  fee: number;
  consultationFee?: number;
  photoUrl?: string;
  avatarUrl?: string;
  clinicName?: string;
  registrationNumber?: string;
  isVerified?: boolean;
  verificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  languages?: string[];
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
}

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  rating: number;
  phone: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  clinicName?: string;
  clinicAddress?: string;
  consultationFee?: number;
  consultationType?: 'Video' | 'In-Person';
  date: string;
  time: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Completed' | 'Upcoming' | 'In Consultation';
  reason?: string;
  notes?: string;
  consultationSummary?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  sharedReportIds?: string[];
  createdAt?: string;
}

export interface HealthRecord {
  id: string;
  patientId: string;
  name: string;
  type: 'Lab Report' | 'Prescription' | 'Vaccination' | 'Other';
  date: string;
  fileName: string;
  fileSize: string;
  fileUrl: string;
  uploadedBy: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  medications: Medication[];
  notes?: string;
  status: 'Draft' | 'Issued' | 'Active' | 'Expired' | 'Cancelled';
  followUpDate?: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  patientId: string;
  patientName: string;
  pharmacyId: string;
  pharmacyName: string;
  status: 'Pending' | 'Confirmed' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
  items: OrderItem[];
  totalPrice: number;
  date: string;
  prescriptionId?: string;
}

export interface InventoryItem {
  id: string;
  pharmacyId: string;
  name: string;
  stock: number;
  price: number;
  category: string;
  sku: string;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  type: 'appointment' | 'record' | 'order' | 'security' | 'system' | 'emergency';
  isRead: boolean;
  timestamp: string;
}

export interface HealthGoal {
  id: string;
  patientId: string;
  type: 'Steps' | 'Water' | 'Sleep' | 'Calories';
  target: number;
  current: number;
  unit: string;
}

export interface AccessRequest {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  healthId: string;
}

export interface AccessLog {
  id: string;
  patientId?: string;
  healthId: string;
  accessorRole: 'PUBLIC' | 'DOCTOR' | 'PATIENT' | 'EMERGENCY';
  accessType: 'PUBLIC_EMERGENCY_LOOKUP' | 'EMERGENCY_MODE_INSTANT' | 'DOCTOR_CLINICAL_FULL';
  accessedAt: string;
}

export interface PatientProfile {
  userId: string;
  jivexaHealthId?: string;
  bloodGroup: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  emergencySharingEnabled?: boolean;
  emergencyAccessExpiry?: string;
  configuredAt?: string;
  updatedAt?: string;
  avatarUrl?: string;
}

export interface AmbulanceVehicle {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
  vehicleNumber: string;
  type: 'Basic' | 'Oxygen' | 'ICU' | 'ALS';
  availability: 'Available' | 'Offline' | 'Busy';
  latitude: number;
  longitude: number;
  hospitalPartner: string;
  rating: number;
  baseFare: number;
}

export interface AmbulanceBooking {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  jivexaHealthId?: string;
  ambulanceId?: string;
  ambulanceType: 'Basic' | 'Oxygen' | 'ICU' | 'ALS';
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupLat: number;
  pickupLng: number;
  destLat: number;
  destLng: number;
  status: 'Pending' | 'Accepted' | 'Arrived' | 'In Transit' | 'Completed' | 'Cancelled';
  fare: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

interface HealthDataContextType {
  doctors: Doctor[];
  doctorsLoading: boolean;
  pharmacies: Pharmacy[];
  appointments: Appointment[];
  healthRecords: HealthRecord[];
  prescriptions: Prescription[];
  orders: Order[];
  inventory: InventoryItem[];
  notifications: Notification[];
  healthGoals: HealthGoal[];
  patientProfile: PatientProfile | null;
  medicalReports: MedicalReportRecord[];
  sharedReports: SharedReportRecord[];
  accessRequests: AccessRequest[];
  accessLogs: AccessLog[];
  ambulances: AmbulanceVehicle[];
  ambulanceBookings: AmbulanceBooking[];

  refreshDoctors: () => Promise<void>;
  refreshAppointments: () => Promise<void>;

  // Patient operations
  bookAppointment: (
    doctorId: string,
    date: string,
    time: string,
    notes: string,
    consultationType?: 'Video' | 'In-Person',
    sharedReportIds?: string[]
  ) => Promise<{ success: boolean; appointment?: Appointment; error?: string }>;
  cancelAppointment: (id: string) => Promise<{ success: boolean; error?: string }>;
  rescheduleAppointment: (id: string, date: string, time: string) => Promise<{ success: boolean; error?: string }>;
  uploadHealthRecord: (name: string, type: HealthRecord['type'], fileName: string, fileSize: string) => Promise<{ success: boolean }>;
  deleteHealthRecord: (id: string) => void;
  placePharmacyOrder: (pharmacyId: string, items: OrderItem[], prescriptionId?: string, deliveryAddress?: string) => Promise<{ success: boolean; order?: Order }>;
  updatePatientProfile: (data: Partial<PatientProfile>) => void;
  saveAnalyzedReport: (report: MedicalReportRecord) => void;
  deleteMedicalReport: (reportId: string) => Promise<{ success: boolean; error?: string }>;
  shareReportWithDoctor: (reportId: string, doctorId: string) => Promise<{ success: boolean; error?: string }>;

  // JHID & Consent Access Operations
  generateOrGetHealthId: (userId: string) => string;
  searchPatientByHealthId: (healthId: string) => Promise<{ success: boolean; patientInfo?: any; error?: string }>;
  getPublicHealthIdProfile: (healthId: string) => Promise<{ success: boolean; publicProfile?: any; error?: string }>;
  toggleEmergencyAccessMode: (enabled: boolean, durationHours?: number) => Promise<{ success: boolean }>;
  requestPatientAccess: (healthId: string) => Promise<{ success: boolean; error?: string }>;
  respondAccessRequest: (requestId: string, status: 'approved' | 'rejected') => Promise<{ success: boolean }>;
  revokeDoctorAccess: (doctorId: string) => Promise<{ success: boolean }>;

  // Ambulance Network Operations
  bookAmbulance: (details: { ambulanceType: 'Basic' | 'Oxygen' | 'ICU' | 'ALS'; pickupAddress: string; destinationAddress: string; pickupLat: number; pickupLng: number; destLat: number; destLng: number; fare: number }) => Promise<{ success: boolean; booking?: AmbulanceBooking }>;
  updateAmbulanceBookingStatus: (bookingId: string, status: AmbulanceBooking['status']) => Promise<{ success: boolean }>;
  toggleAmbulanceAvailability: (ambulanceId: string, availability: AmbulanceVehicle['availability']) => Promise<{ success: boolean }>;

  // Doctor operations
  completeConsultation: (appointmentId: string, summary: string, meds?: Medication[], notes?: string, followUpDate?: string, status?: Prescription['status']) => void;
  updateAppointmentStatus: (id: string, status: Appointment['status'], extra?: { rejectionReason?: string; consultationSummary?: string }) => Promise<{ success: boolean; error?: string }>;

  // Pharmacy operations
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  updateInventoryStock: (itemId: string, stock: number) => void;

  // General
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  addNotification: (userId: string, message: string, type: Notification['type']) => void;
}

const mapVerifiedDoctorToDoctor = (d: VerifiedDoctor): Doctor => {
  const types: ('In-Person' | 'Video')[] =
    Array.isArray(d.consultationTypes) && d.consultationTypes.length > 0
      ? d.consultationTypes
      : ['In-Person', 'Video'];
  const cType: Doctor['consultationType'] = types.includes('In-Person') && types.includes('Video')
    ? 'Both'
    : (types.includes('Video') ? 'Video' : 'In-Person');
  const locationParts = [d.clinicAddress, d.city].filter(Boolean);
  return {
    id: d.id,
    roleId: d.roleId,
    name: d.name,
    specialty: d.specialization || 'General Physician',
    specialization: d.specialization || 'General Physician',
    experience: Number(d.experienceYears || 0),
    experienceYears: Number(d.experienceYears || 0),
    location: locationParts.join(', ') || 'Verified Clinic',
    clinicAddress: d.clinicAddress || '',
    city: d.city || '',
    availability: d.availabilityText || `${(d.availableDays || []).join(', ')}`,
    availabilityText: d.availabilityText || '',
    consultationType: cType,
    consultationTypes: types,
    availableDays: d.availableDays || [],
    availableSlots: d.availableSlots || [],
    education: d.qualifications || 'MBBS',
    qualifications: d.qualifications || 'MBBS',
    about: d.about || '',
    fee: Number(d.consultationFee ?? 500),
    consultationFee: Number(d.consultationFee ?? 500),
    photoUrl: d.avatarUrl || '',
    avatarUrl: d.avatarUrl || '',
    clinicName: d.clinicName || '',
    registrationNumber: d.nmcRegistrationNumber || '',
    isVerified: Boolean(d.isVerified),
    verificationStatus: d.verificationStatus || 'APPROVED',
    languages: d.languages || ['English'],
    status: 'approved'
  };
};

const INITIAL_PHARMACIES: Pharmacy[] = [
  { id: '00000000-0000-0000-0000-000000000011', name: 'Jivexa Pharmacy Hub', address: 'Indiranagar Main Rd, Bengaluru', rating: 4.8, phone: '+91 80 4123 4567' },
  { id: '00000000-0000-0000-0000-000000000012', name: 'Apollo Pharmacy', address: 'Koramangala 8th Block, Bengaluru', rating: 4.5, phone: '+91 80 4987 6543' },
  { id: '00000000-0000-0000-0000-000000000013', name: 'MedPlus Pharmacy', address: 'Jayanagar 4th Block, Bengaluru', rating: 4.6, phone: '+91 80 4356 7890' }
];

const INITIAL_INVENTORY = (pharmId: string): InventoryItem[] => [
  { id: `${pharmId}_inv_1`, pharmacyId: pharmId, name: 'Paracetamol 500mg', stock: 120, price: 15, category: 'Analgesics', sku: 'sku-para-500' },
  { id: `${pharmId}_inv_2`, pharmacyId: pharmId, name: 'Amoxicillin 250mg', stock: 85, price: 65, category: 'Antibiotics', sku: 'sku-amox-250' },
  { id: `${pharmId}_inv_3`, pharmacyId: pharmId, name: 'Cetirizine 10mg', stock: 200, price: 20, category: 'Antihistamines', sku: 'sku-ceti-10' },
  { id: `${pharmId}_inv_4`, pharmacyId: pharmId, name: 'Metformin 500mg', stock: 150, price: 40, category: 'Anti-Diabetic', sku: 'sku-metf-500' },
  { id: `${pharmId}_inv_5`, pharmacyId: pharmId, name: 'Atorvastatin 10mg', stock: 95, price: 80, category: 'Cardiovascular', sku: 'sku-ator-10' }
];

const HealthDataContext = createContext<HealthDataContextType | undefined>(undefined);

const mapMongoReportToRecord = (doc: any): MedicalReportRecord => {
  return {
    id: String(doc._id || doc.id),
    patientId: String(doc.patientId),
    fileName: doc.fileName || 'Medical_Report.pdf',
    fileType: 'application/pdf',
    fileSize: doc.fileSize || 'Standard',
    fileUrl: doc.fileUrl || '/assets/report_preview.pdf',
    uploadedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    analysis: {
      id: String(doc._id || doc.id),
      reportId: String(doc._id || doc.id),
      reportTitle: doc.reportTitle || doc.fileName || 'Clinical Lab Report',
      reportDate: doc.reportDate || '',
      healthScore: doc.healthScore,
      scoreStatus: doc.scoreStatus || 'Analysis Complete',
      scoreFormula: doc.scoreFormula || '',
      scoreMethodology: doc.scoreMethodology || '',
      dataCompleteness: doc.dataCompleteness || { analyzed: doc.parameters?.length || 0, expected: 8, percentage: 100, statusText: 'Verified' },
      summaryCounts: doc.summaryCounts || {
        total: doc.parameters?.length || 0,
        inRange: doc.normalFindings?.length || 0,
        aboveRange: doc.abnormalFindings?.length || 0,
        belowRange: 0,
        needsReview: doc.unverifiedParameters?.length || 0,
        verifiedCount: (doc.parameters?.length || 0) - (doc.unverifiedParameters?.length || 0)
      },
      summary: doc.summary || '',
      parameters: doc.parameters || [],
      normalFindings: doc.normalFindings || [],
      abnormalFindings: doc.abnormalFindings || [],
      attentionParameters: doc.attentionParameters || [],
      needsReview: doc.unverifiedParameters || doc.needsReview || [],
      possibleFactors: doc.possibleFactors || [],
      questionsForDoctor: doc.questionsForDoctor || [],
      lifestyleSuggestions: doc.lifestyleRecommendations || [],
      disclaimer: doc.disclaimer || 'Educational healthcare information only.',
      analyzedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      extractionStatus: doc.extractionStatus,
      aiStatus: doc.aiStatus
    }
  };
};

export const HealthDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || '';
  const userName = user?.name || '';

  // Real verified doctors fetched from backend (never hardcoded fake doctors)
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);

  const [pharmacies] = useState<Pharmacy[]>(INITIAL_PHARMACIES);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [healthGoals, setHealthGoals] = useState<HealthGoal[]>([]);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);

  const [medicalReports, setMedicalReports] = useState<MedicalReportRecord[]>(() => {
    try {
      localStorage.removeItem('jivexa_db_medical_reports');
    } catch (e) {}

    let initialUserId = '';
    try {
      const activeUserJSON = localStorage.getItem('jivexa_session_user');
      if (activeUserJSON) {
        const u = JSON.parse(activeUserJSON);
        initialUserId = u.id || '';
      }
    } catch (e) {}

    if (initialUserId) {
      const saved = localStorage.getItem(`jivexa_db_medical_reports_${initialUserId}`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [sharedReports, setSharedReports] = useState<SharedReportRecord[]>(() => {
    const saved = localStorage.getItem('jivexa_db_shared_reports');
    return saved ? JSON.parse(saved) : [];
  });

  const refreshDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const res = await fetchApprovedDoctorsApi();
      if (res.success) {
        setDoctors(res.doctors.map(mapVerifiedDoctorToDoctor));
      }
    } catch (e) {
      console.warn('[HealthDataContext] Failed to load verified doctors');
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  const refreshAppointments = useCallback(async () => {
    if (!userId) return;
    try {
      const liveApptsRes = await getAppointmentsApi();
      if (liveApptsRes.success && Array.isArray(liveApptsRes.appointments)) {
        setAppointments(liveApptsRes.appointments);
        localStorage.setItem(`jivexa_db_appointments_${userId}`, JSON.stringify(liveApptsRes.appointments));
      }
    } catch (e) {}
  }, [userId]);

  useEffect(() => {
    refreshDoctors();
  }, [refreshDoctors]);

  const saveAnalyzedReport = async (report: MedicalReportRecord) => {
    setMedicalReports((prev) => {
      const updated = [report, ...prev.filter((r) => r.id !== report.id)];
      if (userId) {
        localStorage.setItem(`jivexa_db_medical_reports_${userId}`, JSON.stringify(updated));
      }
      return updated;
    });

    if (userId) {
      try {
        await saveMedicalReportApi({
          reportId: report.id,
          fileName: report.fileName,
          fileSize: report.fileSize,
          reportTitle: report.analysis?.reportTitle || report.fileName,
          reportDate: report.analysis?.reportDate || '',
          healthScore: report.analysis?.healthScore,
          scoreStatus: report.analysis?.scoreStatus,
          scoreFormula: report.analysis?.scoreFormula,
          scoreMethodology: report.analysis?.scoreMethodology,
          dataCompleteness: report.analysis?.dataCompleteness,
          summaryCounts: report.analysis?.summaryCounts,
          summary: report.analysis?.summary,
          parameters: report.analysis?.parameters,
          normalFindings: report.analysis?.normalFindings,
          abnormalFindings: report.analysis?.abnormalFindings,
          attentionParameters: report.analysis?.attentionParameters,
          unverifiedParameters: report.analysis?.needsReview || (report.analysis as any)?.unverifiedParameters,
          possibleFactors: report.analysis?.possibleFactors,
          questionsForDoctor: report.analysis?.questionsForDoctor,
          lifestyleRecommendations: report.analysis?.lifestyleSuggestions,
          disclaimer: report.analysis?.disclaimer
        });
      } catch (e) {
        console.warn('[HealthDataContext] Background sync of analyzed report failed:', e);
      }
    }
  };

  const deleteMedicalReport = async (reportId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await deleteMedicalReportApi(reportId);
      if (!res.success) {
        return { success: false, error: res.error || 'Failed to delete medical report' };
      }

      setMedicalReports((prev) => {
        const updated = prev.filter((r) => r.id !== reportId);
        if (userId) {
          localStorage.setItem(`jivexa_db_medical_reports_${userId}`, JSON.stringify(updated));
        }
        return updated;
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to delete report' };
    }
  };

  const shareReportWithDoctor = async (reportId: string, doctorId: string): Promise<{ success: boolean; error?: string }> => {
    const report = medicalReports.find((r) => r.id === reportId);
    const doc = doctors.find((d) => d.id === doctorId);
    if (!report || !doc) return { success: false, error: 'Report or verified doctor not found' };

    const apiRes = await shareMedicalReportApi(reportId, doctorId, doc.name);
    if (!apiRes.success) {
      return { success: false, error: apiRes.error || 'Failed to share report' };
    }

    const sharedRecord: SharedReportRecord = {
      id: `shared_${Date.now()}`,
      reportId: report.id,
      patientId: userId,
      patientName: userName || 'Patient',
      doctorId: doc.id,
      doctorName: doc.name,
      sharedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      reviewStatus: 'Pending Review',
      reportTitle: report.fileName,
      analysisSummary: report.analysis?.summary || 'AI Medical Report Analysis',
      healthScore: report.analysis?.healthScore || 85
    };

    setSharedReports((prev) => {
      const updated = [sharedRecord, ...prev.filter((s) => !(s.reportId === report.id && s.doctorId === doc.id))];
      localStorage.setItem('jivexa_db_shared_reports', JSON.stringify(updated));
      return updated;
    });

    await addNotification(doc.id, `Patient ${userName || 'Patient'} shared a new AI Medical Report (${report.fileName}) for your review.`, 'record');

    return { success: true };
  };

  // Sync utilities for per-user cached state
  const syncAppointments = (list: Appointment[]) => {
    setAppointments(list);
    if (userId) {
      localStorage.setItem(`jivexa_db_appointments_${userId}`, JSON.stringify(list));
    }
  };

  const syncRecords = (list: HealthRecord[]) => {
    setHealthRecords(list);
    if (userId) {
      localStorage.setItem(`jivexa_db_records_${userId}`, JSON.stringify(list));
    }
  };

  const syncPrescriptions = (list: Prescription[]) => {
    setPrescriptions(list);
    if (userId) {
      localStorage.setItem(`jivexa_db_prescriptions_${userId}`, JSON.stringify(list));
    }
  };

  const syncOrders = (list: Order[]) => {
    setOrders(list);
    if (userId) {
      localStorage.setItem(`jivexa_db_orders_${userId}`, JSON.stringify(list));
    }
  };

  const syncAmbulanceBookings = (list: AmbulanceBooking[]) => {
    setAmbulanceBookings(list);
    if (userId) {
      localStorage.setItem(`jivexa_db_ambulance_${userId}`, JSON.stringify(list));
    }
  };

  const syncInventory = (list: InventoryItem[]) => {
    setInventory(list);
    localStorage.setItem('jivexa_db_inventory', JSON.stringify(list));
  };

  const syncNotifications = (list: Notification[]) => {
    setNotifications(list);
    if (userId) {
      localStorage.setItem(`jivexa_notifications_${userId}`, JSON.stringify(list));
    }
  };

  // Load health data and MongoDB-backed records on mount and whenever userId changes
  useEffect(() => {
    if (!userId) {
      setMedicalReports([]);
      setPatientProfile(null);
      setAppointments([]);
      setHealthRecords([]);
      setPrescriptions([]);
      setOrders([]);
      return;
    }

    const rawName = user?.name || 'Patient';
    const rawEmail = user?.email || '';

    const initializeData = async () => {
      // 1. Load or initialize Patient profile
      const savedProfile = localStorage.getItem(`jivexa_profile_${userId}`);
      const initialTimestamp = user?.createdAt || (user as any)?.created_at || new Date().toISOString();
      if (savedProfile) {
        try {
          const parsed = JSON.parse(savedProfile);
          if (!parsed.configuredAt) {
            parsed.configuredAt = initialTimestamp;
            parsed.updatedAt = parsed.updatedAt || initialTimestamp;
            localStorage.setItem(`jivexa_profile_${userId}`, JSON.stringify(parsed));
          }
          if (!parsed.jivexaHealthId && (user as any)?.healthId) {
            parsed.jivexaHealthId = (user as any).healthId;
          }
          setPatientProfile(parsed);
        } catch (e) {}
      } else {
        const defaultProfile: PatientProfile = {
          userId,
          jivexaHealthId: (user as any)?.healthId,
          bloodGroup: 'O+ Positive',
          allergies: 'No known allergies',
          conditions: 'None logged',
          emergencyContact: rawEmail ? `${rawName} (${rawEmail})` : `${rawName} (+91 99887 76655)`,
          configuredAt: initialTimestamp,
          updatedAt: initialTimestamp
        };
        setPatientProfile(defaultProfile);
        localStorage.setItem(`jivexa_profile_${userId}`, JSON.stringify(defaultProfile));
      }

      // 2. Fetch permanent MongoDB Health ID
      if (user && user.role === 'PATIENT') {
        getMyHealthIdApi().then((res) => {
          if (res.success && res.healthId) {
            setPatientProfile((prev) => {
              const updated: PatientProfile = {
                ...(prev || { userId }),
                jivexaHealthId: res.healthId,
                bloodGroup: res.patient?.bloodGroup || prev?.bloodGroup || 'O+ Positive',
                allergies: (res.patient?.healthProfile && res.patient?.healthProfile.allergies) || prev?.allergies || 'No known allergies',
                conditions: (res.patient?.healthProfile && res.patient?.healthProfile.conditions) || prev?.conditions || 'None logged',
                emergencyContact: (res.patient?.phoneNumber || res.patient?.email) || prev?.emergencyContact || (rawEmail ? `${rawName} (${rawEmail})` : `${rawName}`),
                configuredAt: prev?.configuredAt || initialTimestamp,
                updatedAt: prev?.updatedAt || initialTimestamp
              };
              localStorage.setItem(`jivexa_profile_${userId}`, JSON.stringify(updated));
              return updated;
            });
          }
        }).catch((e) => {
          console.warn('[HealthDataContext] Could not fetch MongoDB Health ID:', e);
        });
      }

      // 3. Load or initialize Inventory
      const savedInv = localStorage.getItem('jivexa_db_inventory');
      if (savedInv) {
        try { setInventory(JSON.parse(savedInv)); } catch (e) {}
      } else {
        const defaultInv = INITIAL_PHARMACIES.reduce<InventoryItem[]>((acc, p) => {
          return [...acc, ...INITIAL_INVENTORY(p.id)];
        }, []);
        setInventory(defaultInv);
        localStorage.setItem('jivexa_db_inventory', JSON.stringify(defaultInv));
      }

      // 4. Load local per-user cached slices
      const cachedAppts = localStorage.getItem(`jivexa_db_appointments_${userId}`);
      if (cachedAppts) {
        try { setAppointments(JSON.parse(cachedAppts)); } catch (e) {}
      } else {
        setAppointments([]);
      }

      const cachedPres = localStorage.getItem(`jivexa_db_prescriptions_${userId}`);
      if (cachedPres) {
        try { setPrescriptions(JSON.parse(cachedPres)); } catch (e) {}
      } else {
        setPrescriptions([]);
      }

      const cachedOrders = localStorage.getItem(`jivexa_db_orders_${userId}`);
      if (cachedOrders) {
        try { setOrders(JSON.parse(cachedOrders)); } catch (e) {}
      } else {
        setOrders([]);
      }

      const cachedAmbulance = localStorage.getItem(`jivexa_db_ambulance_${userId}`);
      if (cachedAmbulance) {
        try { setAmbulanceBookings(JSON.parse(cachedAmbulance)); } catch (e) {}
      } else {
        setAmbulanceBookings([]);
      }

      const cachedRecords = localStorage.getItem(`jivexa_db_records_${userId}`);
      if (cachedRecords) {
        try { setHealthRecords(JSON.parse(cachedRecords)); } catch (e) {}
      } else {
        setHealthRecords([]);
      }

      const savedGoals = localStorage.getItem(`jivexa_goals_${userId}`);
      if (savedGoals) {
        try { setHealthGoals(JSON.parse(savedGoals)); } catch (e) {}
      } else {
        const defaultGoals: HealthGoal[] = [
          { id: 'goal_1', patientId: userId, type: 'Steps', target: 8000, current: 5420, unit: 'steps' },
          { id: 'goal_2', patientId: userId, type: 'Water', target: 3000, current: 1800, unit: 'ml' }
        ];
        setHealthGoals(defaultGoals);
        localStorage.setItem(`jivexa_goals_${userId}`, JSON.stringify(defaultGoals));
      }

      const savedNotifications = localStorage.getItem(`jivexa_notifications_${userId}`);
      if (savedNotifications) {
        try { setNotifications(JSON.parse(savedNotifications)); } catch (e) {}
      } else {
        const defaultNotifications: Notification[] = [
          {
            id: 'notif_1',
            userId,
            message: 'Welcome to JIVEXA Health OS! Complete your profile configuration to share details with doctors.',
            type: 'system',
            isRead: false,
            timestamp: new Date().toISOString()
          }
        ];
        setNotifications(defaultNotifications);
        localStorage.setItem(`jivexa_notifications_${userId}`, JSON.stringify(defaultNotifications));
      }

      // 5. Fetch Live Persistent Appointments from MongoDB
      try {
        const liveApptsRes = await getAppointmentsApi();
        if (liveApptsRes.success && Array.isArray(liveApptsRes.appointments)) {
          setAppointments(liveApptsRes.appointments);
          localStorage.setItem(`jivexa_db_appointments_${userId}`, JSON.stringify(liveApptsRes.appointments));
        }
      } catch (e) {}

      // 6. Fetch Live Persistent Prescriptions from MongoDB
      try {
        const livePresRes = await getPrescriptionsApi();
        if (livePresRes.success && Array.isArray(livePresRes.prescriptions)) {
          setPrescriptions(livePresRes.prescriptions);
          localStorage.setItem(`jivexa_db_prescriptions_${userId}`, JSON.stringify(livePresRes.prescriptions));
        }
      } catch (e) {}

      // 7. Fetch Live Persistent Pharmacy Orders from MongoDB
      try {
        const liveOrdersRes = await getPharmacyOrdersApi();
        if (liveOrdersRes.success && Array.isArray(liveOrdersRes.orders)) {
          setOrders(liveOrdersRes.orders);
          localStorage.setItem(`jivexa_db_orders_${userId}`, JSON.stringify(liveOrdersRes.orders));
        }
      } catch (e) {}

      // 8. Fetch Live Persistent Medical Reports from MongoDB
      try {
        const liveReportsRes = await getMedicalReportsApi();
        if (liveReportsRes.success && Array.isArray(liveReportsRes.reports)) {
          if (user?.role === 'DOCTOR') {
            const doctorShared: SharedReportRecord[] = liveReportsRes.reports.map((r: any) => ({
              id: `shared_${r._id || r.id}`,
              reportId: String(r._id || r.id),
              patientId: String(r.patientId),
              patientName: r.patientName || 'Patient',
              doctorId: userId,
              doctorName: userName,
              sharedAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '',
              reviewStatus: 'Pending Review',
              reportTitle: r.reportTitle || r.fileName,
              analysisSummary: r.summary || 'Shared AI Medical Report',
              healthScore: r.healthScore || 0
            }));
            setSharedReports(doctorShared);
          } else {
            const mapped = liveReportsRes.reports.map(mapMongoReportToRecord);
            setMedicalReports(mapped);
            localStorage.setItem(`jivexa_db_medical_reports_${userId}`, JSON.stringify(mapped));
          }
        } else {
          const cached = localStorage.getItem(`jivexa_db_medical_reports_${userId}`);
          setMedicalReports(cached ? JSON.parse(cached) : []);
        }
      } catch (e) {
        console.warn('[HealthDataContext] Could not fetch MongoDB medical reports:', e);
      }

      // 9. Fetch Live Persistent Ambulance Requests from MongoDB
      try {
        const liveAmbRes = await getAmbulanceRequestsApi();
        const bookingsList = liveAmbRes.bookings || liveAmbRes.requests;
        if (liveAmbRes.success && Array.isArray(bookingsList)) {
          setAmbulanceBookings(bookingsList);
          localStorage.setItem(`jivexa_db_ambulance_${userId}`, JSON.stringify(bookingsList));
        }
      } catch (e) {}
    };

    initializeData();
  }, [userId, user?.role]);

  // --- ACTIONS ---

  const bookAppointment = async (
    doctorId: string,
    date: string,
    time: string,
    notes: string,
    consultationType: 'Video' | 'In-Person' = 'In-Person',
    sharedReportIds: string[] = []
  ): Promise<{ success: boolean; appointment?: Appointment; error?: string }> => {
    const doctor = doctors.find((d) => d.id === doctorId);
    const apiRes = await createAppointmentApi({
      doctorId,
      doctorName: doctor?.name,
      doctorSpecialty: doctor?.specialty,
      date,
      time,
      consultationType,
      reason: notes,
      notes,
      sharedReportIds
    });

    if (!apiRes.success || !apiRes.appointment) {
      return { success: false, error: apiRes.error || 'Failed to book appointment' };
    }

    const newAppt = apiRes.appointment;
    const updated = [newAppt, ...appointments.filter((a) => a.id !== newAppt.id)];
    syncAppointments(updated);

    addNotification(userId, `Appointment requested with ${newAppt.doctorName} on ${date} at ${time}.`, 'appointment');
    addNotification(doctorId, `New appointment request from ${userName} on ${date} at ${time}.`, 'appointment');

    return { success: true, appointment: newAppt };
  };

  const cancelAppointment = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const appt = appointments.find((a) => a.id === id);
    const apiRes = await cancelAppointmentApi(id);
    if (!apiRes.success) {
      return { success: false, error: apiRes.error || 'Failed to cancel appointment' };
    }

    const updated = appointments.map((a) =>
      a.id === id ? (apiRes.appointment || { ...a, status: 'Cancelled' as const }) : a
    );
    syncAppointments(updated);

    if (appt) {
      addNotification(userId, `Appointment with ${appt.doctorName} has been cancelled.`, 'appointment');
      addNotification(appt.doctorId, `Appointment with ${userName} has been cancelled.`, 'appointment');
    }
    return { success: true };
  };

  const rescheduleAppointment = async (id: string, date: string, time: string): Promise<{ success: boolean; error?: string }> => {
    const appt = appointments.find((a) => a.id === id);
    const apiRes = await updateAppointmentApi(id, { date, time });
    if (!apiRes.success) {
      return { success: false, error: apiRes.error || 'Failed to reschedule appointment' };
    }

    const updated = appointments.map((a) =>
      a.id === id ? (apiRes.appointment || { ...a, date, time, status: 'Pending' as const }) : a
    );
    syncAppointments(updated);

    if (appt) {
      addNotification(userId, `Appointment with ${appt.doctorName} rescheduled to ${date} at ${time}.`, 'appointment');
      addNotification(appt.doctorId, `Appointment with ${userName} rescheduled to ${date} at ${time}.`, 'appointment');
    }
    return { success: true };
  };

  const uploadHealthRecord = async (name: string, type: HealthRecord['type'], fileName: string, fileSize: string) => {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const newRecord: HealthRecord = {
      id: `rec_${Date.now()}`,
      patientId: userId,
      name,
      type,
      date: new Date().toISOString().split('T')[0],
      fileName,
      fileSize,
      fileUrl: '#',
      uploadedBy: 'Patient'
    };
    const updated = [newRecord, ...healthRecords];
    syncRecords(updated);

    addNotification(userId, `Document "${name}" uploaded successfully.`, 'record');
    return { success: true };
  };

  const deleteHealthRecord = async (id: string) => {
    const rec = healthRecords.find((r) => r.id === id);
    const name = rec ? rec.name : 'Record';

    const updated = healthRecords.filter((r) => r.id !== id);
    syncRecords(updated);

    addNotification(userId, `Document "${name}" was deleted.`, 'record');
  };

  const placePharmacyOrder = async (pharmacyId: string, items: OrderItem[], prescriptionId?: string, deliveryAddress?: string) => {
    const pharmacy = pharmacies.find((p) => p.id === pharmacyId);
    const pharmacyName = pharmacy?.name || 'Jivexa Partner Pharmacy';
    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    let persistedOrder: Order | null = null;
    try {
      const apiRes = await createPharmacyOrderApi({
        pharmacyId,
        pharmacyName,
        items,
        totalPrice,
        totalAmount: totalPrice,
        deliveryAddress,
        prescriptionId
      });
      if (apiRes.success && apiRes.order) {
        persistedOrder = apiRes.order;
      }
    } catch (e) {}

    const newOrder: Order = persistedOrder || {
      id: `ord_${Date.now()}`,
      patientId: userId,
      patientName: userName,
      pharmacyId,
      pharmacyName,
      status: 'Pending',
      items,
      totalPrice,
      date: new Date().toISOString().split('T')[0],
      prescriptionId
    };
    const updated = [newOrder, ...orders.filter((o) => o.id !== newOrder.id)];
    syncOrders(updated);

    addNotification(userId, `Order placed successfully at ${pharmacyName}. Total: ₹${totalPrice}.`, 'order');
    addNotification(pharmacyId, `New order received from ${userName}.`, 'order');

    return { success: true, order: newOrder };
  };

  const updatePatientProfile = async (data: Partial<PatientProfile>) => {
    if (!patientProfile) return;

    const nowIso = new Date().toISOString();
    const updated = {
      ...patientProfile,
      ...data,
      configuredAt: patientProfile.configuredAt || nowIso,
      updatedAt: nowIso
    };
    setPatientProfile(updated);
    localStorage.setItem(`jivexa_profile_${userId}`, JSON.stringify(updated));
    addNotification(userId, 'Health profile updated successfully.', 'system');
  };

  const completeConsultation = async (
    appointmentId: string,
    summary: string,
    meds: Medication[] = [],
    notes = '',
    followUpDate?: string,
    status?: Prescription['status']
  ) => {
    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt) return;

    try {
      await updateAppointmentApi(appointmentId, {
        status: 'Completed',
        consultationSummary: summary
      });
    } catch (e) {}

    const updatedAppts = appointments.map((a) =>
      a.id === appointmentId ? { ...a, status: 'Completed' as const, consultationSummary: summary } : a
    );
    syncAppointments(updatedAppts);

    if (meds.length > 0 || notes || followUpDate) {
      let persistedPres: Prescription | null = null;
      try {
        const presRes = await createPrescriptionApi({
          patientId: appt.patientId,
          patientName: appt.patientName,
          appointmentId: appt.id,
          date: new Date().toISOString().split('T')[0],
          medications: meds,
          notes,
          status: status || 'Issued',
          followUpDate
        });
        if (presRes.success && presRes.prescription) {
          persistedPres = presRes.prescription;
        }
      } catch (e) {}

      const newPrescription: Prescription = persistedPres || {
        id: `pres_${Date.now()}`,
        patientId: appt.patientId,
        patientName: appt.patientName,
        doctorId: appt.doctorId,
        doctorName: appt.doctorName,
        date: new Date().toISOString().split('T')[0],
        medications: meds,
        notes,
        status: status || 'Issued',
        followUpDate
      };
      const updatedPres = [newPrescription, ...prescriptions.filter((p) => p.id !== newPrescription.id)];
      syncPrescriptions(updatedPres);

      if (status === 'Issued' || status === 'Active' || !status) {
        const newRecord: HealthRecord = {
          id: `rec_pres_${Date.now()}`,
          patientId: appt.patientId,
          name: `Prescription from ${appt.doctorName}`,
          type: 'Prescription',
          date: new Date().toISOString().split('T')[0],
          fileName: `prescription_${newPrescription.id}.pdf`,
          fileSize: '45 KB',
          fileUrl: '#',
          uploadedBy: appt.doctorName
        };
        syncRecords([newRecord, ...healthRecords]);
      }
      addNotification(appt.patientId, `New prescription ${status ? status.toLowerCase() : 'issued'} by ${appt.doctorName}.`, 'record');
    }

    addNotification(appt.patientId, `Consultation notes ready for your visit on ${appt.date} with ${appt.doctorName}.`, 'appointment');
    addNotification(appt.doctorId, `Consultation with ${appt.patientName} marked completed.`, 'appointment');
  };

  const updateAppointmentStatus = async (
    id: string,
    status: Appointment['status'],
    extra?: { rejectionReason?: string; consultationSummary?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    const appt = appointments.find((a) => a.id === id);
    const apiRes = await updateAppointmentApi(id, { status, ...(extra || {}) });
    if (!apiRes.success) {
      return { success: false, error: apiRes.error || 'Failed to update appointment status' };
    }

    const updated = appointments.map((a) =>
      a.id === id ? (apiRes.appointment || { ...a, status, ...(extra || {}) }) : a
    );
    syncAppointments(updated);
    if (appt) {
      addNotification(appt.patientId, `Appointment status updated to ${status}.`, 'appointment');
      addNotification(appt.doctorId, `Appointment status updated to ${status}.`, 'appointment');
    }
    return { success: true };
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    try {
      await updatePharmacyOrderApi(orderId, { status });
    } catch (e) {}

    const updated = orders.map((o) => (o.id === orderId ? { ...o, status } : o));
    syncOrders(updated);

    addNotification(order.patientId, `Your order status at ${order.pharmacyName} is now: ${status}.`, 'order');
    addNotification(order.pharmacyId, `Order ${orderId} updated to ${status}.`, 'order');
  };

  const updateInventoryStock = async (itemId: string, stock: number) => {
    const updated = inventory.map((i) => (i.id === itemId ? { ...i, stock } : i));
    syncInventory(updated);
  };

  const markNotificationAsRead = async (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    syncNotifications(updated);
  };

  const markAllNotificationsAsRead = async () => {
    const updated = notifications.map((n) => ({ ...n, isRead: true }));
    syncNotifications(updated);
  };

  const addNotification = async (targetId: string, message: string, type: Notification['type']) => {
    const newNotif: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: targetId,
      message,
      type,
      isRead: false,
      timestamp: new Date().toISOString()
    };

    if (targetId === userId) {
      setNotifications((prev) => {
        const list = [newNotif, ...prev];
        localStorage.setItem(`jivexa_notifications_${userId}`, JSON.stringify(list));
        return list;
      });
    } else {
      const otherSaved = localStorage.getItem(`jivexa_notifications_${targetId}`);
      let otherList: Notification[] = [];
      if (otherSaved) {
        otherList = JSON.parse(otherSaved);
      }
      otherList.unshift(newNotif);
      localStorage.setItem(`jivexa_notifications_${targetId}`, JSON.stringify(otherList));
    }
  };

  // --- JHID & CONSENT MANAGEMENT ---
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);

  const generateOrGetHealthId = (targetUserId: string): string => {
    if (patientProfile && patientProfile.userId === targetUserId && patientProfile.jivexaHealthId) {
      return patientProfile.jivexaHealthId;
    }
    if (user && (user.id === targetUserId || (user as any)._id === targetUserId) && user.healthId) {
      return user.healthId;
    }
    let hash = 0;
    for (let i = 0; i < targetUserId.length; i++) {
      hash = (hash << 5) - hash + targetUserId.charCodeAt(i);
      hash |= 0;
    }
    const positiveHash = Math.abs(hash);
    const numPart = String(((positiveHash * 997 + 100000) % 900000) + 100000);
    return `JIV-2026-${numPart}`;
  };

  const searchPatientByHealthId = async (healthId: string) => {
    const cleanId = healthId.trim().toUpperCase();

    if (patientProfile && (patientProfile.jivexaHealthId === cleanId || generateOrGetHealthId(patientProfile.userId) === cleanId)) {
      return {
        success: true,
        patientInfo: {
          userId: patientProfile.userId,
          name: user?.name || 'Patient User',
          healthId: cleanId,
          bloodGroup: patientProfile.bloodGroup || 'O+ Positive',
          allergies: patientProfile.allergies || 'None logged',
          conditions: patientProfile.conditions || 'None logged',
          consentStatus: 'approved',
          reports: []
        }
      };
    }

    try {
      const apiRes = await searchHealthIdApi(cleanId);
      if (apiRes.success && apiRes.patient) {
        const p = apiRes.patient;
        const chronicStr = Array.isArray(p.healthProfile?.chronicConditions)
          ? p.healthProfile.chronicConditions.join(', ')
          : (p.healthProfile?.chronicConditions || 'None logged');
        const allergiesStr = Array.isArray(p.healthProfile?.allergies)
          ? p.healthProfile.allergies.join(', ')
          : (p.healthProfile?.allergies || 'No known allergies');

        return {
          success: true,
          patientInfo: {
            userId: p.email || `usr_patient_${cleanId.replace(/[^A-Z0-9]/g, '')}`,
            name: p.name || 'Patient User',
            healthId: apiRes.healthId || cleanId,
            bloodGroup: p.bloodGroup || 'O+',
            allergies: allergiesStr,
            conditions: chronicStr,
            consentStatus: 'pending',
            reports: []
          }
        };
      }
    } catch (err) {
      console.error('Error calling searchHealthIdApi in HealthDataContext:', err);
    }

    return {
      success: false,
      error: `Health ID "${cleanId}" not found in patient registry.`
    };
  };

  const requestPatientAccess = async (healthId: string) => {
    const cleanId = healthId.trim().toUpperCase();
    const searchRes = await searchPatientByHealthId(cleanId);
    if (!searchRes.success || !searchRes.patientInfo) {
      return { success: false, error: (searchRes as any).error || 'Patient not found.' };
    }

    const targetPatientId = searchRes.patientInfo.userId;
    const docName = user?.name || 'Dr. Practitioner';

    const newReq: AccessRequest = {
      id: `req_${Date.now()}`,
      patientId: targetPatientId,
      patientName: searchRes.patientInfo.name,
      doctorId: userId,
      doctorName: docName,
      doctorSpecialty: user?.professionalDetails?.specialization || 'Specialist Physician',
      status: 'pending',
      createdAt: new Date().toISOString(),
      healthId: cleanId
    };

    setAccessRequests((prev) => [newReq, ...prev.filter((r) => !(r.patientId === targetPatientId && r.doctorId === userId))]);
    addNotification(targetPatientId, `${docName} requested access to your JIVEXA Health ID summary (${cleanId}).`, 'security');
    return { success: true };
  };

  const respondAccessRequest = async (requestId: string, newStatus: 'approved' | 'rejected') => {
    const targetReq = accessRequests.find((r) => r.id === requestId);
    setAccessRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: newStatus } : r)));

    if (targetReq) {
      addNotification(targetReq.doctorId, `Patient ${targetReq.patientName} ${newStatus} your health record access request.`, 'security');
    }

    return { success: true };
  };

  const revokeDoctorAccess = async (doctorId: string) => {
    setAccessRequests((prev) => prev.map((r) => (r.patientId === userId && r.doctorId === doctorId ? { ...r, status: 'rejected' } : r)));
    addNotification(doctorId, `Patient ${userName} revoked your access to their JIVEXA Health ID summary.`, 'security');
    return { success: true };
  };

  // --- ACCESS LOGGING & EMERGENCY MODE ---
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);

  const logAccess = (healthId: string, accessorRole: AccessLog['accessorRole'], accessType: AccessLog['accessType'], targetPatientId?: string) => {
    const newLog: AccessLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      patientId: targetPatientId,
      healthId,
      accessorRole,
      accessType,
      accessedAt: new Date().toISOString()
    };
    setAccessLogs((prev) => [newLog, ...prev]);
  };

  const getPublicHealthIdProfile = async (healthId: string) => {
    const cleanId = healthId.trim().toUpperCase();
    logAccess(cleanId, user ? (user.role as any) : 'PUBLIC', 'PUBLIC_EMERGENCY_LOOKUP');

    if (patientProfile && (patientProfile.jivexaHealthId === cleanId || generateOrGetHealthId(patientProfile.userId) === cleanId)) {
      const rawName = user?.name || 'Patient';
      const nameParts = rawName.split(' ');
      const maskedName = nameParts.map((p) => p.charAt(0) + '*'.repeat(Math.max(1, p.length - 1))).join(' ');
      const rawPhone = user?.phone || '';
      const maskedPhone = rawPhone.length > 6 ? rawPhone.substring(0, 6) + '*****' + rawPhone.slice(-2) : rawPhone;

      return {
        success: true,
        publicProfile: {
          healthId: cleanId,
          maskedName,
          age: user?.age || null,
          gender: user?.gender || 'Unspecified',
          bloodGroup: patientProfile.bloodGroup || 'O+ Positive',
          allergies: patientProfile.allergies || 'None logged',
          maskedEmergencyContact: maskedPhone,
          emergencySharingEnabled: patientProfile.emergencySharingEnabled || false,
          emergencyAccessExpiry: patientProfile.emergencyAccessExpiry || null,
          lastUpdated: new Date().toISOString().split('T')[0]
        }
      };
    }

    return { success: false, error: 'No patient record found for this JIVEXA Health ID.' };
  };

  const toggleEmergencyAccessMode = async (enabled: boolean, durationHours: number = 24) => {
    const expiry = enabled ? new Date(Date.now() + durationHours * 3600000).toISOString() : undefined;

    setPatientProfile((prev) =>
      prev
        ? {
            ...prev,
            emergencySharingEnabled: enabled,
            emergencyAccessExpiry: expiry
          }
        : null
    );

    addNotification(userId, `Instant Emergency Access Mode was ${enabled ? 'ENABLED' : 'DISABLED'}.`, 'security');
    return { success: true };
  };

  // --- AMBULANCE NETWORK STATE & OPERATIONS (Preserved for compatibility) ---
  const [ambulances, setAmbulances] = useState<AmbulanceVehicle[]>([]);
  const [ambulanceBookings, setAmbulanceBookings] = useState<AmbulanceBooking[]>([]);

  const bookAmbulance = async (details: { ambulanceType: 'Basic' | 'Oxygen' | 'ICU' | 'ALS'; pickupAddress: string; destinationAddress: string; pickupLat: number; pickupLng: number; destLat: number; destLng: number; fare: number }) => {
    const apiRes = await createAmbulanceRequestApi({
      ambulanceType: details.ambulanceType,
      pickupAddress: details.pickupAddress,
      destinationAddress: details.destinationAddress,
      pickupLat: details.pickupLat,
      pickupLng: details.pickupLng,
      destLat: details.destLat,
      destLng: details.destLng,
      fare: details.fare,
      jivexaHealthId: patientProfile?.jivexaHealthId || generateOrGetHealthId(userId)
    });
    if (!apiRes.success || !apiRes.booking) {
      return { success: false };
    }
    const updated = [apiRes.booking, ...ambulanceBookings];
    syncAmbulanceBookings(updated);
    return { success: true, booking: apiRes.booking };
  };

  const updateAmbulanceBookingStatus = async (bookingId: string, newStatus: AmbulanceBooking['status']) => {
    await updateAmbulanceRequestApi(bookingId, { status: newStatus }).catch(() => {});
    const updated = ambulanceBookings.map((b) =>
      b.id === bookingId
        ? { ...b, status: newStatus, completedAt: newStatus === 'Completed' ? new Date().toISOString() : b.completedAt }
        : b
    );
    syncAmbulanceBookings(updated);
    return { success: true };
  };

  const toggleAmbulanceAvailability = async (ambulanceId: string, availability: AmbulanceVehicle['availability']) => {
    setAmbulances((prev) => prev.map((a) => (a.id === ambulanceId || a.partnerId === userId ? { ...a, availability } : a)));
    return { success: true };
  };

  return (
    <HealthDataContext.Provider
      value={{
        doctors,
        doctorsLoading,
        pharmacies,
        appointments,
        healthRecords,
        prescriptions,
        orders,
        inventory,
        notifications,
        healthGoals,
        patientProfile: patientProfile ? { ...patientProfile, jivexaHealthId: patientProfile.jivexaHealthId || generateOrGetHealthId(userId) } : null,
        medicalReports,
        sharedReports,
        accessRequests,
        accessLogs,
        ambulances,
        ambulanceBookings,
        refreshDoctors,
        refreshAppointments,
        bookAppointment,
        cancelAppointment,
        rescheduleAppointment,
        uploadHealthRecord,
        deleteHealthRecord,
        placePharmacyOrder,
        updatePatientProfile,
        saveAnalyzedReport,
        deleteMedicalReport,
        shareReportWithDoctor,
        generateOrGetHealthId,
        searchPatientByHealthId,
        getPublicHealthIdProfile,
        toggleEmergencyAccessMode,
        requestPatientAccess,
        respondAccessRequest,
        revokeDoctorAccess,
        bookAmbulance,
        updateAmbulanceBookingStatus,
        toggleAmbulanceAvailability,
        completeConsultation,
        updateAppointmentStatus,
        updateOrderStatus,
        updateInventoryStock,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        addNotification
      }}
    >
      {children}
    </HealthDataContext.Provider>
  );
};

export const useHealthData = () => {
  const context = useContext(HealthDataContext);
  if (context === undefined) {
    throw new Error('useHealthData must be used within a HealthDataProvider');
  }
  return context;
};
