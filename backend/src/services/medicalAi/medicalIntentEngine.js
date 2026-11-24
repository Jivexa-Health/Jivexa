/**
 * JIVEXA Health AI - Medical Intent Classification Engine
 * 
 * Classifies patient inquiries into standard clinical and operational intents
 * using deterministic linguistic patterns (English, Hindi, Hinglish) and clinical safety rules.
 */

const INTENT_TYPES = {
  EMERGENCY_TRIAGE: 'EMERGENCY_TRIAGE',
  SYMPTOM_ASSESSMENT: 'SYMPTOM_ASSESSMENT',
  MEDICATION_INQUIRY: 'MEDICATION_INQUIRY',
  DRUG_INTERACTION: 'DRUG_INTERACTION',
  ALLERGY_ALERT: 'ALLERGY_ALERT',
  LAB_REPORT_ANALYSIS: 'LAB_REPORT_ANALYSIS',
  GENERAL_HEALTH_EDUCATION: 'GENERAL_HEALTH_EDUCATION',
  PREVENTIVE_WELLNESS: 'PREVENTIVE_WELLNESS',
  NAVIGATIONAL_PLATFORM: 'NAVIGATIONAL_PLATFORM',
  OFF_TOPIC: 'OFF_TOPIC'
};

// Emergency red flag terms
const EMERGENCY_PATTERNS = [
  /\b(chest pain|heart attack|crushing chest|angina)\b/i,
  /\b(difficulty breathing|shortness of breath|cannot breathe|suffocating|choking)\b/i,
  /\b(severe bleeding|uncontrolled bleeding|hemorrhage|coughing blood|vomiting blood)\b/i,
  /\b(loss of consciousness|unconscious|fainted|blackout|passed out|coma)\b/i,
  /\b(stroke|face drooping|facial droop|slurred speech|sudden paralysis|arm weakness)\b/i,
  /\b(seizure|convulsions|epileptic fit)\b/i,
  /\b(swallowed poison|poisoning|snake bite|toxic ingestion|drug overdose)\b/i,
  /\b(suicide|suicidal|kill myself|end my life|self harm)\b/i,
  /\b(severe burn|severe trauma|head injury with vomiting)\b/i
];

// Medication inquiry terms
const MEDICATION_PATTERNS = [
  /\b(dawa|dawaein|tablet|capsule|syrup|injection|medicine|medication|drug|pill|dosage|dose|side effect|contraindication)\b/i,
  /\b(paracetamol|ibuprofen|amoxicillin|metformin|atorvastatin|amlodipine|omeprazole|pantoprazole|azithromycin|aspirin|cetirizine|losartan)\b/i,
  /\b(khana chahiye|kab khaye|kitni bar|before food|after food|how to take|how much to take)\b/i
];

// Drug interaction terms
const INTERACTION_PATTERNS = [
  /\b(interaction|together|saath me|combine|mixing|can i take .* with|dono sath me)\b/i,
  /\b(dono dawa|ek saath le sakte|interact karegi)\b/i
];

// Allergy terms
const ALLERGY_PATTERNS = [
  /\b(allergy|allergic|reaction|rashes|hives|khujli|swelling lips|swelling throat|anaphylaxis)\b/i
];

// Lab report terms
const LAB_REPORT_PATTERNS = [
  /\b(report|lab|blood test|cbc|hemoglobin|hb|wbc|rbc|platelet|tlc|dlc|lipid|cholesterol|sugar|glucose|creatinine|urea|thyroid|tsh|hba1c|urine test|biomarker|reference range|abnormal)\b/i
];

// Symptom terms
const SYMPTOM_PATTERNS = [
  /\b(bukhar|fever|headache|sar dard|pet dard|stomach pain|vomiting|ultiyan|loose motion|diarrhea|cough|khansi|cold|sore throat|gala dard|rash|body ache|badan dard|fatigue|chakkar|dizziness|nausea)\b/i,
  /\b(pain|ache|swelling|cramp|burning|itching|stiffness|discharge|bleeding|numbness|tingling)\b/i,
  /\b(dard hai|takleef hai|problem hai|feel sick|feeling sick|bimar hu)\b/i
];

// Navigational / Platform terms
const NAVIGATIONAL_PATTERNS = [
  /\b(jivexa|website|how to book|doctor appointment|ambulance booking|108|order medicine|pharmacy order|abha|health id|download report|how to use)\b/i
];

/**
 * Classifies the patient's inquiry into a standard clinical intent.
 * 
 * @param {string} userMessage - Raw message text from user
 * @param {Array} history - Prior conversation turns
 * @param {Object} patientContext - Optional patient background profile
 * @returns {Object} { intent: string, confidence: number, isEmergency: boolean, details: string }
 */
const classifyMedicalIntent = (userMessage, history = [], patientContext = null) => {
  const text = String(userMessage || '').trim();
  if (!text) {
    return {
      intent: INTENT_TYPES.OFF_TOPIC,
      confidence: 1.0,
      isEmergency: false,
      details: 'Empty message'
    };
  }

  // 1. Emergency Pre-Screening (Highest priority safety screening)
  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.test(text)) {
      return {
        intent: INTENT_TYPES.EMERGENCY_TRIAGE,
        confidence: 0.99,
        isEmergency: true,
        details: 'Critical emergency keywords detected requiring immediate 108/112 intervention'
      };
    }
  }

  // 2. Drug Interaction Inquiry
  if (INTERACTION_PATTERNS.some(p => p.test(text)) && MEDICATION_PATTERNS.some(p => p.test(text))) {
    return {
      intent: INTENT_TYPES.DRUG_INTERACTION,
      confidence: 0.95,
      isEmergency: false,
      details: 'Inquiry regarding concurrent use or potential drug-drug interaction'
    };
  }

  // 3. Allergy Inquiry / Alert
  if (ALLERGY_PATTERNS.some(p => p.test(text)) && (MEDICATION_PATTERNS.some(p => p.test(text)) || SYMPTOM_PATTERNS.some(p => p.test(text)))) {
    return {
      intent: INTENT_TYPES.ALLERGY_ALERT,
      confidence: 0.92,
      isEmergency: false,
      details: 'Inquiry related to medication or substance allergy reaction'
    };
  }

  // 4. Medication Inquiry
  if (MEDICATION_PATTERNS.some(p => p.test(text))) {
    return {
      intent: INTENT_TYPES.MEDICATION_INQUIRY,
      confidence: 0.90,
      isEmergency: false,
      details: 'Inquiry about medication indications, mechanism, precautions, or safety'
    };
  }

  // 5. Medical Lab Report Analysis
  if (LAB_REPORT_PATTERNS.some(p => p.test(text))) {
    return {
      intent: INTENT_TYPES.LAB_REPORT_ANALYSIS,
      confidence: 0.88,
      isEmergency: false,
      details: 'Inquiry regarding laboratory test findings or biomarker values'
    };
  }

  // 6. Active Symptom Assessment
  if (SYMPTOM_PATTERNS.some(p => p.test(text))) {
    return {
      intent: INTENT_TYPES.SYMPTOM_ASSESSMENT,
      confidence: 0.90,
      isEmergency: false,
      details: 'Patient actively describing clinical symptoms or physical discomfort'
    };
  }

  // 7. Contextual follow-up in ongoing health inquiry
  if (Array.isArray(history) && history.length > 0) {
    const hasPriorHealthContext = history.some(h => {
      const t = String(h.text || h.content || '').toLowerCase();
      return SYMPTOM_PATTERNS.some(p => p.test(t)) || MEDICATION_PATTERNS.some(p => p.test(t)) || LAB_REPORT_PATTERNS.some(p => p.test(t));
    });

    if (hasPriorHealthContext) {
      // Short affirmative or temporal follow-ups ("2 din se", "subah se", "haan", "nahi")
      if (/^(haan|nahi|yes|no|2 din|3 din|kal se|aaj se|subah se|shaam se|\d+\s*(din|hours|days|weeks|months|f|c|degree))\b/i.test(text)) {
        return {
          intent: INTENT_TYPES.SYMPTOM_ASSESSMENT,
          confidence: 0.85,
          isEmergency: false,
          details: 'Contextual follow-up turn in clinical symptom dialogue'
        };
      }
    }
  }

  // 8. Navigational Platform Guide
  if (NAVIGATIONAL_PATTERNS.some(p => p.test(text))) {
    return {
      intent: INTENT_TYPES.NAVIGATIONAL_PLATFORM,
      confidence: 0.95,
      isEmergency: false,
      details: 'Platform navigation or JIVEXA healthcare service query'
    };
  }

  // 9. Default to General Health Education if health-related, or check for off-topic
  return {
    intent: INTENT_TYPES.GENERAL_HEALTH_EDUCATION,
    confidence: 0.75,
    isEmergency: false,
    details: 'General health education or wellness concept inquiry'
  };
};

module.exports = {
  INTENT_TYPES,
  classifyMedicalIntent
};
