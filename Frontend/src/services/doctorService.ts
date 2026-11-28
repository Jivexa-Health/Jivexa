import { getStoredAuthHeaders, safeFetchWithFallback } from './nodeAuthService';

export interface VerifiedDoctor {
  id: string;
  _id?: string;
  roleId?: string;
  name: string;
  avatarUrl?: string;
  qualifications: string;
  specialization: string;
  experienceYears: number;
  clinicName: string;
  clinicAddress: string;
  city: string;
  state?: string;
  pincode?: string;
  location?: {
    type: string;
    coordinates: [number, number];
  } | null;
  distanceKm?: number | null;
  distanceText?: string | null;
  consultationFee: number;
  consultationTypes: ('In-Person' | 'Video')[];
  availableDays: string[];
  availableSlots: string[];
  availabilityText: string;
  slotDurationMinutes?: number;
  about?: string;
  languages?: string[];
  nmcRegistrationNumber?: string;
  stateMedicalCouncil?: string;
  isVerified: boolean;
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface SlotAvailability {
  time: string;
  available: boolean;
}

export interface DoctorSlotsResponse {
  date: string;
  dayName: string;
  dayAvailable: boolean;
  slots: SlotAvailability[];
}

export const fetchApprovedDoctorsApi = async (filters?: {
  search?: string;
  specialization?: string;
  consultationType?: string;
  city?: string;
}): Promise<{ success: boolean; doctors: VerifiedDoctor[]; error?: string }> => {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.specialization && filters.specialization !== 'All') params.set('specialization', filters.specialization);
  if (filters?.consultationType && filters.consultationType !== 'All') params.set('consultationType', filters.consultationType);
  if (filters?.city) params.set('city', filters.city);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await safeFetchWithFallback(`/api/doctors${query}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  if (!res.ok) {
    return { success: false, doctors: [], error: res.data?.error || 'Failed to load verified doctors' };
  }
  return { success: true, doctors: res.data?.doctors || [] };
};

export interface NearbyDoctorsFilter {
  latitude?: number;
  longitude?: number;
  radius?: number;
  specialization?: string;
  search?: string;
  city?: string;
  pincode?: string;
}

export const fetchNearbyDoctorsApi = async (
  filters?: NearbyDoctorsFilter
): Promise<{
  success: boolean;
  doctors: VerifiedDoctor[];
  count?: number;
  radiusKm?: number;
  userLocation?: { latitude: number; longitude: number } | null;
  error?: string;
}> => {
  const params = new URLSearchParams();
  if (filters?.latitude !== undefined && filters?.longitude !== undefined) {
    params.set('lat', String(filters.latitude));
    params.set('lng', String(filters.longitude));
  }
  if (filters?.radius) params.set('radius', String(filters.radius));
  if (filters?.specialization && filters.specialization !== 'All') params.set('specialization', filters.specialization);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.city) params.set('city', filters.city);
  if (filters?.pincode) params.set('pincode', filters.pincode);

  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await safeFetchWithFallback(`/api/doctors/nearby${query}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  if (!res.ok) {
    return { success: false, doctors: [], error: res.data?.error || 'Failed to load nearby doctors' };
  }
  return {
    success: true,
    doctors: res.data?.doctors || [],
    count: res.data?.count,
    radiusKm: res.data?.radiusKm,
    userLocation: res.data?.userLocation
  };
};

export const fetchDoctorProfileApi = async (
  doctorId: string,
  date?: string
): Promise<{ success: boolean; doctor?: VerifiedDoctor; availability?: DoctorSlotsResponse; error?: string }> => {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await safeFetchWithFallback(`/api/doctors/${encodeURIComponent(doctorId)}${query}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });

  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Doctor profile not found' };
  }
  return {
    success: true,
    doctor: res.data?.doctor,
    availability: res.data?.availability
  };
};

export const fetchDoctorSlotsApi = async (
  doctorId: string,
  date: string
): Promise<{ success: boolean; availability?: DoctorSlotsResponse; error?: string }> => {
  const res = await safeFetchWithFallback(
    `/api/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }
  );
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to load slots' };
  }
  return {
    success: true,
    availability: {
      date: res.data.date,
      dayName: res.data.dayName,
      dayAvailable: res.data.dayAvailable,
      slots: res.data.slots || []
    }
  };
};

export const getOwnDoctorProfileApi = async (): Promise<{ success: boolean; profile?: any; error?: string }> => {
  const res = await safeFetchWithFallback('/api/doctor/profile', {
    method: 'GET',
    headers: getStoredAuthHeaders(),
    credentials: 'include'
  });
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to load doctor profile' };
  }
  return { success: true, profile: res.data?.profile };
};

export const updateOwnDoctorProfileApi = async (payload: Record<string, any>): Promise<{ success: boolean; profile?: any; user?: any; error?: string }> => {
  const res = await safeFetchWithFallback('/api/doctor/profile', {
    method: 'PUT',
    headers: getStoredAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to update doctor profile' };
  }
  return { success: true, profile: res.data?.profile, user: res.data?.user };
};

export const getDoctorDashboardApi = async (): Promise<{
  success: boolean;
  stats?: {
    total: number;
    pending: number;
    confirmed: number;
    completed: number;
    rejected: number;
    cancelled: number;
    upcoming: number;
  };
  appointments?: any[];
  sharedReportsCount?: number;
  verificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  isVerified?: boolean;
  doctorProfile?: VerifiedDoctor;
  error?: string;
}> => {
  const res = await safeFetchWithFallback('/api/doctor/dashboard', {
    method: 'GET',
    headers: getStoredAuthHeaders(),
    credentials: 'include'
  });
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to load doctor dashboard' };
  }
  return {
    success: true,
    stats: res.data.stats,
    appointments: res.data.appointments || [],
    sharedReportsCount: res.data.sharedReportsCount || 0,
    verificationStatus: res.data.verificationStatus,
    isVerified: Boolean(res.data.isVerified),
    doctorProfile: res.data.doctorProfile
  };
};

export const getSharedPatientRecordsApi = async (patientId: string): Promise<{ success: boolean; reports?: any[]; error?: string }> => {
  const res = await safeFetchWithFallback(`/api/doctor/patients/${encodeURIComponent(patientId)}/shared-records`, {
    method: 'GET',
    headers: getStoredAuthHeaders(),
    credentials: 'include'
  });
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to load shared patient records' };
  }
  return { success: true, reports: res.data?.reports || [] };
};

export const adminListDoctorsApi = async (): Promise<{ success: boolean; doctors?: any[]; error?: string }> => {
  const res = await safeFetchWithFallback('/api/admin/doctors', {
    method: 'GET',
    headers: getStoredAuthHeaders(),
    credentials: 'include'
  });
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to load doctors list' };
  }
  return { success: true, doctors: res.data?.doctors || [] };
};

export const adminVerifyDoctorApi = async (
  doctorId: string,
  status: 'APPROVED' | 'REJECTED' | 'PENDING',
  notes = ''
): Promise<{ success: boolean; doctor?: any; error?: string }> => {
  const res = await safeFetchWithFallback(`/api/admin/doctors/${encodeURIComponent(doctorId)}/verify`, {
    method: 'PATCH',
    headers: getStoredAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ status, notes })
  });
  if (!res.ok) {
    return { success: false, error: res.data?.error || 'Failed to update doctor verification' };
  }
  return { success: true, doctor: res.data?.doctor };
};
