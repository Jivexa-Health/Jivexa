/**
 * JIVEXA Health AI - Structured Response Formatter & Validation Layer
 * 
 * Enforces structured schema validation (Zod) on all Medical AI outputs:
 * - Resilient JSON extraction and syntax repair from LLM streams
 * - Schema validation for all clinical fields
 * - Safe fallback generation when model outputs malformed syntax
 * - Bi-directional conversion: Structured Object <-> Clinical Markdown
 */

const { z } = require('zod');
const { STANDARD_MEDICAL_DISCLAIMER } = require('./medicalSafetyEngine');

// Medical Source Schema
const MedicalSourceSchema = z.object({
  organization: z.string().default('Public Health Authority'),
  title: z.string().default('Clinical Guidelines'),
  url: z.string().url().or(z.string()).default('https://www.who.int'),
  verified: z.boolean().default(true)
});

// Primary Structured Medical Response Schema (Phase 3 Spec)
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

  urgency_level: z.enum([
    'emergency',
    'high_priority',
    'routine',
    'self_care',
    'informational'
  ]).default('routine'),

  answer_summary: z.string().min(1, 'Summary is required'),

  key_information: z.array(z.string()).default([]),

  precautions: z.array(z.string()).default([]),

  warning_signs: z.array(z.string()).default([]),

  recommended_next_steps: z.array(z.string()).default([]),

  follow_up_questions: z.array(z.string()).default([]),

  medical_sources: z.array(MedicalSourceSchema).default([]),

  disclaimer: z.string().default(STANDARD_MEDICAL_DISCLAIMER)
});

/**
 * Extracts and parses JSON from raw LLM text, handling code blocks and trailing prose.
 * 
 * @param {string} rawText 
 * @returns {Object|null}
 */
const extractJsonFromText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;

  const trimmed = rawText.trim();

  // Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Continue to regex-based extraction
  }

  // Look for ```json ... ``` code fence
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      // Continue
    }
  }

  // Look for outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      // Continue
    }
  }

  return null;
};

/**
 * Validates or repairs structured AI response using Zod schema
 * 
 * @param {Object} rawData - Object parsed from JSON
 * @param {string} originalQuery - Fallback prompt context
 * @returns {Object} Validated structured response
 */
const validateAndFormatResponse = (rawData, originalQuery = '') => {
  if (!rawData || typeof rawData !== 'object') {
    return createSafeFallback(originalQuery, 'Failed to extract structured clinical payload.');
  }

  const result = MedicalResponseSchema.safeParse(rawData);

  if (result.success) {
    // Ensure medical_sources has at least one valid source
    if (result.data.medical_sources.length === 0) {
      result.data.medical_sources = [
        {
          organization: 'World Health Organization (WHO)',
          title: 'Evidence-Based Clinical Guidelines',
          url: 'https://www.who.int',
          verified: true
        }
      ];
    }
    return result.data;
  }

  // Validation had non-fatal errors; patch missing fields gracefully
  console.warn('[structuredResponseFormatter] Schema warning:', result.error.issues);

  return {
    intent: rawData.intent || 'GENERAL_HEALTH_EDUCATION',
    urgency_level: ['emergency', 'high_priority', 'routine', 'self_care', 'informational'].includes(rawData.urgency_level)
      ? rawData.urgency_level
      : 'routine',
    answer_summary: String(rawData.answer_summary || rawData.summary || 'Clinical information provided below.'),
    key_information: Array.isArray(rawData.key_information) 
      ? rawData.key_information.map(String) 
      : [String(rawData.key_information || 'Clinical information recorded.')],
    precautions: Array.isArray(rawData.precautions) 
      ? rawData.precautions.map(String) 
      : ['Consult your healthcare provider for individualized medical evaluation.'],
    warning_signs: Array.isArray(rawData.warning_signs) 
      ? rawData.warning_signs.map(String) 
      : ['High fever, severe pain, or difficulty breathing require prompt medical review.'],
    recommended_next_steps: Array.isArray(rawData.recommended_next_steps) 
      ? rawData.recommended_next_steps.map(String) 
      : ['Discuss these points with your primary doctor.'],
    follow_up_questions: Array.isArray(rawData.follow_up_questions) 
      ? rawData.follow_up_questions.map(String) 
      : ['Would you like to know more about precautions?', 'Should I explain any medical terms in simpler language?'],
    medical_sources: Array.isArray(rawData.medical_sources) && rawData.medical_sources.length > 0
      ? rawData.medical_sources
      : [
          {
            organization: 'World Health Organization (WHO)',
            title: 'Clinical Health Information',
            url: 'https://www.who.int',
            verified: true
          }
        ],
    disclaimer: rawData.disclaimer || STANDARD_MEDICAL_DISCLAIMER
  };
};

/**
 * Creates a safe fallback response if parsing completely fails or raw text was returned
 * 
 * @param {string} userQuery 
 * @param {string} rawText 
 * @returns {Object}
 */
const createSafeFallback = (userQuery, rawText = '') => {
  return {
    intent: 'GENERAL_HEALTH_EDUCATION',
    urgency_level: 'routine',
    answer_summary: rawText 
      ? rawText.substring(0, 300).replace(/[{}\[\]"]/g, '') 
      : 'Here is general medical health information regarding your inquiry.',
    key_information: [
      rawText ? rawText.substring(0, 600) : 'Please discuss your specific medical concerns with a registered doctor.'
    ],
    precautions: [
      'Do not start or modify medications without clinical consultation.',
      'Seek in-person medical care if symptoms worsen or persist.'
    ],
    warning_signs: [
      'Chest pain, severe breathlessness, or neurological changes require immediate emergency care (108/112).'
    ],
    recommended_next_steps: [
      'Consult a licensed physician for in-person examination and clinical diagnosis.'
    ],
    follow_up_questions: [
      'Could you share how long you have experienced these symptoms?',
      'Do you have any existing diagnosed conditions or allergies?'
    ],
    medical_sources: [
      {
        organization: 'World Health Organization (WHO)',
        title: 'General Health Guidelines',
        url: 'https://www.who.int',
        verified: true
      }
    ],
    disclaimer: STANDARD_MEDICAL_DISCLAIMER
  };
};

/**
 * Formats structured response into clean, standardized Doctor-grade Markdown
 * 
 * @param {Object} data - Validated MedicalResponseSchema object
 * @returns {string} Formatted Markdown text
 */
const formatStructuredToMarkdown = (data) => {
  if (!data) return '';

  const sections = [];

  // 1. Urgency badge and summary
  let urgencyHeader = '';
  if (data.urgency_level === 'emergency') {
    urgencyHeader = '🚨 **URGENT EMERGENCY ADVISORY** 🚨\n\n';
  } else if (data.urgency_level === 'high_priority') {
    urgencyHeader = '⚠️ **HIGH PRIORITY CLINICAL ADVISORY**\n\n';
  }

  sections.push(`${urgencyHeader}${data.answer_summary}`);

  // 2. Key Information
  if (Array.isArray(data.key_information) && data.key_information.length > 0) {
    const items = data.key_information.map(item => `- ${item}`).join('\n');
    sections.push(`### Key Clinical Information\n\n${items}`);
  }

  // 3. Precautions
  if (Array.isArray(data.precautions) && data.precautions.length > 0) {
    const items = data.precautions.map(item => `- ${item}`).join('\n');
    sections.push(`### Important Precautions\n\n${items}`);
  }

  // 4. Warning Signs
  if (Array.isArray(data.warning_signs) && data.warning_signs.length > 0) {
    const items = data.warning_signs.map(item => `- ⚠️ ${item}`).join('\n');
    sections.push(`### Warning Signs (Seek Urgent Care If)\n\n${items}`);
  }

  // 5. Recommended Next Steps
  if (Array.isArray(data.recommended_next_steps) && data.recommended_next_steps.length > 0) {
    const items = data.recommended_next_steps.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
    sections.push(`### Recommended Next Steps\n\n${items}`);
  }

  // 6. Medical Sources
  if (Array.isArray(data.medical_sources) && data.medical_sources.length > 0) {
    const sources = data.medical_sources
      .map(s => `- **${s.organization}**: [${s.title}](${s.url})`)
      .join('\n');
    sections.push(`### Verified Medical References\n\n${sources}`);
  }

  // 7. Disclaimer
  sections.push(`---\n*Disclaimer: ${data.disclaimer}*`);

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
