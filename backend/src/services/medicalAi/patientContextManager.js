/**
 * JIVEXA Health AI - Patient Clinical Context Management Layer
 * 
 * Aggregates and sanitizes patient clinical profile data from MongoDB:
 * - HealthId records (allergies, chronic illnesses, active medications, vitals)
 * - Recent MedicalReport lab test abnormalities
 * - Strict PII scrubbing (removes names, phone numbers, addresses, government IDs)
 * - Injects sanitized clinical context into the AI reasoning prompt
 */

const mongoose = require('mongoose');
const HealthId = require('../../models/HealthId');
const MedicalReport = require('../../models/MedicalReport');

/**
 * Retrieves sanitized clinical background for a given user.
 * 
 * @param {string} userId - User identifier
 * @returns {Promise<Object>} Sanitized clinical context and prompt string
 */
const getPatientClinicalContext = async (userId) => {
  if (!userId || mongoose.connection.readyState !== 1) {
    return {
      hasContext: false,
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
      recentLabAbnormalities: [],
      formattedContextString: 'No prior clinical profile recorded for this patient.'
    };
  }

  try {
    const userIdStr = String(userId);

    // 1. Fetch HealthId profile (Allergies, Chronic Conditions, Medications)
    const healthIdDoc = await HealthId.findOne({ userId: userIdStr }).lean().catch(() => null);

    // 2. Fetch latest medical report with abnormal parameters
    const latestReport = await MedicalReport.findOne({ patientId: userIdStr })
      .sort({ createdAt: -1 })
      .lean()
      .catch(() => null);

    const allergies = healthIdDoc?.healthProfile?.allergies?.filter(Boolean) || [];
    const chronicConditions = healthIdDoc?.healthProfile?.chronicConditions?.filter(Boolean) || [];
    const currentMedications = healthIdDoc?.healthProfile?.currentMedications?.filter(Boolean) || [];
    const bloodPressure = healthIdDoc?.healthProfile?.bloodPressure || null;
    const gender = healthIdDoc?.gender && healthIdDoc.gender !== 'Unspecified' ? healthIdDoc.gender : null;
    const bloodGroup = healthIdDoc?.bloodGroup || null;

    // Extract abnormal lab parameters
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

    // Build concise, PII-sanitized prompt injection
    const promptLines = ['PATIENT CLINICAL CONTEXT (Use for allergy/interaction checks & tailored guidance):'];
    if (gender) promptLines.push(`- Gender: ${gender}`);
    if (bloodGroup) promptLines.push(`- Blood Group: ${bloodGroup}`);
    if (bloodPressure) promptLines.push(`- Recorded BP: ${bloodPressure}`);
    
    if (chronicConditions.length > 0) {
      promptLines.push(`- Chronic Conditions: ${chronicConditions.join(', ')}`);
    } else {
      promptLines.push(`- Chronic Conditions: None recorded`);
    }

    if (allergies.length > 0) {
      promptLines.push(`- KNOWN ALLERGIES (CRITICAL): ${allergies.join(', ')}`);
    } else {
      promptLines.push(`- Known Allergies: None recorded`);
    }

    if (currentMedications.length > 0) {
      promptLines.push(`- Current Medications: ${currentMedications.join(', ')}`);
    } else {
      promptLines.push(`- Current Medications: None recorded`);
    }

    if (recentLabAbnormalities.length > 0) {
      const labsStr = recentLabAbnormalities
        .map(l => `${l.name}: ${l.value} ${l.unit} [${l.flag}]`)
        .join('; ');
      promptLines.push(`- Recent Lab Out-of-Range Markers: ${labsStr}`);
    }

    const formattedContextString = hasContext 
      ? promptLines.join('\n') 
      : 'No prior clinical profile recorded for this patient.';

    return {
      hasContext,
      gender,
      bloodGroup,
      allergies,
      chronicConditions,
      currentMedications,
      recentLabAbnormalities,
      formattedContextString
    };
  } catch (error) {
    console.warn('[patientContextManager] Error retrieving patient clinical context:', error.message);
    return {
      hasContext: false,
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
      recentLabAbnormalities: [],
      formattedContextString: 'No clinical profile available due to temporary database retrieval error.'
    };
  }
};

module.exports = {
  getPatientClinicalContext
};
