/**
 * JIVEXA Health AI - Medical Safety & Emergency Screening Engine
 * 
 * Enforces healthcare safety guardrails:
 * - Immediate emergency triage & escalation (108/112/Tele-MANAS)
 * - Strict prohibition of definitive medical diagnosis
 * - Strict prohibition of unauthorized prescription drug dosing / regimen alteration
 * - Communication of clinical uncertainty and missing information
 * - Emergency first-aid guidance without replacing in-person clinical care
 */

const URGENCY_LEVELS = {
  EMERGENCY: 'emergency',
  HIGH_PRIORITY: 'high_priority',
  ROUTINE: 'routine',
  SELF_CARE: 'self_care',
  INFORMATIONAL: 'informational'
};

// Emergency hotlines (India-centric with global fallback)
const EMERGENCY_CONTACTS = {
  nationalEmergency: '112',
  ambulance: '108',
  maternalChild: '102',
  mentalHealthHelpline: '14416 (Tele-MANAS) / 9152987821 (Vandrevala Foundation)',
  poisonControl: '1800-116-117 (National Poisons Information Centre, AIIMS)'
};

// Emergency clinical triggers
const EMERGENCY_SYMPTOM_TRIGGERS = [
  {
    regex: /\b(chest pain|pressure in chest|crushing chest|radiating to left arm|radiating to jaw|heart attack|angina)\b/i,
    condition: 'Potential Acute Coronary Syndrome / Myocardial Infarction',
    guidance: 'Call 108/112 immediately. Chew an aspirin (if not allergic and advised by emergency services). Rest in a semi-upright position. Do NOT drive yourself to the hospital.'
  },
  {
    regex: /\b(severe difficulty breathing|cannot breathe|suffocating|choking|gasping for air|turning blue|cyanosis)\b/i,
    condition: 'Acute Respiratory Distress / Severe Airway Obstruction',
    guidance: 'Call 108/112 immediately. Sit upright, loosen tight clothing around neck/chest. Do not lie flat.'
  },
  {
    regex: /\b(stroke|face drooping|facial droop|slurred speech|speech difficulty|arm weakness|hemiparesis|sudden loss of vision|sudden numbness on one side)\b/i,
    condition: 'Suspected Acute Stroke (FAST)',
    guidance: 'Call 108/112 immediately. Note the exact time symptoms started. Stroke is time-critical; thrombolytic therapy must begin within the golden window (typically 3-4.5 hours).'
  },
  {
    regex: /\b(severe bleeding|uncontrolled bleeding|hemorrhage|vomiting blood|hematemesis|coughing blood|hemoptysis)\b/i,
    condition: 'Severe Hemorrhage / Active Internal or External Bleeding',
    guidance: 'Apply firm, continuous direct pressure with a clean cloth. Elevate injured limb if possible. Seek emergency transport immediately.'
  },
  {
    regex: /\b(anaphylaxis|throat swelling|swollen tongue|swollen lips|hives.*difficulty breathing|allergic reaction.*breathing)\b/i,
    condition: 'Severe Anaphylactic Reaction',
    guidance: 'Administer Epinephrine auto-injector (EpiPen) immediately into the outer thigh if prescribed. Call 108/112 without delay. Lie flat with legs elevated unless breathing is difficult.'
  },
  {
    regex: /\b(unconscious|passed out|fainted.*not waking up|blackout.*not breathing|seizure.*lasting more than 5 minutes|status epilepticus)\b/i,
    condition: 'Altered Mental Status / Prolonged Seizure',
    guidance: 'Call 108/112 immediately. Place in the recovery position on their side. Do not put anything in their mouth. Clear surrounding hazards.'
  },
  {
    regex: /\b(suicide|kill myself|end my life|want to die|suicidal thoughts|hanging myself|swallow pills.*kill)\b/i,
    condition: 'Acute Psychiatric Emergency / Self-Harm Crisis',
    guidance: 'Please reach out immediately. You are not alone. Call Tele-MANAS (14416) or Vandrevala Foundation (9152987821) free 24/7. Please go to the nearest emergency room or stay with a trusted person.'
  },
  {
    regex: /\b(swallowed poison|pesticide|rat poison|snake bite|toxic substance|chemical ingestion)\b/i,
    condition: 'Acute Poisoning / Envenomation',
    guidance: 'Call 108/112 immediately. For snakebite: keep the bitten limb immobilized below heart level; do NOT cut, suction, or apply a tight tourniquet. Keep the container/picture of the substance if safe to do so.'
  }
];

// High priority (Urgent - within 12-24 hours) triggers
const HIGH_PRIORITY_TRIGGERS = [
  /\b(high fever.*(103|104|105)|fever in infant|fever lasting.*more than (3|4|5) days)\b/i,
  /\b(acute severe abdominal pain|sudden severe stomach pain|rigid abdomen|guarding)\b/i,
  /\b(sudden vision loss|severe eye pain|flashes of light with floaters)\b/i,
  /\b(deep cut|puncture wound|animal bite|dog bite|monkey bite|suspected rabies)\b/i,
  /\b(suspected fracture|bone sticking out|inability to bear weight after fall)\b/i,
  /\b(diabetic ketoacidosis|blood sugar > (350|400)|fruity breath.*confusion)\b/i,
  /\b(severe headache.*worst headache of life|thunderclap headache|stiff neck.*fever)\b/i
];

/**
 * Screens user input and clinical context for red flags and determines urgency level.
 * 
 * @param {string} text - User message or query
 * @param {Object} context - Optional patient context
 * @returns {Object} Triage result
 */
const screenEmergency = (text = '', context = {}) => {
  const query = String(text || '');

  // 1. Check emergency triggers
  for (const trigger of EMERGENCY_SYMPTOM_TRIGGERS) {
    if (trigger.regex.test(query)) {
      return {
        isEmergency: true,
        urgencyLevel: URGENCY_LEVELS.EMERGENCY,
        identifiedCondition: trigger.condition,
        guidance: trigger.guidance,
        emergencyContacts: EMERGENCY_CONTACTS,
        requiresImmediateAction: true
      };
    }
  }

  // 2. Check high-priority triggers
  for (const pattern of HIGH_PRIORITY_TRIGGERS) {
    if (pattern.test(query)) {
      return {
        isEmergency: false,
        urgencyLevel: URGENCY_LEVELS.HIGH_PRIORITY,
        identifiedCondition: 'Urgent Medical Attention Recommended',
        guidance: 'Consult a qualified physician or visit an urgent care / casualty department within 12-24 hours.',
        emergencyContacts: EMERGENCY_CONTACTS,
        requiresImmediateAction: false
      };
    }
  }

  return {
    isEmergency: false,
    urgencyLevel: URGENCY_LEVELS.ROUTINE,
    identifiedCondition: null,
    guidance: null,
    emergencyContacts: EMERGENCY_CONTACTS,
    requiresImmediateAction: false
  };
};

/**
 * Standard medical disclaimer template to ensure clinical and legal compliance.
 */
const STANDARD_MEDICAL_DISCLAIMER = 
  "JIVEXA Health AI is an educational clinical assistant and does not provide formal medical diagnosis, individualized treatment plans, or emergency care. In medical emergencies, contact 108 or 112 immediately. Always consult a licensed healthcare practitioner before starting, stopping, or altering any medication or treatment regimen.";

/**
 * Generates an emergency structured response payload when critical red flags are detected.
 * 
 * @param {Object} triageResult - Result from screenEmergency
 * @param {string} userQuery - Original query
 * @returns {Object} Complete structured emergency response
 */
const buildEmergencyStructuredResponse = (triageResult, userQuery) => {
  return {
    intent: 'EMERGENCY_TRIAGE',
    urgency_level: URGENCY_LEVELS.EMERGENCY,
    answer_summary: `CRITICAL ALERT: Your described symptoms (${triageResult.identifiedCondition || 'acute symptoms'}) require IMMEDIATE emergency medical evaluation. Please contact emergency services right now.`,
    key_information: [
      `Potential Acute Condition: ${triageResult.identifiedCondition || 'Medical Emergency'}`,
      `Emergency Services: Call Ambulance at 108 or Central Emergency at 112 immediately.`,
      `First Action: ${triageResult.guidance || 'Seek immediate medical attention at the nearest emergency department.'}`,
      `Do not attempt to drive yourself to the hospital; have an ambulance or someone else transport you.`
    ],
    precautions: [
      "Do NOT delay seeking immediate in-person emergency care.",
      "Do NOT take home remedies, pain medications, or unprescribed drugs until evaluated by an emergency team.",
      "Keep someone near you and unlock your primary entrance so emergency personnel can access you."
    ],
    warning_signs: [
      "Loss of consciousness, fainting, or severe lightheadedness",
      "Worsening difficulty breathing or inability to speak in full sentences",
      "Bluish tint on lips, face, or fingernails (cyanosis)",
      "Sudden weakness, numbness, or inability to move parts of the body",
      "Rapidly spreading severe pain or heavy bleeding"
    ],
    recommended_next_steps: [
      "Dial 108 (Ambulance) or 112 (National Emergency) right away.",
      "If mental health crisis: Call Tele-MANAS at 14416 or Vandrevala Foundation at 9152987821.",
      "Stay calm, sit or lie in a safe position, and await medical first responders.",
      "Keep your emergency Health ID / medication list accessible for paramedics."
    ],
    follow_up_questions: [
      "Are you currently with someone who can assist you?",
      "Have you called 108 or 112 yet?",
      "Do you have any known medical conditions or medications you take regularly?"
    ],
    medical_sources: [
      {
        organization: "World Health Organization (WHO)",
        title: "Emergency Medical Triage and Resuscitation Guidelines",
        url: "https://www.who.int/emergencies",
        verified: true
      },
      {
        organization: "Indian Council of Medical Research (ICMR)",
        title: "Standard Treatment Guidelines for Emergency Care",
        url: "https://www.icmr.gov.in",
        verified: true
      }
    ],
    disclaimer: STANDARD_MEDICAL_DISCLAIMER
  };
};

/**
 * Helper to scrub non-compliant diagnoses and unauthorized dosages from any clinical text field.
 */
const sanitizeClinicalText = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\b(you have|you are suffering from|my diagnosis is)\b/gi, 'your symptoms may indicate')
    .replace(/\b(i diagnose you with|you definitely have)\b/gi, 'possibility of')
    .replace(/\b(stop taking your|discontinue your)\s+([a-z]+)\b/gi, 'do not alter your $2 regimen without consulting your prescribing doctor')
    .replace(/\b(take|consume|use)\s+\d+(?:\.\d+)?\s*(?:mg|ml|tablets?|capsules?|pills?|doses?)\s*(?:daily|twice|thrice|per day|every \d+ hours?)?/gi, 'consult your doctor for precise dosage specifications');
};

/**
 * Audits and sanitizes AI response text to ensure strict safety guardrail compliance:
 * - Eliminates definitive diagnosis statements ("You have X" -> "Symptoms may suggest X, which requires doctor confirmation")
 * - Removes unauthorized dosage recommendations
 * - Eliminates instructions to stop or change prescribed medications
 * 
 * @param {Object} structuredData - Parsed AI output
 * @returns {Object} Cleaned, safety-compliant structured data
 */
const auditResponseSafety = (structuredData) => {
  if (!structuredData || typeof structuredData !== 'object') {
    return structuredData;
  }

  const sanitized = { ...structuredData };

  // Ensure mandatory fields exist
  if (!sanitized.disclaimer) {
    sanitized.disclaimer = STANDARD_MEDICAL_DISCLAIMER;
  }

  // Safety filter for summary
  if (typeof sanitized.answer_summary === 'string') {
    sanitized.answer_summary = sanitizeClinicalText(sanitized.answer_summary);
  }

  // Ensure key_information is an array of sanitized strings
  if (Array.isArray(sanitized.key_information)) {
    sanitized.key_information = sanitized.key_information.map(item => sanitizeClinicalText(String(item)));
  }

  // Ensure precautions is an array
  if (!Array.isArray(sanitized.precautions) || sanitized.precautions.length === 0) {
    sanitized.precautions = [
      "Do not begin or modify medications without professional clinical evaluation.",
      "Monitor your symptoms closely and report any worsening to your physician."
    ];
  } else {
    sanitized.precautions = sanitized.precautions.map(item => sanitizeClinicalText(String(item)));
  }

  // Ensure warning_signs is an array
  if (!Array.isArray(sanitized.warning_signs) || sanitized.warning_signs.length === 0) {
    sanitized.warning_signs = [
      "Sudden worsening of symptoms",
      "High persistent fever or difficulty breathing",
      "Severe or unmanageable pain"
    ];
  }

  // Ensure recommended_next_steps is an array
  if (!Array.isArray(sanitized.recommended_next_steps) || sanitized.recommended_next_steps.length === 0) {
    sanitized.recommended_next_steps = [
      "Consult a licensed medical doctor for clinical examination and definitive care.",
      "Maintain hydration, rest, and track the progression of your symptoms."
    ];
  } else {
    sanitized.recommended_next_steps = sanitized.recommended_next_steps.map(item => sanitizeClinicalText(String(item)));
  }

  return sanitized;
};

module.exports = {
  URGENCY_LEVELS,
  EMERGENCY_CONTACTS,
  screenEmergency,
  buildEmergencyStructuredResponse,
  auditResponseSafety,
  STANDARD_MEDICAL_DISCLAIMER
};
