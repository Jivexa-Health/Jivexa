/**
 * JIVEXA Health AI - Comprehensive Phase 6 Test Suite
 * Tests all 10 clinical AI architectural upgrade scenarios:
 * 1. General health education question
 * 2. Medication safety question
 * 3. Drug interaction question
 * 4. Medical report interpretation
 * 5. Emergency question
 * 6. Missing context handling
 * 7. Invalid response recovery
 * 8. Timeout resilience
 * 9. Malformed JSON handling
 * 10. Long streaming response
 */

const { classifyMedicalIntent } = require('./src/services/medicalAi/medicalIntentEngine');
const { 
  screenEmergency, 
  buildEmergencyStructuredResponse, 
  auditResponseSafety,
  STANDARD_MEDICAL_DISCLAIMER 
} = require('./src/services/medicalAi/medicalSafetyEngine');
const { 
  checkDrugInteractions, 
  checkAllergyAlert, 
  getMedicationProfile 
} = require('./src/services/medicalAi/medicationEngine');
const { 
  interpretLabReport, 
  interpretParameter 
} = require('./src/services/medicalAi/reportInterpretationEngine');
const { 
  verifyAndSanitizeSources, 
  getVerifiedSourcesForTopic 
} = require('./src/services/medicalAi/medicalSourceVerifier');
const { 
  extractJsonFromText, 
  validateAndFormatResponse, 
  createSafeFallback, 
  formatStructuredToMarkdown 
} = require('./src/services/medicalAi/structuredResponseFormatter');
const { executeClinicalAiPipeline } = require('./src/services/medicalAi/clinicalAiEngine');

const runAllTests = async () => {
  console.log('================================================================');
  console.log('JIVEXA HEALTH AI - 10-POINT ARCHITECTURE VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      if (details) console.log(`   └─ ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`   └─ ${details}`);
      failed++;
    }
  };

  // --------------------------------------------------------------------------
  // TEST 1: General Health Education Question
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: General Health Education ---');
  try {
    const query = 'Explain what hypertension is, how blood pressure works, and lifestyle factors.';
    const intentResult = classifyMedicalIntent(query);
    assert(
      intentResult.intent === 'GENERAL_HEALTH_EDUCATION' || intentResult.intent === 'PREVENTIVE_WELLNESS',
      'Test 1.1: Intent correctly identified as Education/Wellness',
      `Identified intent: ${intentResult.intent}`
    );

    const sources = getVerifiedSourcesForTopic(intentResult.intent, query);
    assert(
      sources.length > 0 && sources.some(s => s.organization.includes('ICMR') || s.organization.includes('WHO')),
      'Test 1.2: Evidence verification attaches verified public health bodies (ICMR/WHO)',
      `Sources: ${sources.map(s => s.organization).join(', ')}`
    );
  } catch (err) {
    assert(false, 'Test 1: General Health Education', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Medication Safety Question
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Medication Safety ---');
  try {
    const query = 'How should I take paracetamol for fever and what precautions apply?';
    const profile = getMedicationProfile('paracetamol');
    assert(
      profile && profile.genericName.includes('Paracetamol'),
      'Test 2.1: Medication Profile retrieved from pharmacology engine',
      `Generic: ${profile?.genericName}, Classes: ${profile?.classes?.join(', ')}`
    );

    // Test safety audit to ensure no dosage prescription is allowed
    const unsafeResponse = {
      intent: 'MEDICATION_INQUIRY',
      urgency_level: 'routine',
      answer_summary: 'You have fever. Take 650mg twice daily with water.',
      key_information: ['Take 500mg daily for relief', 'You definitely have a viral infection.'],
      precautions: ['Stay hydrated'],
      warning_signs: ['High fever'],
      recommended_next_steps: ['Rest'],
      follow_up_questions: ['How high is fever?'],
      medical_sources: [],
      disclaimer: STANDARD_MEDICAL_DISCLAIMER
    };

    const audited = auditResponseSafety(unsafeResponse);
    assert(
      !audited.answer_summary.includes('Take 650mg') && !audited.key_information[0].includes('Take 500mg'),
      'Test 2.2: Safety audit scrubs unsupported dosage recommendations',
      `Audited Summary: "${audited.answer_summary}"`
    );
    assert(
      !audited.answer_summary.includes('You have') && !audited.key_information[1].includes('You definitely have'),
      'Test 2.3: Safety audit eliminates definitive diagnosis statements',
      `Audited Key Info: "${audited.key_information[1]}"`
    );
  } catch (err) {
    assert(false, 'Test 2: Medication Safety', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Drug Interaction Question
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Drug Interaction ---');
  try {
    const query = 'Can I take Aspirin together with Warfarin for pain relief?';
    const interactions = checkDrugInteractions(query);
    assert(
      interactions.length > 0 && interactions.some(i => i.severity === 'CRITICAL'),
      'Test 3.1: Critical Drug Interaction correctly detected (Aspirin + Warfarin)',
      `Detected: ${interactions[0]?.title} (${interactions[0]?.severity})`
    );

    const allergyAlert = checkAllergyAlert('amoxicillin', ['penicillin']);
    assert(
      allergyAlert.length > 0 && allergyAlert[0].severity === 'CRITICAL',
      'Test 3.2: Allergy Cross-Reactivity contraindication flagged (Penicillin allergy + Amoxicillin)',
      `Alert: ${allergyAlert[0]?.message.slice(0, 70)}...`
    );
  } catch (err) {
    assert(false, 'Test 3: Drug Interaction', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Medical Report Interpretation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Medical Report Interpretation ---');
  try {
    const sampleParameters = [
      { name: 'Hemoglobin', value: '8.5', unit: 'g/dL' },
      { name: 'Fasting Blood Glucose', value: '168', unit: 'mg/dL' },
      { name: 'Platelet Count', value: '95', unit: 'x10^3/uL' },
      { name: 'Serum Creatinine', value: '1.0', unit: 'mg/dL' }
    ];

    const interpretation = interpretLabReport(sampleParameters);
    assert(
      interpretation.abnormalCount === 3,
      'Test 4.1: Correctly flagged 3 out-of-range biomarkers (Hb low, Glucose high, Platelets low)',
      `Flagged: ${interpretation.abnormalFindings.map(f => `${f.name}: ${f.flag}`).join(', ')}`
    );

    const creatinine = interpretation.parameters.find(p => p.name.includes('Creatinine'));
    assert(
      creatinine && creatinine.flag === 'NORMAL',
      'Test 4.2: Normal biomarker correctly verified within standard intervals',
      `Creatinine: ${creatinine?.value} ${creatinine?.unit} (${creatinine?.status})`
    );

    assert(
      interpretation.questionsForDoctor.length >= 2,
      'Test 4.3: Generated actionable clinical questions for the physician consultation',
      `Sample question: "${interpretation.questionsForDoctor[0]}"`
    );
  } catch (err) {
    assert(false, 'Test 4: Medical Report Interpretation', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Emergency Question
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Emergency Triage ---');
  try {
    const query = 'My father is having severe crushing chest pain radiating to his left arm and jaw';
    const triage = screenEmergency(query);
    assert(
      triage.isEmergency === true && triage.urgencyLevel === 'emergency',
      'Test 5.1: Critical red flag detected acute emergency triage status',
      `Identified: ${triage.identifiedCondition}`
    );

    const emergencyResponse = buildEmergencyStructuredResponse(triage, query);
    assert(
      emergencyResponse.urgency_level === 'emergency' &&
      emergencyResponse.recommended_next_steps.some(s => s.includes('108') || s.includes('112')),
      'Test 5.2: Structured emergency payload includes immediate 108/112 ambulance routing',
      `Emergency summary: "${emergencyResponse.answer_summary.slice(0, 80)}..."`
    );

    const markdown = formatStructuredToMarkdown(emergencyResponse);
    assert(
      markdown.includes('URGENT EMERGENCY ADVISORY') && markdown.includes('108'),
      'Test 5.3: Emergency response formats to high-visibility clinical markdown advisory'
    );
  } catch (err) {
    assert(false, 'Test 5: Emergency Triage', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Missing Context Handling
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Missing Context Handling ---');
  try {
    const query = 'What should I do about my high reading?';
    const intentResult = classifyMedicalIntent(query);
    assert(
      intentResult.isEmergency === false,
      'Test 6.1: Ambiguous inquiry does not trigger false emergency escalation',
      `Intent: ${intentResult.intent}`
    );

    const fallback = createSafeFallback(query, 'Please specify which laboratory test or vital reading you are asking about (e.g., blood pressure, blood glucose, cholesterol) including the numeric value and unit.');
    assert(
      fallback.follow_up_questions.length > 0 && fallback.disclaimer.length > 0,
      'Test 6.2: Missing context triggers clinical clarification questions',
      `Questions: ${fallback.follow_up_questions.join(' | ')}`
    );
  } catch (err) {
    assert(false, 'Test 6: Missing Context Handling', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Invalid Response Recovery
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Invalid Response Recovery ---');
  try {
    const nonJsonResponse = "Here is some plain unstructured paragraph without any JSON formatting at all.";
    const parsed = extractJsonFromText(nonJsonResponse);
    assert(
      parsed === null,
      'Test 7.1: Correctly identified non-JSON text',
      'extractJsonFromText returned null'
    );

    const recovered = validateAndFormatResponse(parsed, 'user inquiry');
    assert(
      recovered && recovered.answer_summary && Array.isArray(recovered.key_information) && Array.isArray(recovered.medical_sources),
      'Test 7.2: Successfully recovered with a schema-valid structured response',
      `Recovered Intent: ${recovered.intent}, Urgency: ${recovered.urgency_level}`
    );
  } catch (err) {
    assert(false, 'Test 7: Invalid Response Recovery', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Timeout Resilience
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Timeout Resilience ---');
  try {
    const timeoutText = 'AI_TIMEOUT: The clinical analysis timed out (20s limit).';
    const safePayload = createSafeFallback('user query', timeoutText);
    assert(
      safePayload.answer_summary.includes('AI_TIMEOUT') && safePayload.urgency_level === 'routine',
      'Test 8.1: Timeout payload converted into graceful, compliant user guidance without system crash',
      `Summary: ${safePayload.answer_summary}`
    );
  } catch (err) {
    assert(false, 'Test 8: Timeout Resilience', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Malformed JSON Handling
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Malformed JSON Handling ---');
  try {
    const malformedJson = '```json\n{\n  "intent": "SYMPTOM_ASSESSMENT",\n  "urgency_level": "routine",\n  "answer_summary": "Incomplete json string\n```';
    const extracted = extractJsonFromText(malformedJson);
    const validated = validateAndFormatResponse(extracted, 'fever query');
    assert(
      validated && validated.intent && Array.isArray(validated.precautions),
      'Test 9.1: Malformed JSON syntax gracefully repaired into valid MedicalResponseSchema',
      `Validated object schema valid: ${Boolean(validated.answer_summary)}`
    );
  } catch (err) {
    assert(false, 'Test 9: Malformed JSON Handling', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Long Streaming Response
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Long Streaming Response ---');
  try {
    const mockStructured = {
      intent: 'GENERAL_HEALTH_EDUCATION',
      urgency_level: 'routine',
      answer_summary: 'Comprehensive clinical guide on managing metabolic health through nutrition and exercise.',
      key_information: [
        'Balanced macronutrient distribution prevents glycemic spikes.',
        'Regular aerobic exercise enhances peripheral insulin sensitivity.',
        'Adequate hydration supports renal filtration.'
      ],
      precautions: [
        'Consult physician before initiating strenuous exercise regimens.',
        'Do not skip meals while taking hypoglycemic medications.'
      ],
      warning_signs: [
        'Symptoms of severe hypoglycemia (diaphoresis, tremors, confusion) require immediate simple carbohydrate intake.'
      ],
      recommended_next_steps: [
        'Schedule fasting lipid and glucose panel.',
        'Maintain a daily symptom and food log.'
      ],
      follow_up_questions: [
        'Do you currently take any medications for blood sugar?',
        'What was your most recent fasting blood glucose measurement?'
      ],
      medical_sources: [
        {
          organization: 'World Health Organization (WHO)',
          title: 'Metabolic Syndrome and Chronic Disease Prevention Guidelines',
          url: 'https://www.who.int',
          verified: true
        }
      ],
      disclaimer: STANDARD_MEDICAL_DISCLAIMER
    };

    const formattedMarkdown = formatStructuredToMarkdown(mockStructured);
    assert(
      formattedMarkdown.includes('### Key Clinical Information') &&
      formattedMarkdown.includes('### Important Precautions') &&
      formattedMarkdown.includes('### Warning Signs') &&
      formattedMarkdown.includes('### Verified Medical References'),
      'Test 10.1: Doctor-grade Markdown contains all required clinical section headings',
      `Markdown length: ${formattedMarkdown.length} characters`
    );

    // Verify streaming chunk split
    const chunks = [];
    const streamChunks = formattedMarkdown.split(/(\n\n+)/);
    for (const chunk of streamChunks) {
      if (chunk) chunks.push(chunk);
    }
    assert(
      chunks.length >= 5,
      'Test 10.2: Content successfully split into natural progressive streaming chunks',
      `Generated ${chunks.length} stream chunks`
    );
  } catch (err) {
    assert(false, 'Test 10: Long Streaming Response', err.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
};

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
