/**
 * JIVEXA Health OS - Strict Health-Only Guardrail & Safety Engine
 *
 * Multi-Layered Protection:
 * 1. Pre-Model Input Classification & Topic Validation
 * 2. Ambiguity Detection & Safe Clarification Fallback
 * 3. Emergency Triage Detection (112 / 108) across English, Hindi, and Hinglish
 * 4. Language Detection (English / Hindi / Hinglish)
 * 5. Post-Generation Output Integrity Check
 */

const STANDARD_REFUSAL_MESSAGE =
  "I'm JIVEXA Health AI, designed to help with healthcare-related questions. I can assist with symptoms, lab reports, medicine information, and general wellness. How can I help with your health today?";

const STANDARD_AMBIGUOUS_CLARIFICATION =
  "I'm JIVEXA Health AI, designed to help with healthcare-related questions. Could you share a bit more detail about your health, symptom, lab report, or medicine question so I can help?";

// ==============================================================================
// 1. EMERGENCY KEYWORDS (Immediate Redirection to 112 / 108)
// ==============================================================================
const EMERGENCY_KEYWORDS = [
  'chest pain', 'crushing chest', 'heart attack', 'difficulty breathing',
  'shortness of breath', 'cannot breathe', 'cant breathe', 'severe bleeding',
  'unconscious', 'loss of consciousness', 'stroke', 'face drooping',
  'slurred speech', 'paralysis', 'sudden weakness', 'poisoning',
  'swallowed poison', 'choking', 'seizure', 'severe burn', 'head injury',
  'suicide', 'suicidal', 'kill myself', 'end my life', 'self harm', 'self-harm',
  'overdose', 'vomiting blood', 'coughing blood',
  // Hindi / Hinglish emergency phrases
  'seene mein dard', 'seene me dard', 'chhati mein dard', 'chhati me dard',
  'dil ka daura', 'saans lene mein dikkat', 'saans lene me dikkat',
  'saans phoolna', 'saans nahi aa rahi', 'dum ghut', 'behosh',
  'zyada khoon', 'khoon ki ulti', 'mirgi ka daura', 'zeher', 'saamp ne kata'
];

// ==============================================================================
// 2. CONVERSATIONAL & IDENTITY PATTERNS (Greetings, User Name, Role)
// ==============================================================================
const GREETING_PHRASES = [
  'hi', 'hello', 'hey', 'namaste', 'namaskar', 'good morning', 'good afternoon',
  'good evening', 'adaab', 'kem cho', 'vanakkam', 'pranam', 'how are you',
  'kaise ho', 'kaisa hai', 'kya haal hai', 'sup'
];

const IDENTITY_PATTERNS = [
  /who\s+are\s+you/i,
  /tum\s+kaun\s+ho/i,
  /aap\s+kaun\s+ho/i,
  /what\s+can\s+you\s+do/i,
  /aap\s+kya\s+kar\s+sakte\s+ho/i,
  /what\s+is\s+jivexa/i,
  /mera\s+naam/i,
  /mera\s+name/i,
  /what\s+is\s+my\s+name/i,
  /do\s+you\s+know\s+my\s+name/i,
  /my\s+name\s+is/i,
  /call\s+me\s+[A-Za-z]+/i,
  /thank\s+you/i,
  /thanks/i,
  /dhanyawad/i,
  /shukriya/i,
  /\bbye\b/i,
  /\bgoodbye\b/i
];

// ==============================================================================
// 3. EXPLICITLY DISALLOWED NON-HEALTH PATTERNS & KEYWORDS
// ==============================================================================
const PROGRAMMING_KEYWORDS = [
  'javascript', 'typescript', 'java', 'c++', 'c#', 'golang', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'html', 'css', 'sql', 'bash', 'powershell',
  'array', 'arrays', 'tuple', 'tuples', 'dictionary', 'dictionaries', 'linked list',
  'binary tree', 'algorithm', 'algorithms', 'sorting', 'recursion', 'pointer',
  'pointers', 'for loop', 'while loop', 'function', 'variable', 'object-oriented',
  'oop', 'class inheritance', 'compiler', 'interpreter', 'stack trace', 'syntax error',
  'debugging', 'react', 'angular', 'vue', 'nodejs', 'expressjs', 'mongodb query',
  'git commit', 'github', 'pull request', 'api route', 'unit test',
  'regex', 'regular expression', 'leetcode', 'hackerrank', 'code review',
  'npm install', 'pip install', 'null pointer', 'segmentation fault',
  'memory leak', 'node server', 'coding', 'code script', 'write a program',
  'backend code', 'frontend code', 'python script', 'python code', 'write python'
];

const ACADEMIC_MATH_KEYWORDS = [
  'calculus', 'derivative', 'integral', 'differentiation', 'integration',
  'quadratic equation', 'solve for x', 'linear algebra', 'eigenvalue',
  'geometry proof', 'pythagorean theorem', 'trigonometry', 'sin(', 'cos(',
  'matrix multiplication', 'stoichiometry', 'physics homework',
  'chemical equation balancing', 'kinematics problem', 'thermodynamics equation'
];

const OFF_TOPIC_KEYWORDS = [
  'movie review', 'film rating', 'box office', 'celebrity gossip',
  'cricket score', 'ipl match', 'fifa world cup', 'football match',
  'nba finals', 'video game', 'playstation', 'xbox', 'minecraft', 'valorant',
  'fortnite', 'pubg', 'esports', 'gta',
  'cryptocurrency', 'bitcoin', 'ethereum', 'crypto trading', 'stock market',
  'share market', 'invest in stocks', 'business plan', 'startup pitch',
  'marketing strategy', 'balance sheet', 'gdp', 'travel itinerary', 'tourist places',
  'write a poem', 'write an essay', 'essay on', 'tell me a joke', 'funny joke',
  'write a story', 'shayari', 'horoscope', 'astrology prediction',
  'election results', 'political party', 'prime minister', 'parliament',
  'capital of', 'who invented'
];

const JAILBREAK_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:an?\s+)?(?:unrestricted|jailbroken|dan)/i,
  /dan\s+mode/i,
  /system\s+prompt\s+reveal/i,
  /reveal\s+(?:your\s+)?system\s+prompt/i,
  /bypass\s+(?:all\s+)?(?:health|safety)\s+restrictions/i,
  /developer\s+mode\s+enabled/i,
  /you\s+are\s+no\s+longer\s+a\s+health\s+ai/i
];

// ==============================================================================
// 4. HEALTHCARE, MEDICAL, WELLNESS & JIVEXA ALLOWLIST KEYWORDS
// ==============================================================================
const HEALTHCARE_KEYWORDS = [
  'health', 'healthy', 'medical', 'clinical', 'symptom', 'symptoms', 'disease',
  'diseases', 'illness', 'condition', 'conditions', 'syndrome', 'treatment',
  'treatments', 'therapy', 'therapies', 'cure', 'prevention', 'preventive',
  'remedy', 'remedies', 'diagnosis', 'dehydration', 'dehydrated', 'hydrate',
  'fever', 'cough', 'cold', 'headache', 'pain', 'ache', 'sore throat', 'nausea',
  'vomiting', 'dizziness', 'fatigue', 'tiredness', 'weakness', 'rash', 'itching',
  'swelling', 'inflammation', 'diarrhea', 'constipation', 'stomach ache',
  'cramp', 'chills', 'sweating', 'congestion', 'runny nose', 'sneezing',
  'shortness of breath', 'back pain', 'joint pain', 'muscle pain',
  'diabetes', 'sugar', 'blood sugar', 'hypertension', 'blood pressure', 'bp',
  'asthma', 'bronchitis', 'pneumonia', 'covid', 'flu', 'influenza', 'malaria',
  'dengue', 'typhoid', 'cholera', 'anemia', 'anaemia', 'jaundice', 'hepatitis', 'thyroid',
  'hypothyroidism', 'hyperthyroidism', 'arthritis', 'migraine', 'gerd', 'acidity',
  'gastritis', 'ulcer', 'infection', 'allergy', 'allergic', 'eczema', 'psoriasis',
  'cancer', 'tumor', 'tuberculosis', 'tb', 'insomnia', 'depression', 'anxiety',
  'stress', 'mental health', 'pcos', 'pcod', 'pregnancy', 'periods',
  'heart', 'liver', 'kidney', 'lungs', 'stomach', 'brain', 'skin', 'eye', 'ear',
  'nose', 'throat', 'teeth', 'gum', 'bone', 'bones', 'spine', 'blood', 'artery', 'arteries', 'vein', 'veins',
  'muscle', 'muscles', 'joint', 'joints', 'pancreas', 'gallbladder', 'bladder', 'colon',
  'medicine', 'medication', 'medications', 'drug', 'drugs', 'tablet', 'tablets', 'capsule', 'syrup', 'injection',
  'dose', 'dosage', 'prescription', 'paracetamol', 'ibuprofen', 'aspirin',
  'crocin', 'dolo', 'metformin', 'amoxicillin', 'azithromycin', 'antibiotic', 'antibiotics',
  'antacid', 'omeprazole', 'pantoprazole', 'cetirizine', 'insulin', 'atorvastatin',
  'amlodipine', 'losartan', 'warfarin', 'tramadol',
  'vitamin', 'vitamins', 'supplement', 'supplements', 'calcium', 'iron', 'side effect', 'side effects', 'contraindication', 'precautions',
  'report', 'reports', 'abnormal', 'biomarker', 'biomarkers', 'parameter', 'parameters',
  'lab', 'labs', 'test', 'tests', 'result', 'results', 'finding', 'findings',
  'lab report', 'blood test', 'test report', 'cbc', 'complete blood count',
  'hemoglobin', 'haemoglobin', 'hb', 'rbc', 'rbcs', 'wbc', 'wbcs', 'platelet', 'platelets', 'platelet count',
  'blood cell', 'blood cells', 'red blood cell', 'white blood cell',
  'thrombocyte', 'thrombocytes', 'erythrocyte', 'erythrocytes', 'leukocyte', 'leukocytes',
  'clot', 'clotting', 'coagulation', 'plasma', 'serum', 'neutrophil', 'neutrophils',
  'lymphocyte', 'lymphocytes', 'monocyte', 'monocytes', 'eosinophil', 'eosinophils', 'basophil', 'basophils',
  'lipid profile', 'cholesterol', 'triglycerides', 'hdl', 'ldl', 'hba1c',
  'fasting glucose', 'tsh', 'creatinine', 'urea', 'sgot', 'sgpt', 'bilirubin',
  'urine test', 'x-ray', 'mri', 'ct scan', 'ultrasound', 'ecg', 'biopsy',
  'reference range', 'normal range', 'pathology',
  'diet', 'nutrition', 'exercise', 'workout', 'weight loss', 'weight gain',
  'hydration', 'water intake', 'sleep', 'rest', 'healthy food', 'lifestyle',
  'immunity', 'hygiene', 'preventive', 'vaccine', 'vaccination', 'booster',
  'doctor', 'physician', 'specialist', 'surgeon', 'cardiologist', 'dermatologist',
  'pediatrician', 'orthopedic', 'hospital', 'clinic', 'appointment', 'consultation',
  'pharmacy', 'chemist', 'ambulance', '108', '112', 'emergency', 'first aid',
  // Hindi / Hinglish healthcare terms
  'bukhar', 'khansi', 'sardard', 'sar dard', 'dard', 'pet dard', 'pait', 'gala kharab',
  'gala dard', 'chakkar', 'ulti', 'ultiyan', 'dast', 'thakan', 'thakaan', 'kamzori',
  'sujan', 'khoon', 'dawa', 'dawai', 'dawaein', 'ilaaj', 'ilaj', 'bimari', 'sehat',
  'swasth', 'neend', 'khujli', 'saans',
  'cpr', 'choking', 'burn', 'burns', 'cut', 'wound', 'bleeding',
  'fracture', 'sprain', 'snake', 'snake bite', 'bite', 'insect bite', 'dog bite',
  'antivenom', 'venom', 'poison', 'poisonous', 'heat stroke', 'frostbite',
  'triage', 'abha', 'health id', 'health records', 'jivexa', 'medical history'
];

// ==============================================================================
// 5. AMBIGUOUS TERMS & FOLLOW-UP PATTERNS
// ==============================================================================
const MEDICAL_FOLLOWUP_PATTERNS = [
  /\b(?:kal|aaj|parso|tarso)\s+(?:se|se\s+hai|ko|ki\s+raat|ki\s+subah)\b/i,
  /\b(?:subah|shaam|dopahar|raat)\s+se\b/i,
  /\b(?:since|from|for)\s+(?:yesterday|today|last\s+night|morning|evening|this\s+morning)\b/i,
  /\b\d+\s*(?:din|dino|ghante|hours|days|weeks|months|saal|hafte|hafate)\s*(?:se|se\s+hai|ago|before|tak)?\b/i,
  /\b(?:for|since)\s+\d+\s*(?:days?|hours?|weeks?|months?)\b/i,
  /\b(?:just\s+started|started\s+yesterday|started\s+today|a\s+few\s+days|couple\s+of\s+days)\b/i,
  /^(?:haan|ha|haa|han|ji\s+haan|haanji|yes|yeah|yep|yup|sure)(?:\s+(?:hai|bhi|tha|thi|h|hua))?[.!?]*$/i,
  /^(?:nahi|nahin|na|nhi|no|nope|not\s+really|never)(?:\s+(?:hai|tha|thi|h))?[.!?]*$/i,
  /\b(?:bhi|zyada|jyada|kam|aur|bahut|thoda|thoda\s+sa)\s+(?:hai|dard|pain|lag\s+raha|feel\s+ho\s+raha)?\b/i,
  /\b(?:also|as\s+well|too|worse|better|increasing|decreasing)\b/i,
  /\b(?:khansi|sardard|bukhar|vomit|chills|gala|pet|body\s+pain)\s+bhi\b/i,
  /\b\d{1,3}(?:\.\d+)?\s*(?:f|c|degree|degrees|°f|°c|g\/dl|mg\/dl|%|uiu\/ml)\b/i,
  /\b(?:mild|moderate|severe|high|low|normal)\b/i
];

const AMBIGUOUS_WORDS = [
  'memory', 'bug', 'apple', 'python', 'cache', 'virus', 'tablet', 'cell',
  'organ', 'treatment', 'recovery', 'cleanse', 'cycle', 'filter', 'scan'
];

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeText = (text) => {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Detects primary language mode from user message / history:
 * 'hindi' (Devanagari), 'hinglish' (Romanized Hindi), or 'english'.
 */
const detectLanguageMode = (text = '', history = []) => {
  const raw = String(text || '').trim();
  if (/[\u0900-\u097F]/.test(raw)) {
    return 'hindi';
  }
  const hinglishWords = [
    'hai', 'hain', 'mujhe', 'mera', 'meri', 'mere', 'kya', 'kaise', 'kab',
    'ho', 'raha', 'rahi', 'nahi', 'nahin', 'haan', 'kal', 'din', 'aaj',
    'thoda', 'zyada', 'dard', 'bukhar', 'khansi', 'badan', 'gala', 'pet',
    'chahiye', 'karna', 'batao', 'bataiye', 'ulti', 'chakkar', 'dawa',
    'dawai', 'khana', 'peena', 'seene', 'saans', 'mein', 'ko', 'ka', 'ke',
    'kamzori', 'khoon', 'tum', 'aap', 'hinglish', 'hindi'
  ];
  const lower = raw.toLowerCase();
  const matchCount = hinglishWords.filter((kw) => {
    const reg = new RegExp(`(^|[^a-zA-Z0-9_])${kw}([^a-zA-Z0-9_]|$)`, 'i');
    return reg.test(lower);
  }).length;

  if (matchCount >= 2 || (matchCount >= 1 && /\b(kya|hai|mein|kaise|batao|bataiye|mujhe|hindi|hinglish)\b/i.test(lower))) {
    return 'hinglish';
  }

  // Fallback to recent history if current turn is short numeric/yes-no
  if (Array.isArray(history) && history.length > 0 && raw.split(/\s+/).length <= 5) {
    const lastUser = [...history].reverse().find(h => String(h?.sender || '').toLowerCase() === 'user');
    if (lastUser?.text) {
      if (/[\u0900-\u097F]/.test(lastUser.text)) return 'hindi';
      const prevMatches = hinglishWords.filter((kw) => new RegExp(`(^|[^a-zA-Z0-9_])${kw}([^a-zA-Z0-9_]|$)`, 'i').test(lastUser.text.toLowerCase())).length;
      if (prevMatches >= 2) return 'hinglish';
    }
  }

  return 'english';
};

const hasRecentHealthcareContext = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) return false;

  const recentTurns = history.slice(-6);
  for (const turn of recentTurns) {
    const text = String(turn?.text || turn?.content || turn?.message || '').toLowerCase();
    if (!text) continue;

    const matched = HEALTHCARE_KEYWORDS.some(kw => {
      const escaped = escapeRegex(kw);
      const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
      return regex.test(text);
    });

    if (matched) return true;
  }

  return false;
};

/**
 * 1. Pre-Model Topic Classifier & Input Validation
 */
const classifyUserQuery = (message, history = []) => {
  if (!message || typeof message !== 'string' || !message.trim()) {
    return {
      status: 'INVALID',
      reason: 'Empty message',
      refusalMessage: 'Please enter a health-related question so I can help.'
    };
  }

  const raw = message.trim();
  const normalized = normalizeText(raw);

  // Guardrail 1: Jailbreak & Prompt Injection Detection
  for (const regex of JAILBREAK_PATTERNS) {
    if (regex.test(raw)) {
      return {
        status: 'DISALLOWED',
        reason: 'Jailbreak or rule bypass attempt',
        refusalMessage: STANDARD_REFUSAL_MESSAGE
      };
    }
  }

  // Guardrail 2: Emergency Symptom Detection (Immediate Life-Safety)
  const isEmergency = EMERGENCY_KEYWORDS.some(kw => normalized.includes(kw));
  if (isEmergency) {
    const lang = detectLanguageMode(raw, history);
    const emergencyMsg = lang === 'english'
      ? `These symptoms may signal a medical emergency.\n\n- Call **112** (Emergency Services) or **108** (Ambulance) right away.\n- Go to the nearest hospital emergency department immediately.\n- Do not drive yourself and do not wait to see if symptoms pass.`
      : `Yeh lakshan emergency sthiti ka sanket ho sakte hain.\n\n- Turant **112** (Emergency) ya **108** (Ambulance) par call karein.\n- Bina deri kiye nazdeeki hospital emergency mein jayein.\n- Khud drive na karein aur intezaar na karein.`;
    return {
      status: 'EMERGENCY',
      reason: 'Emergency symptoms detected',
      refusalMessage: emergencyMsg
    };
  }

  // Guardrail 3: Check healthcare indicators first so greetings + symptoms ("Hi, I have fever") are NOT treated as pure greetings
  const hasHealthcare = HEALTHCARE_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  }) || (/[\u0900-\u097F]/.test(raw) && /(बुखार|खांसी|दर्द|दवा|रिपोर्ट|हीमोग्लोबिन|स्वास्थ्य|डॉक्टर|बीपी|शुगर)/.test(raw));

  // Conversational & Identity Patterns (Pure Greetings, Name, Role without medical symptoms)
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const isShortTurn = wordCount <= 12;
  const hasGreetingPhrase = GREETING_PHRASES.some(phrase => {
    const escaped = escapeRegex(phrase);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });
  const hasIdentityPattern = IDENTITY_PATTERNS.some(pat => pat.test(raw));

  if (((hasGreetingPhrase && isShortTurn) || hasIdentityPattern) && !hasHealthcare) {
    return {
      status: 'ALLOWED',
      type: 'CONVERSATIONAL',
      reason: 'Polite greeting, identity, or conversational inquiry'
    };
  }

  // Guardrail 4: Explicit Disallowed Topics Check
  const hasProgramming = PROGRAMMING_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  const hasAcademicMath = ACADEMIC_MATH_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  const hasOffTopic = OFF_TOPIC_KEYWORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  if ((hasProgramming || hasAcademicMath || hasOffTopic) && !hasHealthcare) {
    return {
      status: 'DISALLOWED',
      reason: hasProgramming ? 'Programming or coding question' : hasAcademicMath ? 'Academic mathematics/physics problem' : 'Off-topic general inquiry',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  if (hasProgramming) {
    return {
      status: 'DISALLOWED',
      reason: 'Programming or coding question requested',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  // Guardrail 5: Ambiguous Query Detection
  const hasAmbiguous = AMBIGUOUS_WORDS.some(kw => {
    const escaped = escapeRegex(kw);
    const regex = new RegExp(`(^|[^a-zA-Z0-9_])${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return regex.test(raw);
  });

  if (hasAmbiguous && !hasHealthcare) {
    return {
      status: 'AMBIGUOUS',
      reason: 'Ambiguous word lacking clinical context',
      refusalMessage: STANDARD_AMBIGUOUS_CLARIFICATION
    };
  }

  // Guardrail 6: General Health Relevance
  if (hasHealthcare) {
    return {
      status: 'ALLOWED',
      type: 'HEALTH',
      reason: 'Valid healthcare query'
    };
  }

  // Guardrail 6b: Contextual Medical Follow-Up Evaluation
  const hasMedicalContext = hasRecentHealthcareContext(history);
  if (hasMedicalContext) {
    const isFollowupPattern = MEDICAL_FOLLOWUP_PATTERNS.some(pat => pat.test(raw));
    const isGenericInquiry = /^(?:who\s+is|who\s+was|what\s+is\s+the\s+capital|how\s+to\s+cook|how\s+to\s+make|tell\s+me\s+about\s+(?:dogs|cats|movies|cricket|crypto|bitcoin|politics)|recipe\s+for|weather\s+in)\b/i.test(raw);
    const words = normalized.split(/\s+/).filter(Boolean);
    const isShortConversationalTurn = words.length <= 12;

    if ((isFollowupPattern || isShortConversationalTurn) && !isGenericInquiry) {
      return {
        status: 'ALLOWED',
        type: 'CONTEXTUAL_FOLLOWUP',
        reason: 'Contextual medical follow-up response in active healthcare dialogue'
      };
    }
  }

  // Short non-health phrases lacking any healthcare terms
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 8 && !hasHealthcare) {
    return {
      status: 'DISALLOWED',
      reason: 'Non-health inquiry lacking medical relevance',
      refusalMessage: STANDARD_REFUSAL_MESSAGE
    };
  }

  // Default to AMBIGUOUS for longer unclear queries
  return {
    status: 'AMBIGUOUS',
    reason: 'Unclear query without confirmed medical context',
    refusalMessage: STANDARD_AMBIGUOUS_CLARIFICATION
  };
};

// ==============================================================================
// 6. POST-GENERATION OUTPUT GUARDRAIL (Zero-Leak Output Inspector)
// ==============================================================================
const CODE_OUTPUT_INDICATORS = [
  /```(?:python|javascript|typescript|java|c\+\+|cpp|csharp|golang|rust|ruby|php|sql|html|css|bash)/i,
  /def\s+[a-zA-Z0-9_]+\s*\(/,
  /function\s+[a-zA-Z0-9_]+\s*\(/,
  /console\.log\s*\(/,
  /#include\s*<[a-z.]+>/i,
  /public\s+static\s+void\s+main/i,
  /SELECT\s+.*?\s+FROM\s+/i
];

const PROMPT_LEAK_INDICATORS = [
  /CRITICAL IDENTITY & SAFETY RULES/i,
  /REQUIRED OUTPUT SPECIFICATION/i,
  /systemInstruction/i
];

/**
 * Validates generated AI text before streaming or returning to client.
 */
const validateAiOutput = (responseText) => {
  if (!responseText || typeof responseText !== 'string') {
    return { isValid: false, sanitizedText: STANDARD_REFUSAL_MESSAGE };
  }

  for (const indicator of CODE_OUTPUT_INDICATORS) {
    if (indicator.test(responseText)) {
      console.warn('[Health Guardrail Output Warning] AI generated code block detected. Suppressing response.');
      return {
        isValid: false,
        sanitizedText: STANDARD_REFUSAL_MESSAGE
      };
    }
  }

  for (const indicator of PROMPT_LEAK_INDICATORS) {
    if (indicator.test(responseText)) {
      console.warn('[Health Guardrail Output Warning] System instruction leak detected. Suppressing response.');
      return {
        isValid: false,
        sanitizedText: STANDARD_REFUSAL_MESSAGE
      };
    }
  }

  return {
    isValid: true,
    sanitizedText: responseText
  };
};

module.exports = {
  classifyUserQuery,
  validateAiOutput,
  detectLanguageMode,
  STANDARD_REFUSAL_MESSAGE,
  STANDARD_AMBIGUOUS_CLARIFICATION,
  EMERGENCY_KEYWORDS,
  HEALTHCARE_KEYWORDS,
  PROGRAMMING_KEYWORDS,
  hasRecentHealthcareContext,
  MEDICAL_FOLLOWUP_PATTERNS
};
