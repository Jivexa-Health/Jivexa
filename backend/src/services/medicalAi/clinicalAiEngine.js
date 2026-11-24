/**
 * JIVEXA Health AI - Clinical AI Response Engine (Orchestrator)
 * 
 * Central coordinator combining:
 * 1. Medical Intent Classification Engine
 * 2. Medical Safety & Emergency Screening Engine
 * 3. Patient Clinical Context Manager (MongoDB HealthId + Lab history)
 * 4. Clinical Pharmacology & Drug Interaction / Allergy Engine
 * 5. Laboratory Report Interpretation Engine
 * 6. Evidence-Based Medical Source Verifier
 * 7. Zod Schema Validation & Fallback Formatter
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config/env');
const { classifyMedicalIntent } = require('./medicalIntentEngine');
const { 
  screenEmergency, 
  buildEmergencyStructuredResponse, 
  auditResponseSafety,
  STANDARD_MEDICAL_DISCLAIMER 
} = require('./medicalSafetyEngine');
const { 
  checkDrugInteractions, 
  checkAllergyAlert, 
  getMedicationProfile 
} = require('./medicationEngine');
const { 
  verifyAndSanitizeSources, 
  getVerifiedSourcesForTopic 
} = require('./medicalSourceVerifier');
const { getPatientClinicalContext } = require('./patientContextManager');
const { 
  extractJsonFromText, 
  validateAndFormatResponse, 
  createSafeFallback, 
  formatStructuredToMarkdown 
} = require('./structuredResponseFormatter');
const { validateAiOutput, STANDARD_REFUSAL_MESSAGE } = require('../healthGuardrail');

/**
 * Builds the comprehensive Clinical System Instruction with safety guardrails and patient context.
 */
const buildClinicalSystemPrompt = ({
  intentResult,
  patientContext,
  drugInteractions,
  allergyAlerts,
  userProfile,
  reportContext
}) => {
  const parts = [];

  parts.push(`You are JIVEXA Health AI, an advanced, empathetic, and evidence-based clinical healthcare assistant.`);
  parts.push(`You communicate in the style of an experienced, compassionate, and careful physician.`);

  parts.push(`
CRITICAL IDENTITY & SAFETY RULES:
1. NO DEFINITIVE DIAGNOSIS: Never state "You have X" or "My diagnosis is X". Always use cautious clinical phrasing such as "Symptoms may suggest possibilities such as...", "Common causes to discuss with a physician include...", or "Clinical evaluation is required to confirm...".
2. NO PRESCRIPTION DOSING: Never prescribe or recommend specific dosages for prescription medications. Always advise the patient to follow their doctor's prescription.
3. NO UNAUTHORIZED ALTERATION: Never advise a patient to stop, start, or change prescribed medications without explicit physician supervision.
4. CLINICAL UNCERTAINTY: Explicitly communicate when clinical context is incomplete or when symptoms could stem from diverse etiologies.
5. EMERGENCY ESCALATION: For red-flag symptoms, prioritize immediate emergency contact (108 Ambulance / 112 National Emergency).
6. EVIDENCE CITATIONS: Reference only verified public health bodies (WHO, ICMR, CDC, MedlinePlus, NHS UK). Never hallucinate PMIDs or broken links.
`);

  // Inject Patient Clinical Profile (if available)
  if (patientContext && patientContext.hasContext) {
    parts.push(`\n${patientContext.formattedContextString}\n`);
  }

  // Inject Allergy Alerts
  if (allergyAlerts && allergyAlerts.length > 0) {
    parts.push(`\nCRITICAL ALLERGY ALERT FOR THIS PATIENT:\n${allergyAlerts.map(a => `- [${a.severity}] ${a.message}`).join('\n')}\nYou MUST explicitly highlight this allergy contraindication to protect patient safety.\n`);
  }

  // Inject Drug Interaction Alerts
  if (drugInteractions && drugInteractions.length > 0) {
    parts.push(`\nCRITICAL DRUG INTERACTION ALERT:\n${drugInteractions.map(i => `- [${i.severity}] ${i.title}: ${i.description}. Action: ${i.action}`).join('\n')}\nYou MUST explicitly advise the patient on these interaction risks.\n`);
  }

  // Inject Report Context
  if (reportContext && typeof reportContext === 'object') {
    parts.push(`\nACTIVE MEDICAL LAB REPORT CONTEXT:\nReport: ${reportContext.reportTitle || 'Lab Report'} (Date: ${reportContext.reportDate || 'Recent'})\nParameters:\n${(reportContext.parameters || []).map(p => `  * ${p.name}: ${p.value} ${p.unit || ''} (Ref: ${p.referenceRange || 'N/A'}, Status: ${p.status}, Flag: [${p.flag || 'NORMAL'}])`).join('\n')}\n`);
  }

  // Structured Output Requirement
  parts.push(`
REQUIRED OUTPUT SPECIFICATION:
You MUST respond EXCLUSIVELY with a single, valid JSON object matching the following structure (no markdown fences, no conversational preambles outside JSON):

{
  "intent": "${intentResult?.intent || 'GENERAL_HEALTH_EDUCATION'}",
  "urgency_level": "emergency" | "high_priority" | "routine" | "self_care" | "informational",
  "answer_summary": "Clear, compassionate 2-3 sentence overview answering the inquiry directly.",
  "key_information": [
    "Clinical explanation point 1",
    "Clinical explanation point 2",
    "Clinical explanation point 3"
  ],
  "precautions": [
    "Precaution 1",
    "Precaution 2"
  ],
  "warning_signs": [
    "Red flag sign 1 that requires urgent care",
    "Red flag sign 2"
  ],
  "recommended_next_steps": [
    "Actionable next step 1",
    "Actionable next step 2"
  ],
  "follow_up_questions": [
    "Relevant clinical question 1",
    "Relevant clinical question 2"
  ],
  "medical_sources": [
    {
      "organization": "World Health Organization (WHO)",
      "title": "Title of Relevant Clinical Guideline",
      "url": "https://www.who.int",
      "verified": true
    }
  ],
  "disclaimer": "${STANDARD_MEDICAL_DISCLAIMER}"
}
`);

  return parts.join('\n');
};

/**
 * Converts user conversation history into Gemini-compatible alternating turn structure.
 */
const formatGeminiHistory = (userMessage, history = []) => {
  const turns = [];
  const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

  for (const h of safeHistory) {
    if (!h) continue;
    const roleStr = String(h.sender || h.role || '').toLowerCase();
    const role = (roleStr === 'user' || roleStr === 'patient') ? 'user' : 'model';
    const text = String(h.text || h.content || h.message || '').trim();
    if (!text) continue;

    // Deduplicate consecutive roles
    if (turns.length > 0 && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }

  // Ensure first turn is 'user'
  if (turns.length > 0 && turns[0].role !== 'user') {
    turns.shift();
  }

  // Append current user message
  const currentMsg = String(userMessage || '').trim();
  if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
    turns[turns.length - 1].parts[0].text += `\n\n${currentMsg}`;
  } else {
    turns.push({ role: 'user', parts: [{ text: currentMsg }] });
  }

  return turns;
};

/**
 * Executes the clinical AI reasoning process and streams results back to the caller.
 * 
 * @param {Object} params - Execution parameters
 * @returns {Promise<Object>} Final structured and markdown output
 */
const executeClinicalAiPipeline = async ({
  userMessage,
  history = [],
  onChunk = () => {},
  userProfile = null,
  crossConversationContext = '',
  reportContext = null
}) => {
  const cleanMessage = String(userMessage || '').trim();

  // 1. Pre-Screening: Medical Intent Classification
  const intentResult = classifyMedicalIntent(cleanMessage, history, userProfile);

  // 2. Pre-Screening: Emergency Screening (Immediate triage shortcut)
  const triageResult = screenEmergency(cleanMessage, userProfile);
  if (triageResult.isEmergency) {
    const emergencyPayload = buildEmergencyStructuredResponse(triageResult, cleanMessage);
    const emergencyMarkdown = formatStructuredToMarkdown(emergencyPayload);
    
    // Stream emergency guidance immediately
    onChunk(emergencyMarkdown);

    return {
      provider: 'JIVEXA Emergency Triage Engine',
      isEmergency: true,
      text: emergencyMarkdown,
      structuredData: emergencyPayload,
      suggestions: emergencyPayload.follow_up_questions,
      inputTokens: 50,
      outputTokens: 300
    };
  }

  // 3. Fetch Patient Clinical Context (HealthId + Lab history)
  let patientContext = { hasContext: false, allergies: [], chronicConditions: [], currentMedications: [] };
  if (userProfile?.id) {
    try {
      patientContext = await getPatientClinicalContext(userProfile.id);
    } catch (ctxErr) {
      console.warn('[ClinicalAiEngine] Failed to fetch patient context:', ctxErr.message);
    }
  }

  // 4. Clinical Pharmacology & Safety Screening
  const drugInteractions = checkDrugInteractions(cleanMessage);
  const allergyAlerts = checkAllergyAlert(cleanMessage, patientContext.allergies);

  // 5. Check API Key Configuration
  const apiKey = config.chatbotAi.apiKey || config.gemini.apiKey;
  if (!apiKey || !config.chatbotAi.isConfigured()) {
    const notice = 'AI_NOT_CONFIGURED: JIVEXA Health AI is not configured with an active Gemini API key. Please configure GEMINI_API_KEY in backend/.env.';
    onChunk(notice);
    return {
      provider: 'JIVEXA Configuration Notice',
      text: notice,
      errorCode: 'AI_NOT_CONFIGURED',
      suggestions: [],
      structuredData: createSafeFallback(cleanMessage, notice),
      inputTokens: 0,
      outputTokens: 25
    };
  }

  // 6. Initialize Gemini Model with Structured Instructions
  const configuredModel = config.chatbotAi.model || 'gemini-2.5-flash';
  const genAI = new GoogleGenerativeAI(apiKey);

  const systemInstruction = buildClinicalSystemPrompt({
    intentResult,
    patientContext,
    drugInteractions,
    allergyAlerts,
    userProfile,
    reportContext
  });

  const model = genAI.getGenerativeModel({
    model: configuredModel,
    systemInstruction,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json'
    }
  });

  const contents = formatGeminiHistory(cleanMessage, history);

  // 7. Execute Model Call with 20-Second Timeout and Bounded Transient Retries
  let rawResponseText = '';
  let lastApiErr = null;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, attempt * 800));
      }
      const generatePromise = model.generateContent({ contents });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out (20s limit)')), 20000)
      );

      const result = await Promise.race([generatePromise, timeoutPromise]);
      rawResponseText = result.response.text();
      lastApiErr = null;
      break;
    } catch (apiErr) {
      lastApiErr = apiErr;
      const errMsg = String(apiErr.message || '').toLowerCase();
      const isTransient = apiErr.status === 429 || apiErr.status === 503 ||
        errMsg.includes('429') || errMsg.includes('503') ||
        errMsg.includes('fetch failed') || errMsg.includes('unavailable') ||
        errMsg.includes('resource_exhausted') || errMsg.includes('quota');
      if (!isTransient || attempt === MAX_RETRIES) {
        break;
      }
    }
  }

  if (lastApiErr) {
    console.error('[ClinicalAiEngine] Gemini generation error:', lastApiErr.message);
    
    // Check if error is timeout
    if (lastApiErr.message.includes('timed out')) {
      const timeoutText = 'AI_TIMEOUT: The clinical analysis timed out. Please verify your connection and try again.';
      onChunk(timeoutText);
      return {
        provider: 'JIVEXA Timeout Notice',
        text: timeoutText,
        errorCode: 'AI_TIMEOUT',
        structuredData: createSafeFallback(cleanMessage, timeoutText),
        suggestions: ['Retry the question', 'Ask a simpler question']
      };
    }

    throw lastApiErr;
  }

  // 8. Output Guardrail: Check for non-medical/code leakage
  const outputValidation = validateAiOutput(rawResponseText);
  if (!outputValidation.isValid) {
    onChunk(STANDARD_REFUSAL_MESSAGE);
    return {
      provider: 'JIVEXA Health Guardrail',
      text: STANDARD_REFUSAL_MESSAGE,
      refused: true,
      structuredData: createSafeFallback(cleanMessage, STANDARD_REFUSAL_MESSAGE),
      suggestions: []
    };
  }

  // 9. Structured Parsing & Zod Validation
  let parsedJson = extractJsonFromText(rawResponseText);
  let validatedStructured = validateAndFormatResponse(parsedJson, cleanMessage);

  // 10. Medical Safety Audit (Strict no-diagnosis, no-dosage filter)
  validatedStructured = auditResponseSafety(validatedStructured);

  // 11. Evidence Verification (Strip fake citations, attach verified public health sources)
  validatedStructured.medical_sources = verifyAndSanitizeSources(
    validatedStructured.medical_sources,
    validatedStructured.intent,
    cleanMessage
  );

  // 12. Format into Doctor-Grade Markdown and Stream to UI
  const finalMarkdown = formatStructuredToMarkdown(validatedStructured);

  // Progressive streaming: stream markdown to client in natural paragraph/bullet slices
  const streamChunks = finalMarkdown.split(/(\n\n+)/);
  for (const chunk of streamChunks) {
    if (chunk) {
      onChunk(chunk);
    }
  }

  return {
    provider: `JIVEXA Clinical AI (${configuredModel})`,
    text: finalMarkdown,
    structuredData: validatedStructured,
    isEmergency: validatedStructured.urgency_level === 'emergency',
    suggestions: validatedStructured.follow_up_questions || []
  };
};

module.exports = {
  buildClinicalSystemPrompt,
  executeClinicalAiPipeline
};
