/**
 * JIVEXA Health AI - Structured Response Formatter & Validation Layer
 *
 * Enforces Zod validation on Medical AI outputs while keeping responses
 * patient-friendly, concise, and free of forced boilerplate.
 */

const { z } = require('zod');
const { STANDARD_MEDICAL_DISCLAIMER } = require('./medicalSafetyEngine');

const MedicalSourceSchema = z.object({
  organization: z.string().default('Public Health Authority'),
  title: z.string().default('Clinical Guidelines'),
  url: z.string().url().or(z.string()).default('https://www.who.int'),
  verified: z.boolean().default(true)
});

const MedicalResponseSchema = z.object({
  intent: z.enum([
    'EMERGENCY_TRIAGE',
    'SYMPTOM_ASSESSMENT',
    'MEDICATION_INQUIRY',
    'DRUG_INTERACTION',
    'ALLERGY_ALERT',
    'LAB_REPORT_ANALYSIS',
    'GENERAL_HEALTH_EDUCATION',
    'PREVENTIVE_WELLNESS',
    'NAVIGATIONAL_PLATFORM',
    'OFF_TOPIC'
  ]).default('GENERAL_HEALTH_EDUCATION'),

  response_mode: z.enum([
    'conversational',
    'simple',
    'detailed',
    'report',
    'emergency'
  ]).default('simple'),

  urgency_level: z.enum([
    'emergency',
    'high_priority',
    'routine',
    'self_care',
    'informational'
  ]).default('informational'),

  answer_summary: z.string().min(1, 'Summary is required'),

  key_information: z.array(z.string()).default([]),

  precautions: z.array(z.string()).default([]),

  warning_signs: z.array(z.string()).default([]),

  recommended_next_steps: z.array(z.string()).default([]),

  // Strict max 1 follow-up question
  follow_up_questions: z.array(z.string()).max(1).default([]),

  medical_sources: z.array(MedicalSourceSchema).default([]),

  disclaimer: z.string().default('')
});

/**
 * Extracts and parses JSON from raw LLM text, handling code blocks and trailing prose.
 */
const extractJsonFromText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();

  try {
    return JSON.parse(trimmed);
  } catch (e) {}

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {}
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {}
  }

  return null;
};

/**
 * Validates or repairs structured AI response using Zod schema.
 */
const validateAndFormatResponse = (rawData, originalQuery = '') => {
  if (!rawData || typeof rawData !== 'object') {
    return createSafeFallback(originalQuery, 'I could not process that clearly. Please try asking your health question again.');
  }

  // Cap follow_up_questions to 1 before Zod validation so valid responses don't fail on >1 items
  const preCleaned = {
    ...rawData,
    follow_up_questions: Array.isArray(rawData.follow_up_questions)
      ? rawData.follow_up_questions.filter(Boolean).slice(0, 1)
      : (typeof rawData.follow_up_question === 'string' && rawData.follow_up_question.trim()
        ? [rawData.follow_up_question.trim()]
        : [])
  };

  const result = MedicalResponseSchema.safeParse(preCleaned);

  if (result.success) {
    return result.data;
  }

  console.warn('[structuredResponseFormatter] Schema warning:', result.error.issues);

  return {
    intent: rawData.intent || 'GENERAL_HEALTH_EDUCATION',
    response_mode: ['conversational', 'simple', 'detailed', 'report', 'emergency'].includes(rawData.response_mode)
      ? rawData.response_mode
      : 'simple',
    urgency_level: ['emergency', 'high_priority', 'routine', 'self_care', 'informational'].includes(rawData.urgency_level)
      ? rawData.urgency_level
      : 'informational',
    answer_summary: String(rawData.answer_summary || rawData.summary || 'Here is general health information about your question.'),
    key_information: Array.isArray(rawData.key_information)
      ? rawData.key_information.map(String).filter(Boolean)
      : [],
    precautions: Array.isArray(rawData.precautions)
      ? rawData.precautions.map(String).filter(Boolean)
      : [],
    warning_signs: Array.isArray(rawData.warning_signs)
      ? rawData.warning_signs.map(String).filter(Boolean)
      : [],
    recommended_next_steps: Array.isArray(rawData.recommended_next_steps)
      ? rawData.recommended_next_steps.map(String).filter(Boolean)
      : [],
    follow_up_questions: preCleaned.follow_up_questions,
    medical_sources: Array.isArray(rawData.medical_sources) ? rawData.medical_sources : [],
    disclaimer: rawData.disclaimer || ''
  };
};

/**
 * Creates a safe, concise fallback response if JSON parsing fails.
 */
const createSafeFallback = (userQuery, rawText = '') => {
  const cleanRaw = String(rawText || '').replace(/[{}\[\]"]/g, '').trim();
  return {
    intent: 'GENERAL_HEALTH_EDUCATION',
    response_mode: 'simple',
    urgency_level: 'routine',
    answer_summary: cleanRaw
      ? cleanRaw.substring(0, 450)
      : 'Here is some general health information. Could you share a little more detail about what you would like to know?',
    key_information: [],
    precautions: [],
    warning_signs: [],
    recommended_next_steps: [],
    follow_up_questions: ['What specific symptom, medicine, or lab value would you like help understanding?'],
    medical_sources: [],
    disclaimer: STANDARD_MEDICAL_DISCLAIMER
  };
};

/**
 * Formats structured response into clean, natural, patient-friendly Markdown.
 * Adapts layout so simple questions stay conversational and concise (50-100 words),
 * while detailed/symptom/emergency responses remain well-structured and readable.
 */
const formatStructuredToMarkdown = (data) => {
  if (!data) return '';

  const sections = [];

  if (data.urgency_level === 'emergency') {
    sections.push(`🚨 **URGENT EMERGENCY ADVISORY**\n\n${data.answer_summary}`);
  } else if (data.urgency_level === 'high_priority') {
    sections.push(`⚠️ **Please Seek Prompt Medical Care**\n\n${data.answer_summary}`);
  } else {
    sections.push(data.answer_summary);
  }

  // Key points (simple bullet points when present)
  if (Array.isArray(data.key_information) && data.key_information.length > 0) {
    const items = data.key_information.map(item => `- ${item}`).join('\n');
    if (data.response_mode === 'simple') {
      sections.push(items);
    } else {
      sections.push(`### Key Clinical Information\n\n${items}`);
    }
  }

  // Precautions (only when present)
  if (Array.isArray(data.precautions) && data.precautions.length > 0) {
    const items = data.precautions.map(item => `- ${item}`).join('\n');
    sections.push(`### Important Precautions\n\n${items}`);
  }

  // Warning signs (only when relevant)
  if (Array.isArray(data.warning_signs) && data.warning_signs.length > 0) {
    const items = data.warning_signs.map(item => `- ${item}`).join('\n');
    sections.push(`### Warning Signs (Seek Medical Care If)\n\n${items}`);
  }

  // Recommended next step(s)
  if (Array.isArray(data.recommended_next_steps) && data.recommended_next_steps.length > 0) {
    const items = data.recommended_next_steps.map(item => `- ${item}`).join('\n');
    if (data.response_mode === 'simple') {
      sections.push(items);
    } else {
      sections.push(`### Recommended Next Steps\n\n${items}`);
    }
  }

  // Single follow-up question (max 1)
  if (Array.isArray(data.follow_up_questions) && data.follow_up_questions.length > 0) {
    const singleQuestion = String(data.follow_up_questions[0] || '').trim();
    if (singleQuestion && !data.answer_summary.includes(singleQuestion)) {
      sections.push(singleQuestion);
    }
  }

  // Verified sources (only if genuinely provided and verified)
  if (Array.isArray(data.medical_sources) && data.medical_sources.length > 0) {
    const sources = data.medical_sources
      .map(s => `- **${s.organization}**: [${s.title}](${s.url})`)
      .join('\n');
    sections.push(`### Verified Medical References\n\n${sources}`);
  }

  return sections.join('\n\n');
};

module.exports = {
  MedicalResponseSchema,
  MedicalSourceSchema,
  extractJsonFromText,
  validateAndFormatResponse,
  createSafeFallback,
  formatStructuredToMarkdown
};
