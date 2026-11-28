/**
 * JIVEXA Health AI - Medical Safety & Emergency Screening Engine
 *
 * Enforces healthcare safety guardrails:
 * - Immediate emergency triage & escalation (112 / 108 / Tele-MANAS) without delaying questions
 * - Strict prohibition of definitive medical diagnosis
 * - Strict prohibition of unauthorized prescription drug dosing / regimen alteration
 * - Communication of clinical uncertainty and missing information
 * - Maximum 1 follow-up question per response, only when necessary
 */

const { detectLanguageMode } = require('../healthGuardrail');

const URGENCY_LEVELS = {
  EMERGENCY: 'emergency',
  HIGH_PRIORITY: 'high_priority',
  ROUTINE: 'routine',
  SELF_CARE: 'self_care',
  INFORMATIONAL: 'informational'
};

// Emergency hotlines (India-centric)
const EMERGENCY_CONTACTS = {
  nationalEmergency: '112',
  ambulance: '108',
  maternalChild: '102',
  mentalHealthHelpline: '14416 (Tele-MANAS) / 9152987821 (Vandrevala Foundation)',
  poisonControl: '1800-116-117 (National Poisons Information Centre, AIIMS)'
};

// Emergency clinical triggers (English + Hindi/Hinglish)
const EMERGENCY_SYMPTOM_TRIGGERS = [
  {
    regex: /\b(chest pain|pressure in chest|crushing chest|radiating to left arm|radiating to jaw|heart attack|angina|seene mein dard|seene me dard|chhati mein dard|chhati me dard|dil ka daura)\b/i,
    condition: 'Possible Heart or Chest Emergency',
    guidance: 'Call **112** or **108** immediately. Rest in a comfortable semi-upright position and do not drive yourself to the hospital.'
  },
  {
    regex: /\b(severe difficulty breathing|difficulty breathing|shortness of breath|cannot breathe|cant breathe|suffocating|choking|gasping for air|turning blue|cyanosis|saans lene mein dikkat|saans lene me dikkat|saans phoolna|saans nahi aa rahi|dum ghut)\b/i,
    condition: 'Severe Breathing Difficulty',
    guidance: 'Call **112** or **108** immediately. Sit upright, loosen tight clothing around your neck and chest, and stay calm while help arrives.'
  },
  {
    regex: /\b(stroke|face drooping|facial droop|slurred speech|speech difficulty|arm weakness|hemiparesis|sudden loss of vision|sudden numbness on one side|lakwa|chehra tedha)\b/i,
    condition: 'Possible Stroke Warning Signs',
    guidance: 'Call **112** or **108** immediately. Note the exact time symptoms started—rapid hospital care is critical.'
  },
  {
    regex: /\b(severe bleeding|uncontrolled bleeding|hemorrhage|vomiting blood|hematemesis|coughing blood|hemoptysis|zyada khoon|khoon ki ulti)\b/i,
    condition: 'Severe Bleeding Emergency',
    guidance: 'Call **112** or **108** immediately. Apply firm, steady pressure with a clean cloth to external bleeding and go to the nearest emergency room.'
  },
  {
    regex: /\b(anaphylaxis|throat swelling|swollen tongue|swollen lips|hives.*difficulty breathing|allergic reaction.*breathing)\b/i,
    condition: 'Severe Allergic Reaction',
    guidance: 'Call **112** or **108** immediately. Use a prescribed epinephrine auto-injector if available and seek emergency care without delay.'
  },
  {
    regex: /\b(unconscious|loss of consciousness|passed out|fainted.*not waking up|blackout.*not breathing|seizure|status epilepticus|behosh|mirgi ka daura)\b/i,
    condition: 'Unconsciousness or Seizure',
    guidance: 'Call **112** or **108** immediately. Place the person safely on their side, clear nearby hazards, and do not put anything in their mouth.'
  },
  {
    regex: /\b(suicide|kill myself|end my life|want to die|suicidal|self harm|self-harm|hanging myself)\b/i,
    condition: 'Mental Health Crisis',
    guidance: 'Please reach out right now—you are not alone. Call **112** or **Tele-MANAS (14416)** / **Vandrevala Foundation (9152987821)** free 24/7, or stay with a trusted person and visit the nearest emergency room.'
  },
  {
    regex: /\b(swallowed poison|poisoning|pesticide|rat poison|snake bite|saamp ne kata|toxic substance|chemical ingestion|overdose|zeher)\b/i,
    condition: 'Poisoning, Overdose, or Bite Emergency',
    guidance: 'Call **112** or **108** immediately (National Poison Helpline: 1800-116-117). Keep the bitten limb still if it is a snakebite—do not cut or tie a tight band.'
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
 * Screens user input for red flags and determines urgency level.
 */
const screenEmergency = (text = '', context = {}) => {
  const query = String(text || '');

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

  for (const pattern of HIGH_PRIORITY_TRIGGERS) {
    if (pattern.test(query)) {
      return {
        isEmergency: false,
        urgencyLevel: URGENCY_LEVELS.HIGH_PRIORITY,
        identifiedCondition: 'Urgent Medical Attention Recommended',
        guidance: 'Please see a doctor or visit an urgent care clinic within 12-24 hours.',
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

const STANDARD_MEDICAL_DISCLAIMER =
  'This is educational health information and does not replace a licensed doctor. Call 112 for medical emergencies.';

/**
 * Generates an immediate, clear emergency response WITHOUT delaying with follow-up questions.
 */
const buildEmergencyStructuredResponse = (triageResult, userQuery = '') => {
  const lang = detectLanguageMode(userQuery);
  const isHindiLike = lang === 'hindi' || lang === 'hinglish';

  if (isHindiLike) {
    return {
      intent: 'EMERGENCY_TRIAGE',
      response_mode: 'emergency',
      urgency_level: URGENCY_LEVELS.EMERGENCY,
      answer_summary: `URGENT: Aapke bataye lakshan (${triageResult.identifiedCondition || 'emergency sthiti'}) ke liye turant medical madad zaroori hai. Kripya abhi **112** ya **108** par call karein.`,
      key_information: [
        'Turant **112** (Emergency) ya **108** (Ambulance) par call karein.',
        'Nazdeeki hospital ke Emergency department mein turant jayein.',
        'Khud gaadi drive na karein aur kisi saathi ko paas rakhein.'
      ],
      precautions: [
        'Ilaj mein deri na karein aur gharelu upchar ke bharose na rahein.',
        'Bina doctor ki salah ke koi dawa na lein.'
      ],
      warning_signs: [
        'Behoshi, chakkar aana, ya bolne mein dikkat',
        'Saans lene mein zyada takleef ya tezi se badhta dard'
      ],
      recommended_next_steps: [
        'Abhi **112** ya **108** par call karein.',
        'Mental health crisis ho toh Tele-MANAS **14416** par 24/7 free helpline par baat karein.'
      ],
      follow_up_questions: [], // Never delay emergency guidance with questions
      medical_sources: [],
      disclaimer: 'Yeh emergency alert turant sahayta ke liye hai—doctor ya hospital care ka vikalp nahi hai.'
    };
  }

  return {
    intent: 'EMERGENCY_TRIAGE',
    response_mode: 'emergency',
    urgency_level: URGENCY_LEVELS.EMERGENCY,
    answer_summary: `URGENT: Your symptoms (${triageResult.identifiedCondition || 'medical emergency'}) need immediate emergency medical care. Please call **112** or **108** right away.`,
    key_information: [
      triageResult.guidance || 'Call 112 (Emergency) or 108 (Ambulance) immediately and go to the nearest emergency room.',
      'Do not drive yourself—ask someone nearby to help or wait for an ambulance.'
    ],
    precautions: [
      'Do not wait to see if symptoms improve on their own.',
      'Avoid taking unprescribed medicines before an emergency team evaluates you.'
    ],
    warning_signs: [
      'Fainting, confusion, or trouble speaking',
      'Worsening shortness of breath, heavy bleeding, or spreading pain'
    ],
    recommended_next_steps: [
      'Call **112** (National Emergency) or **108** (Ambulance) right now.',
      'For mental health crises, call Tele-MANAS at **14416** or Vandrevala Foundation at **9152987821** (24/7).'
    ],
    follow_up_questions: [], // Never delay emergency guidance with questions
    medical_sources: [],
    disclaimer: STANDARD_MEDICAL_DISCLAIMER
  };
};

/**
 * Scrubs definitive diagnoses, unauthorized dosages, and repetitive disclaimers from text.
 */
const sanitizeClinicalText = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\b(you definitely have|i diagnose you with|my diagnosis is)\b/gi, 'this may be related to')
    .replace(/\b(you have|you are suffering from)\b/gi, 'these signs can sometimes point to')
    .replace(/\b(stop taking your|discontinue your)\s+([a-z]+)\b/gi, 'do not change or stop your $2 without speaking to your doctor')
    .replace(/\b(take|consume|use)\s+\d+(?:\.\d+)?\s*(?:mg|ml|tablets?|capsules?|pills?|doses?)\s*(?:daily|twice|thrice|per day|every \d+ hours?)?/gi, 'check the exact dose with your doctor or pharmacist')
    .replace(/\*?Note:\s*This is educational healthcare information\.[^*\n]*\*?/gi, '')
    .trim();
};

/**
 * Audits and sanitizes structured AI output:
 * - Prevents definitive diagnoses and unauthorized medication dosing
 * - Enforces maximum 1 follow-up question
 * - Preserves natural, concise responses without forcing bloated empty sections
 */
const auditResponseSafety = (structuredData) => {
  if (!structuredData || typeof structuredData !== 'object') {
    return structuredData;
  }

  const sanitized = { ...structuredData };

  if (typeof sanitized.answer_summary === 'string') {
    sanitized.answer_summary = sanitizeClinicalText(sanitized.answer_summary);
  }

  if (Array.isArray(sanitized.key_information)) {
    sanitized.key_information = sanitized.key_information
      .map(item => sanitizeClinicalText(String(item)))
      .filter(Boolean);
  } else {
    sanitized.key_information = [];
  }

  if (Array.isArray(sanitized.precautions)) {
    sanitized.precautions = sanitized.precautions
      .map(item => sanitizeClinicalText(String(item)))
      .filter(Boolean);
  } else {
    sanitized.precautions = [];
  }

  if (Array.isArray(sanitized.warning_signs)) {
    sanitized.warning_signs = sanitized.warning_signs
      .map(item => sanitizeClinicalText(String(item)))
      .filter(Boolean);
  } else {
    sanitized.warning_signs = [];
  }

  if (Array.isArray(sanitized.recommended_next_steps)) {
    sanitized.recommended_next_steps = sanitized.recommended_next_steps
      .map(item => sanitizeClinicalText(String(item)))
      .filter(Boolean);
  } else {
    sanitized.recommended_next_steps = [];
  }

  // Strictly enforce max 1 follow-up question per response (0 for emergency or conversational)
  if (sanitized.urgency_level === 'emergency' || sanitized.response_mode === 'conversational') {
    sanitized.follow_up_questions = [];
  } else if (Array.isArray(sanitized.follow_up_questions)) {
    sanitized.follow_up_questions = sanitized.follow_up_questions
      .map(q => String(q || '').trim())
      .filter(Boolean)
      .slice(0, 1);
  } else {
    sanitized.follow_up_questions = [];
  }

  if (!sanitized.disclaimer && sanitized.response_mode !== 'conversational') {
    sanitized.disclaimer = STANDARD_MEDICAL_DISCLAIMER;
  }

  return sanitized;
};

module.exports = {
  URGENCY_LEVELS,
  EMERGENCY_CONTACTS,
  screenEmergency,
  buildEmergencyStructuredResponse,
  auditResponseSafety,
  sanitizeClinicalText,
  STANDARD_MEDICAL_DISCLAIMER
};
