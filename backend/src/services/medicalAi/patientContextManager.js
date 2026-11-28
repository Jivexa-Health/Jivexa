/**
 * JIVEXA Health AI - Patient Clinical Context Management Layer
 *
 * Optimized for low-latency chat:
 * - Parallel MongoDB queries (HealthId + MedicalReport) with field projection
 * - Short-TTL (60s) in-memory cache per userId to avoid repeated DB round-trips
 * - Strict PII scrubbing before prompt injection
 */

const mongoose = require('mongoose');
const HealthId = require('../../models/HealthId');
const MedicalReport = require('../../models/MedicalReport');

const CONTEXT_CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const contextCache = new Map();

const EMPTY_CONTEXT = {
  hasContext: false,
  allergies: [],
  chronicConditions: [],
  currentMedications: [],
  recentLabAbnormalities: [],
  formattedContextString: 'No prior clinical profile recorded for this patient.'
};

const invalidatePatientContextCache = (userId) => {
  if (userId) contextCache.delete(String(userId));
};

/**
 * Retrieves sanitized clinical background for a given user.
 */
const getPatientClinicalContext = async (userId) => {
  if (!userId || mongoose.connection.readyState !== 1) {
    return EMPTY_CONTEXT;
  }

  const userIdStr = String(userId);
  const cached = contextCache.get(userIdStr);
  if (cached && Date.now() - cached.cachedAt < CONTEXT_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    // Run both lookups in parallel with lean projections for minimum DB latency
    const [healthIdDoc, latestReport] = await Promise.all([
      HealthId.findOne({ userId: userIdStr })
        .select('healthProfile gender bloodGroup')
        .lean()
        .catch(() => null),
      MedicalReport.findOne({ patientId: userIdStr })
        .sort({ createdAt: -1 })
        .select('abnormalFindings parameters')
        .lean()
        .catch(() => null)
    ]);

    const allergies = healthIdDoc?.healthProfile?.allergies?.filter(Boolean) || [];
    const chronicConditions = healthIdDoc?.healthProfile?.chronicConditions?.filter(Boolean) || [];
    const currentMedications = healthIdDoc?.healthProfile?.currentMedications?.filter(Boolean) || [];
    const bloodPressure = healthIdDoc?.healthProfile?.bloodPressure || null;
    const gender = healthIdDoc?.gender && healthIdDoc.gender !== 'Unspecified' ? healthIdDoc.gender : null;
    const bloodGroup = healthIdDoc?.bloodGroup || null;

    const recentLabAbnormalities = [];
    if (latestReport) {
      const abnormalItems = [
        ...(latestReport.abnormalFindings || []),
        ...(latestReport.parameters || []).filter(p => p.flag === 'HIGH' || p.flag === 'LOW' || p.status === 'Abnormal' || p.status === 'Attention')
      ];

      for (const item of abnormalItems.slice(0, 5)) {
        recentLabAbnormalities.push({
          name: item.name,
          value: item.value,
          unit: item.unit || '',
          flag: item.flag || item.status,
          referenceRange: item.referenceRange || ''
        });
      }
    }

    const hasContext = Boolean(
      allergies.length ||
      chronicConditions.length ||
      currentMedications.length ||
      recentLabAbnormalities.length ||
      gender ||
      bloodPressure
    );

    const promptLines = ['PATIENT CONTEXT (use only if relevant):'];
    if (gender) promptLines.push(`- Gender: ${gender}`);
    if (bloodGroup) promptLines.push(`- Blood Group: ${bloodGroup}`);
    if (bloodPressure) promptLines.push(`- BP: ${bloodPressure}`);
    if (chronicConditions.length > 0) promptLines.push(`- Conditions: ${chronicConditions.join(', ')}`);
    if (allergies.length > 0) promptLines.push(`- ALLERGIES: ${allergies.join(', ')}`);
    if (currentMedications.length > 0) promptLines.push(`- Medications: ${currentMedications.join(', ')}`);
    if (recentLabAbnormalities.length > 0) {
      promptLines.push(`- Recent Abnormal Labs: ${recentLabAbnormalities.map(l => `${l.name}: ${l.value} ${l.unit} [${l.flag}]`).join('; ')}`);
    }

    const result = {
      hasContext,
      gender,
      bloodGroup,
      allergies,
      chronicConditions,
      currentMedications,
      recentLabAbnormalities,
      formattedContextString: hasContext ? promptLines.join('\n') : EMPTY_CONTEXT.formattedContextString
    };

    if (contextCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = contextCache.keys().next().value;
      if (oldestKey) contextCache.delete(oldestKey);
    }
    contextCache.set(userIdStr, { cachedAt: Date.now(), value: result });

    return result;
  } catch (error) {
    console.warn('[patientContextManager] Retrieval notice:', error.message);
    return EMPTY_CONTEXT;
  }
};

module.exports = {
  getPatientClinicalContext,
  invalidatePatientContextCache
};
