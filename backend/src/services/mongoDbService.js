const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/User');
const HealthId = require('../models/HealthId');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const PharmacyOrder = require('../models/PharmacyOrder');
const AmbulanceRequest = require('../models/AmbulanceRequest');
const Conversation = require('../models/Conversation');
const MedicalReport = require('../models/MedicalReport');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const {
  connectDB,
  disconnectDB,
  isMongoConfigured,
  isDatabaseConnected,
  checkDatabaseHealth
} = require('../config/db');

// File-backed local storage file for offline development resilience
const LOCAL_STORE_FILE = path.resolve(__dirname, '../../.local_db.json');

const localStore = {
  users: [],
  healthIds: [],
  sessions: [],
  appointments: [],
  prescriptions: [],
  pharmacyOrders: [],
  ambulanceRequests: [],
  conversations: [],
  medicalReports: [],
  auditLogs: []
};

// Safe bootstrap from file if available
try {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    const raw = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(localStore)) {
      if (Array.isArray(parsed[key])) {
        localStore[key] = parsed[key];
      }
    }
  }
} catch (e) {
  // Silent fallback
}

let saveTimer = null;
const persistLocalStore = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(localStore, null, 2), 'utf8');
    } catch (e) {}
  }, 250);
};

// Helper: simple dot-path getter for localStore filtering
const getByPath = (obj, keyPath) => {
  if (!obj || !keyPath) return undefined;
  return keyPath.split('.').reduce((acc, part) => (acc !== undefined && acc !== null ? acc[part] : undefined), obj);
};

const matchesFilter = (doc, filter = {}) => {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(val)) {
      if (!val.some((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    if (key === '$and' && Array.isArray(val)) {
      if (!val.every((sub) => matchesFilter(doc, sub))) return false;
      continue;
    }
    const docVal = getByPath(doc, key);
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp)) {
      if (Array.isArray(val.$in)) {
        if (!val.$in.map(String).includes(String(docVal))) return false;
      }
      if (val.$ne !== undefined) {
        if (String(docVal) === String(val.$ne)) return false;
      }
      continue;
    }
    if (String(docVal) !== String(val)) return false;
  }
  return true;
};

// Helper: Wrap plain user object to match Mongoose document interface
const wrapUserDoc = (raw) => {
  if (!raw) return null;
  const user = { ...raw };
  user._id = String(raw._id || raw.id || new mongoose.Types.ObjectId());
  user.id = user._id;

  user.toAuthJSON = function () {
    return {
      id: this._id,
      _id: this._id,
      roleId: this.roleId || '',
      name: this.name,
      email: this.email,
      role: this.role || 'PATIENT',
      healthId: this.healthId || '',
      phone: this.phone || '',
      age: this.age !== undefined ? this.age : null,
      dob: this.dob || '',
      gender: this.gender || '',
      address: this.address || '',
      emailVerified: Boolean(this.emailVerified),
      verified: Boolean(this.verified),
      accountStatus: this.accountStatus || 'ACTIVE',
      doctorVerification: this.role === 'DOCTOR' ? (this.doctorVerification || null) : null,
      notificationPreferences: this.notificationPreferences || { inApp: true, email: true, appointmentReminders: true },
      privacySettings: this.privacySettings || { shareHealthSummaryOnBooking: false, allowEmergencyLookup: true, consentLogsEnabled: true },
      professionalDetails: this.professionalDetails || null,
      vehicleDetails: this.vehicleDetails || null,
      licenseDetails: this.licenseDetails || null,
      avatarUrl: this.avatarUrl || this.professionalDetails?.avatarUrl || this.usage?.avatarUrl || '',
      usage: this.usage || { tokenUsed: 0, tokenLimit: 10000, totalTokenUsed: 0 },
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  };

  user.matchPassword = async function (enteredPassword) {
    if (!this.password || !enteredPassword) return false;
    return await bcrypt.compare(enteredPassword, this.password);
  };

  user.isLocked = function () {
    return Boolean(this.lockUntil && new Date(this.lockUntil) > new Date());
  };

  user.save = async function () {
    this.updatedAt = new Date();
    const copy = { ...this };
    delete copy.save;
    delete copy.toAuthJSON;
    delete copy.matchPassword;
    delete copy.isLocked;
    const idx = localStore.users.findIndex((u) => String(u._id || u.id) === String(this._id));
    if (idx !== -1) {
      localStore.users[idx] = copy;
    } else {
      localStore.users.push(copy);
    }
    persistLocalStore();
    return this;
  };

  return user;
};

// Helper: Wrap Appointment plain object to match Mongoose document interface
const wrapAppointmentDoc = (raw) => {
  if (!raw) return null;
  const doc = { ...raw };
  doc._id = String(raw._id || raw.id || new mongoose.Types.ObjectId());
  doc.id = doc._id;

  doc.toJSON = function () {
    const out = { ...this };
    delete out.toJSON;
    delete out.save;
    return out;
  };

  doc.save = async function () {
    this.updatedAt = new Date();
    const copy = { ...this };
    delete copy.toJSON;
    delete copy.save;
    const idx = localStore.appointments.findIndex((a) => String(a._id || a.id) === String(this._id));
    if (idx !== -1) {
      localStore.appointments[idx] = copy;
    } else {
      localStore.appointments.push(copy);
    }
    persistLocalStore();
    return this;
  };

  return doc;
};

// Helper: Wrap HealthId plain object
const wrapHealthIdDoc = (raw) => {
  if (!raw) return null;
  const doc = { ...raw };
  doc._id = String(raw._id || raw.id || new mongoose.Types.ObjectId());
  doc.id = doc._id;
  doc.save = async function () {
    const copy = { ...this };
    delete copy.save;
    const idx = localStore.healthIds.findIndex((h) => String(h._id || h.id) === String(this._id));
    if (idx !== -1) {
      localStore.healthIds[idx] = copy;
    } else {
      localStore.healthIds.push(copy);
    }
    persistLocalStore();
    return this;
  };
  return doc;
};

// Helper: Wrap Session plain object
const wrapSessionDoc = (raw) => {
  if (!raw) return null;
  const doc = { ...raw };
  doc._id = String(raw._id || raw.id || new mongoose.Types.ObjectId());
  doc.id = doc._id;
  doc.save = async function () {
    const copy = { ...this };
    delete copy.save;
    const idx = localStore.sessions.findIndex((s) => String(s.sessionId) === String(this.sessionId));
    if (idx !== -1) {
      localStore.sessions[idx] = copy;
    } else {
      localStore.sessions.push(copy);
    }
    persistLocalStore();
    return this;
  };
  return doc;
};

/**
 * MongoDB Data Access Repository Service
 * Provides idiomatic, unified database access with automated local resilience
 */
const MongoDb = {
  isAvailable() {
    return true;
  },

  // --- USERS ---
  users: {
    async findOne(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          const query = {};
          if (filter.email) {
            query.email = filter.email.toLowerCase().trim();
          }
          if (filter.id || filter._id) {
            query._id = String(filter.id || filter._id);
          }
          if (filter.roleId) {
            query.roleId = String(filter.roleId).trim();
          }
          if (filter.role) {
            query.role = filter.role;
          }
          if (filter.healthId) {
            if (typeof filter.healthId === 'string') {
              const cleanHid = filter.healthId.toUpperCase().trim();
              query.$or = [
                { healthId: cleanHid },
                { healthId: cleanHid.replace(/[^A-Z0-9]/g, '') }
              ];
            } else {
              query.healthId = filter.healthId;
            }
          }
          if (filter.$or && Array.isArray(filter.$or)) {
            query.$or = filter.$or.map((cond) => {
              if (cond && typeof cond.healthId === 'string') {
                return { ...cond, healthId: cond.healthId.toUpperCase().trim() };
              }
              return cond;
            });
          }
          const user = await User.findOne(query);
          if (user) return user;
        } catch (err) {
          // Fall through to resilient store
        }
      }

      const cleanEmail = filter.email ? filter.email.toLowerCase().trim() : null;
      const targetId = filter.id || filter._id ? String(filter.id || filter._id) : null;
      const targetRoleId = filter.roleId ? String(filter.roleId).trim() : null;
      const cleanHealthId = typeof filter.healthId === 'string' ? filter.healthId.toUpperCase().trim() : null;

      const found = localStore.users.find((u) => {
        if (filter.role && u.role !== filter.role) return false;
        if (cleanEmail) return Boolean(u.email && u.email.toLowerCase().trim() === cleanEmail);
        if (targetId) return String(u._id || u.id) === targetId;
        if (targetRoleId) return Boolean(u.roleId && String(u.roleId).trim() === targetRoleId);
        if (cleanHealthId && u.healthId) {
          const uHid = String(u.healthId).toUpperCase().trim();
          return uHid === cleanHealthId || uHid.replace(/[^A-Z0-9]/g, '') === cleanHealthId.replace(/[^A-Z0-9]/g, '');
        }
        return false;
      });

      return wrapUserDoc(found);
    },

    async findById(id) {
      if (!id) return null;
      return await this.findOne({ _id: String(id) });
    },

    async create(userData) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...userData };
          if (payload.id && !payload._id) {
            payload._id = String(payload.id);
          }
          const created = await User.create(payload);
          return created;
        } catch (err) {
          if (err.code === 11000 || err.name === 'ValidationError' || err.name === 'CastError') throw err;
          // Fall through to resilient store if database went offline
        }
      }

      const payload = { ...userData };
      payload._id = String(payload._id || payload.id || new mongoose.Types.ObjectId());
      payload.id = payload._id;
      payload.createdAt = new Date();
      payload.updatedAt = new Date();

      // Check for duplicate email
      const existing = localStore.users.find(
        (u) => u.email && u.email.toLowerCase().trim() === String(payload.email).toLowerCase().trim()
      );
      if (existing) {
        const dupError = new Error('An account with this email already exists.');
        dupError.code = 11000;
        throw dupError;
      }

      const wrapped = wrapUserDoc(payload);
      localStore.users.push(payload);
      persistLocalStore();
      return wrapped;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await User.find(filter);
        } catch (err) {}
      }
      return localStore.users.filter((u) => matchesFilter(u, filter)).map(wrapUserDoc);
    }
  },

  // --- HEALTH IDS ---
  healthIds: {
    async findOne(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          const query = {};
          if (filter.healthId) {
            if (typeof filter.healthId === 'string') {
              const clean = filter.healthId.toUpperCase().trim();
              query.healthId = clean;
            } else {
              query.healthId = filter.healthId;
            }
          } else if (filter.userId) {
            query.userId = String(filter.userId);
          } else if (filter.$or && Array.isArray(filter.$or)) {
            query.$or = filter.$or.map((cond) => {
              if (cond && typeof cond.healthId === 'string') {
                return { ...cond, healthId: cond.healthId.toUpperCase().trim() };
              }
              return cond;
            });
          }
          const res = await HealthId.findOne(query);
          if (res) return res;
        } catch (err) {}
      }

      const cleanHid = typeof filter.healthId === 'string' ? filter.healthId.toUpperCase().trim() : null;
      const targetUserId = filter.userId ? String(filter.userId) : null;

      const found = localStore.healthIds.find((h) => {
        if (cleanHid && h.healthId && String(h.healthId).toUpperCase().trim() === cleanHid) return true;
        if (targetUserId && String(h.userId) === targetUserId) return true;
        return false;
      });

      return wrapHealthIdDoc(found);
    },

    async findById(id) {
      if (!id) return null;
      return await this.findOne({ _id: String(id) });
    },

    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) {
            payload._id = String(payload.id);
          }
          return await HealthId.create(payload);
        } catch (err) {}
      }

      const payload = { ...data };
      payload._id = String(payload._id || payload.id || new mongoose.Types.ObjectId());
      payload.id = payload._id;
      payload.createdAt = new Date();
      payload.updatedAt = new Date();

      const wrapped = wrapHealthIdDoc(payload);
      localStore.healthIds.push(payload);
      persistLocalStore();
      return wrapped;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await HealthId.find(filter);
        } catch (err) {}
      }
      return localStore.healthIds.filter((h) => matchesFilter(h, filter)).map(wrapHealthIdDoc);
    }
  },

  // --- APPOINTMENTS ---
  appointments: {
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) payload._id = String(payload.id);
          return await Appointment.create(payload);
        } catch (err) {
          if (err.code === 11000 || err.name === 'ValidationError') {
            throw err;
          }
        }
      }

      const activeStatuses = ['Pending', 'Confirmed', 'Upcoming', 'In Consultation'];
      const shouldLockSlot = data.activeSlot !== false && activeStatuses.includes(data.status || 'Pending');
      if (shouldLockSlot) {
        const conflict = localStore.appointments.find(
          (a) =>
            String(a.doctorId) === String(data.doctorId) &&
            String(a.date) === String(data.date) &&
            String(a.time).trim().toLowerCase() === String(data.time).trim().toLowerCase() &&
            a.activeSlot !== false &&
            activeStatuses.includes(a.status)
        );
        if (conflict) {
          const dupError = new Error('This appointment slot is already booked.');
          dupError.code = 11000;
          throw dupError;
        }
      }

      const payload = {
        ...data,
        _id: String(data._id || data.id || new mongoose.Types.ObjectId()),
        activeSlot: shouldLockSlot,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      payload.id = payload._id;
      localStore.appointments.push(payload);
      persistLocalStore();
      return wrapAppointmentDoc(payload);
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Appointment.find(filter).sort({ date: -1, createdAt: -1 });
        } catch (err) {}
      }
      return [...localStore.appointments]
        .filter((a) => matchesFilter(a, filter))
        .reverse()
        .map(wrapAppointmentDoc);
    },

    async findById(id) {
      if (!id) return null;
      if (isDatabaseConnected()) {
        try {
          return await Appointment.findOne({ _id: String(id) });
        } catch (err) {}
      }
      const found = localStore.appointments.find((a) => String(a._id || a.id) === String(id)) || null;
      return wrapAppointmentDoc(found);
    },

    async findOneAndUpdate(filter = {}, update = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Appointment.findOneAndUpdate(filter, update, { new: true });
        } catch (err) {
          if (err.code === 11000 || err.name === 'ValidationError' || err.name === 'CastError') throw err;
        }
      }
      const idx = localStore.appointments.findIndex((a) => matchesFilter(a, filter));
      if (idx === -1) return null;
      const setData = update.$set || update;
      const merged = { ...localStore.appointments[idx], ...setData, updatedAt: new Date() };
      if (merged.activeSlot === true) {
        const activeStatuses = ['Pending', 'Confirmed', 'Upcoming', 'In Consultation'];
        const conflict = localStore.appointments.find(
          (a, i) =>
            i !== idx &&
            String(a.doctorId) === String(merged.doctorId) &&
            String(a.date) === String(merged.date) &&
            String(a.time).trim().toLowerCase() === String(merged.time).trim().toLowerCase() &&
            a.activeSlot !== false &&
            activeStatuses.includes(a.status)
        );
        if (conflict) {
          const dupError = new Error('This appointment slot is already booked.');
          dupError.code = 11000;
          throw dupError;
        }
      }
      localStore.appointments[idx] = merged;
      persistLocalStore();
      return wrapAppointmentDoc(merged);
    },

    async deleteById(id) {
      if (!id) return false;
      if (isDatabaseConnected()) {
        try {
          const res = await Appointment.deleteOne({ _id: String(id) });
          return res.deletedCount > 0;
        } catch (err) {}
      }
      const before = localStore.appointments.length;
      localStore.appointments = localStore.appointments.filter((a) => String(a._id || a.id) !== String(id));
      persistLocalStore();
      return localStore.appointments.length < before;
    }
  },

  // --- PRESCRIPTIONS ---
  prescriptions: {
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) payload._id = String(payload.id);
          return await Prescription.create(payload);
        } catch (err) {}
      }
      const payload = { ...data, _id: String(data._id || data.id || new mongoose.Types.ObjectId()), createdAt: new Date() };
      localStore.prescriptions.push(payload);
      persistLocalStore();
      return payload;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Prescription.find(filter).sort({ date: -1, createdAt: -1 });
        } catch (err) {}
      }
      return [...localStore.prescriptions].filter((p) => matchesFilter(p, filter)).reverse();
    },

    async findById(id) {
      if (!id) return null;
      if (isDatabaseConnected()) {
        try {
          return await Prescription.findOne({ _id: String(id) });
        } catch (err) {}
      }
      return localStore.prescriptions.find((p) => String(p._id || p.id) === String(id)) || null;
    },

    async deleteById(id) {
      if (!id) return false;
      if (isDatabaseConnected()) {
        try {
          const res = await Prescription.deleteOne({ _id: String(id) });
          return res.deletedCount > 0;
        } catch (err) {}
      }
      const before = localStore.prescriptions.length;
      localStore.prescriptions = localStore.prescriptions.filter((p) => String(p._id || p.id) !== String(id));
      persistLocalStore();
      return localStore.prescriptions.length < before;
    }
  },

  // --- PHARMACY ORDERS ---
  pharmacyOrders: {
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) payload._id = String(payload.id);
          return await PharmacyOrder.create(payload);
        } catch (err) {}
      }
      const payload = { ...data, _id: String(data._id || data.id || new mongoose.Types.ObjectId()), createdAt: new Date() };
      localStore.pharmacyOrders.push(payload);
      persistLocalStore();
      return payload;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await PharmacyOrder.find(filter).sort({ createdAt: -1 });
        } catch (err) {}
      }
      return [...localStore.pharmacyOrders].filter((o) => matchesFilter(o, filter)).reverse();
    },

    async findById(id) {
      if (!id) return null;
      if (isDatabaseConnected()) {
        try {
          return await PharmacyOrder.findOne({ _id: String(id) });
        } catch (err) {}
      }
      return localStore.pharmacyOrders.find((p) => String(p._id || p.id) === String(id)) || null;
    },

    async deleteById(id) {
      if (!id) return false;
      if (isDatabaseConnected()) {
        try {
          const res = await PharmacyOrder.deleteOne({ _id: String(id) });
          return res.deletedCount > 0;
        } catch (err) {}
      }
      const before = localStore.pharmacyOrders.length;
      localStore.pharmacyOrders = localStore.pharmacyOrders.filter((p) => String(p._id || p.id) !== String(id));
      persistLocalStore();
      return localStore.pharmacyOrders.length < before;
    }
  },

  // --- AMBULANCE REQUESTS ---
  ambulanceRequests: {
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) payload._id = String(payload.id);
          return await AmbulanceRequest.create(payload);
        } catch (err) {}
      }
      const payload = { ...data, _id: String(data._id || data.id || new mongoose.Types.ObjectId()), createdAt: new Date() };
      localStore.ambulanceRequests.push(payload);
      persistLocalStore();
      return payload;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await AmbulanceRequest.find(filter).sort({ createdAt: -1 });
        } catch (err) {}
      }
      return [...localStore.ambulanceRequests].filter((r) => matchesFilter(r, filter)).reverse();
    },

    async findById(id) {
      if (!id) return null;
      if (isDatabaseConnected()) {
        try {
          return await AmbulanceRequest.findOne({ _id: String(id) });
        } catch (err) {}
      }
      return localStore.ambulanceRequests.find((a) => String(a._id || a.id) === String(id)) || null;
    },

    async deleteById(id) {
      if (!id) return false;
      if (isDatabaseConnected()) {
        try {
          const res = await AmbulanceRequest.deleteOne({ _id: String(id) });
          return res.deletedCount > 0;
        } catch (err) {}
      }
      const before = localStore.ambulanceRequests.length;
      localStore.ambulanceRequests = localStore.ambulanceRequests.filter((a) => String(a._id || a.id) !== String(id));
      persistLocalStore();
      return localStore.ambulanceRequests.length < before;
    }
  },

  // --- CONVERSATIONS ---
  conversations: {
    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Conversation.find(filter).sort({ lastUpdated: -1 });
        } catch (err) {}
      }
      return [...localStore.conversations].filter((c) => matchesFilter(c, filter)).reverse();
    },

    async findById(id) {
      if (!id) return null;
      if (isDatabaseConnected()) {
        try {
          return await Conversation.findOne({ _id: String(id) });
        } catch (err) {}
      }
      return localStore.conversations.find((c) => String(c._id || c.id) === String(id)) || null;
    },

    async findOne(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Conversation.findOne(filter);
        } catch (err) {}
      }
      return localStore.conversations.find((c) => {
        if (filter._id && String(c._id || c.id) !== String(filter._id)) return false;
        if (filter.userId && String(c.userId) !== String(filter.userId)) return false;
        return true;
      }) || null;
    },

    async upsert(id, userId, data) {
      if (isDatabaseConnected()) {
        try {
          const existing = await Conversation.findOne({ _id: String(id) });
          if (existing && String(existing.userId) !== String(userId)) {
            throw new Error('Unauthorized conversation update');
          }
          const payload = { ...data, userId: String(userId), lastUpdated: new Date() };
          return await Conversation.findOneAndUpdate(
            { _id: String(id), userId: String(userId) },
            { $set: payload },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        } catch (err) {
          if (err.message === 'Unauthorized conversation update') throw err;
        }
      }
      const idx = localStore.conversations.findIndex((c) => String(c._id || c.id) === String(id));
      if (idx !== -1 && String(localStore.conversations[idx].userId) !== String(userId)) {
        throw new Error('Unauthorized conversation update');
      }
      const payload = { ...data, _id: String(id), id: String(id), userId: String(userId), lastUpdated: new Date() };
      if (idx !== -1) {
        localStore.conversations[idx] = { ...localStore.conversations[idx], ...payload };
      } else {
        localStore.conversations.push(payload);
      }
      persistLocalStore();
      return payload;
    },

    async deleteById(id, userId) {
      if (!id) return false;
      if (isDatabaseConnected()) {
        try {
          const query = { _id: String(id) };
          if (userId) query.userId = String(userId);
          const res = await Conversation.deleteOne(query);
          return res.deletedCount > 0;
        } catch (err) {}
      }
      const before = localStore.conversations.length;
      localStore.conversations = localStore.conversations.filter(
        (c) => !(String(c._id || c.id) === String(id) && (!userId || String(c.userId) === String(userId)))
      );
      persistLocalStore();
      return localStore.conversations.length < before;
    },

    async deleteMany(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Conversation.deleteMany(filter);
        } catch (err) {}
      }
      const before = localStore.conversations.length;
      if (filter.userId) {
        localStore.conversations = localStore.conversations.filter(
          (c) => String(c.userId) !== String(filter.userId)
        );
      } else {
        localStore.conversations = [];
      }
      persistLocalStore();
      return { acknowledged: true, deletedCount: before - localStore.conversations.length };
    }
  },

  // --- MEDICAL REPORTS ---
  medicalReports: {
    resetTestReports() {
      localStore.medicalReports = [];
      persistLocalStore();
    },
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) payload._id = String(payload.id);
          const existing = await MedicalReport.findOne({ _id: payload._id });
          if (existing) {
            if (payload.patientId && String(existing.patientId) !== String(payload.patientId)) {
              throw new Error('Unauthorized report update');
            }
            return await MedicalReport.findOneAndUpdate({ _id: payload._id }, payload, { new: true });
          }
          return await MedicalReport.create(payload);
        } catch (err) {
          if (err.message === 'Unauthorized report update') throw err;
        }
      }
      const payload = { ...data, _id: String(data._id || data.id || new mongoose.Types.ObjectId()), createdAt: new Date() };
      const idx = localStore.medicalReports.findIndex(m => String(m._id || m.id) === String(payload._id));
      if (idx >= 0) {
        if (payload.patientId && localStore.medicalReports[idx].patientId && String(localStore.medicalReports[idx].patientId) !== String(payload.patientId)) {
          throw new Error('Unauthorized report update');
        }
        localStore.medicalReports[idx] = payload;
      } else {
        localStore.medicalReports.push(payload);
      }
      persistLocalStore();
      return payload;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await MedicalReport.find(filter).sort({ createdAt: -1 });
        } catch (err) {}
      }
      return [...localStore.medicalReports].filter(m => {
        if (filter.patientId && String(m.patientId) !== String(filter.patientId)) return false;
        if (filter['sharedWithDoctors.doctorId']) {
          const docId = filter['sharedWithDoctors.doctorId'];
          return Array.isArray(m.sharedWithDoctors) && m.sharedWithDoctors.some(d => String(d.doctorId) === String(docId));
        }
        return true;
      }).reverse();
    },

    async findById(id) {
      if (!id) return null;
      if (isDatabaseConnected()) {
        try {
          return await MedicalReport.findOne({ _id: String(id) });
        } catch (err) {}
      }
      return localStore.medicalReports.find((m) => String(m._id || m.id) === String(id)) || null;
    },

    async findOne(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await MedicalReport.findOne(filter);
        } catch (err) {}
      }
      return localStore.medicalReports.find((m) => {
        if (filter._id && String(m._id || m.id) !== String(filter._id)) return false;
        if (filter.patientId && String(m.patientId) !== String(filter.patientId)) return false;
        return true;
      }) || null;
    },

    async shareWithDoctor(reportId, patientId, doctorData) {
      if (isDatabaseConnected()) {
        try {
          const existingReport = await MedicalReport.findOne({ _id: String(reportId), patientId: String(patientId) });
          if (!existingReport) return null;
          const alreadyShared = Array.isArray(existingReport.sharedWithDoctors) &&
            existingReport.sharedWithDoctors.some((d) => String(d.doctorId) === String(doctorData.doctorId));
          if (alreadyShared) return existingReport;
          return await MedicalReport.findOneAndUpdate(
            { _id: String(reportId), patientId: String(patientId) },
            {
              $push: {
                sharedWithDoctors: {
                  doctorId: String(doctorData.doctorId),
                  doctorName: doctorData.doctorName || 'Doctor',
                  sharedAt: new Date(),
                  reviewStatus: 'Pending Review'
                }
              }
            },
            { new: true }
          );
        } catch (err) {}
      }
      const r = localStore.medicalReports.find(
        (m) => String(m._id || m.id) === String(reportId) && String(m.patientId) === String(patientId)
      );
      if (r) {
        r.sharedWithDoctors = r.sharedWithDoctors || [];
        if (!r.sharedWithDoctors.some((d) => String(d.doctorId) === String(doctorData.doctorId))) {
          r.sharedWithDoctors.push({
            doctorId: String(doctorData.doctorId),
            doctorName: doctorData.doctorName || 'Doctor',
            sharedAt: new Date(),
            reviewStatus: 'Pending Review'
          });
          persistLocalStore();
        }
      }
      return r;
    },

    async revokeDoctorAccess(reportId, patientId, doctorId) {
      if (isDatabaseConnected()) {
        try {
          return await MedicalReport.findOneAndUpdate(
            { _id: String(reportId), patientId: String(patientId) },
            { $pull: { sharedWithDoctors: { doctorId: String(doctorId) } } },
            { new: true }
          );
        } catch (err) {}
      }
      const r = localStore.medicalReports.find(
        (m) => String(m._id || m.id) === String(reportId) && String(m.patientId) === String(patientId)
      );
      if (r && Array.isArray(r.sharedWithDoctors)) {
        r.sharedWithDoctors = r.sharedWithDoctors.filter((d) => String(d.doctorId) !== String(doctorId));
        persistLocalStore();
      }
      return r;
    },

    async deleteById(id, patientId) {
      if (!id) return false;
      if (isDatabaseConnected()) {
        try {
          const query = { _id: String(id) };
          if (patientId) query.patientId = String(patientId);
          const res = await MedicalReport.deleteOne(query);
          return res.deletedCount > 0;
        } catch (err) {}
      }
      const before = localStore.medicalReports.length;
      localStore.medicalReports = localStore.medicalReports.filter(
        (m) => !(String(m._id || m.id) === String(id) && (!patientId || String(m.patientId) === String(patientId)))
      );
      persistLocalStore();
      return localStore.medicalReports.length < before;
    }
  },

  // --- SESSIONS ---
  sessions: {
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          const payload = { ...data };
          if (payload.id && !payload._id) payload._id = String(payload.id);
          return await Session.create(payload);
        } catch (err) {}
      }
      const payload = { ...data, _id: String(data._id || data.id || new mongoose.Types.ObjectId()), createdAt: new Date() };
      const wrapped = wrapSessionDoc(payload);
      localStore.sessions.push(payload);
      persistLocalStore();
      return wrapped;
    },

    async findOne(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          const s = await Session.findOne(filter);
          if (s) return s;
        } catch (err) {}
      }
      const found = localStore.sessions.find((s) => {
        if (filter.sessionId && String(s.sessionId) !== String(filter.sessionId)) return false;
        if (filter.userId && String(s.userId) !== String(filter.userId)) return false;
        if (filter.isRevoked !== undefined && Boolean(s.isRevoked) !== Boolean(filter.isRevoked)) return false;
        return true;
      });
      return wrapSessionDoc(found);
    },

    async find(filter = {}, sort = { lastActive: -1 }) {
      if (isDatabaseConnected()) {
        try {
          return await Session.find(filter).sort(sort);
        } catch (err) {}
      }
      const matched = localStore.sessions.filter((s) => {
        if (filter.userId && String(s.userId) !== String(filter.userId)) return false;
        if (filter.isRevoked !== undefined && Boolean(s.isRevoked) !== Boolean(filter.isRevoked)) return false;
        return true;
      });
      return matched.map(wrapSessionDoc);
    },

    async updateOne(filter = {}, update = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Session.updateOne(filter, update);
        } catch (err) {}
      }
      const s = localStore.sessions.find((sess) => {
        if (filter.sessionId && String(sess.sessionId) !== String(filter.sessionId)) return false;
        if (filter.userId && String(sess.userId) !== String(filter.userId)) return false;
        return true;
      });
      if (s && update.$set) {
        Object.assign(s, update.$set);
        persistLocalStore();
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    },

    async updateMany(filter = {}, update = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Session.updateMany(filter, update);
        } catch (err) {}
      }
      let count = 0;
      for (const s of localStore.sessions) {
        if (filter.userId && String(s.userId) !== String(filter.userId)) continue;
        if (filter.isRevoked !== undefined && Boolean(s.isRevoked) !== Boolean(filter.isRevoked)) continue;
        if (filter.sessionId && filter.sessionId.$ne && String(s.sessionId) === String(filter.sessionId.$ne)) continue;
        if (update.$set) {
          Object.assign(s, update.$set);
          count++;
        }
      }
      if (count > 0) persistLocalStore();
      return { modifiedCount: count };
    },

    async deleteOne(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await Session.deleteOne(filter);
        } catch (err) {}
      }
      const before = localStore.sessions.length;
      localStore.sessions = localStore.sessions.filter((s) => {
        if (filter.sessionId && String(s.sessionId) === String(filter.sessionId)) return false;
        return true;
      });
      persistLocalStore();
      return { deletedCount: before - localStore.sessions.length };
    }
  },

  // --- AUDIT LOGS ---
  auditLogs: {
    async create(data) {
      if (isDatabaseConnected()) {
        try {
          return await AuditLog.create(data);
        } catch (err) {}
      }
      const payload = {
        ...data,
        _id: String(data._id || `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        createdAt: new Date()
      };
      localStore.auditLogs.push(payload);
      if (localStore.auditLogs.length > 500) {
        localStore.auditLogs = localStore.auditLogs.slice(-500);
      }
      persistLocalStore();
      return payload;
    },

    async find(filter = {}) {
      if (isDatabaseConnected()) {
        try {
          return await AuditLog.find(filter).sort({ createdAt: -1 }).limit(100);
        } catch (err) {}
      }
      return [...localStore.auditLogs]
        .filter((log) => matchesFilter(log, filter))
        .reverse()
        .slice(0, 100);
    }
  }
};

module.exports = {
  MongoDb,
  db: MongoDb,
  connectDB,
  disconnectDB,
  isMongoConfigured,
  isDatabaseConnected,
  checkDatabaseHealth
};
