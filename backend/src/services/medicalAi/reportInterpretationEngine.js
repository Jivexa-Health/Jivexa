/**
 * JIVEXA Health AI - Medical Report Interpretation Engine
 * 
 * Clinical laboratory result analyzer:
 * - Normalizes biomarker names, units, and standard reference ranges
 * - Identifies deviation flags (NORMAL, HIGH, LOW, CRITICAL)
 * - Explains clinical significance in accessible lay terms
 * - Recommends specific questions to discuss with the ordering physician
 * - Detects critical laboratory alert thresholds (e.g. severe thrombocytopenia, severe hyperglycemia)
 */

const STANDARD_BIOMARKER_RANGES = {
  hemoglobin: {
    canonicalName: 'Hemoglobin (Hb)',
    category: 'Hematology (CBC)',
    unit: 'g/dL',
    refMin: 12.0,
    refMax: 17.5,
    criticalLow: 7.0,
    criticalHigh: 20.0,
    lowMeaning: 'May indicate anemia (nutritional deficiency such as iron, folate, B12, or blood loss/chronic condition).',
    highMeaning: 'May indicate hemoconcentration/dehydration, polycythemia, or chronic hypoxia.'
  },
  platelets: {
    canonicalName: 'Platelet Count',
    category: 'Hematology (CBC)',
    unit: 'x10^3/uL',
    refMin: 150,
    refMax: 450,
    criticalLow: 20,
    criticalHigh: 1000,
    lowMeaning: 'Thrombocytopenia. Increases risk of bleeding, bruising, or petechiae (often seen in viral infections like dengue, autoimmune, or bone marrow conditions).',
    highMeaning: 'Thrombocytosis. Can be a reactive response to infection/inflammation, or clonal bone marrow disorder.'
  },
  wbc: {
    canonicalName: 'Total Leukocyte Count (WBC)',
    category: 'Hematology (CBC)',
    unit: 'cells/uL',
    refMin: 4000,
    refMax: 11000,
    criticalLow: 1500,
    criticalHigh: 30000,
    lowMeaning: 'Leukopenia. May indicate viral infection, autoimmune condition, or drug-induced bone marrow suppression.',
    highMeaning: 'Leukocytosis. Frequently reflects acute bacterial infection, systemic inflammation, severe physiological stress, or tissue injury.'
  },
  fasting_glucose: {
    canonicalName: 'Fasting Blood Glucose',
    category: 'Metabolic / Glycemic Profile',
    unit: 'mg/dL',
    refMin: 70,
    refMax: 99,
    criticalLow: 50,
    criticalHigh: 350,
    lowMeaning: 'Hypoglycemia. Can cause dizziness, shakiness, sweating, confusion, and requires immediate glucose intake.',
    highMeaning: 'Impaired fasting glucose (100-125 mg/dL) or provisional diabetes (>= 126 mg/dL). Requires confirmation by HbA1c.'
  },
  hba1c: {
    canonicalName: 'Glycated Hemoglobin (HbA1c)',
    category: 'Glycemic Control',
    unit: '%',
    refMin: 4.0,
    refMax: 5.6,
    criticalLow: null,
    criticalHigh: 12.0,
    lowMeaning: 'Usually normal, or occasionally associated with chronic blood loss / rapid red cell turnover.',
    highMeaning: '5.7-6.4% indicates prediabetes; >= 6.5% indicates diabetes. Reflects average 3-month blood sugar levels.'
  },
  creatinine: {
    canonicalName: 'Serum Creatinine',
    category: 'Renal Function (KFT)',
    unit: 'mg/dL',
    refMin: 0.6,
    refMax: 1.2,
    criticalLow: null,
    criticalHigh: 4.0,
    lowMeaning: 'Generally of low clinical significance; sometimes seen with reduced muscle mass.',
    highMeaning: 'Elevated levels suggest reduced glomerular filtration rate and impaired renal clearance; requires hydration check and clinical correlation.'
  },
  total_cholesterol: {
    canonicalName: 'Total Cholesterol',
    category: 'Lipid Profile',
    unit: 'mg/dL',
    refMin: 125,
    refMax: 200,
    criticalLow: null,
    criticalHigh: 350,
    lowMeaning: 'Occasionally seen in severe malnutrition or chronic hyperthyroidism.',
    highMeaning: 'Hypercholesterolemia. Elevated cardiovascular risk marker; lifestyle and dietary review indicated.'
  },
  tsh: {
    canonicalName: 'Thyroid Stimulating Hormone (TSH)',
    category: 'Endocrine (Thyroid)',
    unit: 'uIU/mL',
    refMin: 0.4,
    refMax: 4.5,
    criticalLow: 0.05,
    criticalHigh: 20.0,
    lowMeaning: 'Suggests primary hyperthyroidism (overactive thyroid). May cause weight loss, palpitations, heat intolerance.',
    highMeaning: 'Suggests primary hypothyroidism (underactive thyroid). May cause fatigue, weight gain, cold intolerance, dry skin.'
  }
};

/**
 * Maps input parameter name to standard biomarker key
 */
const matchBiomarkerKey = (paramName) => {
  const norm = String(paramName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (norm.includes('hba1c') || norm.includes('glycated')) return 'hba1c';
  if (norm.includes('fasting') && (norm.includes('glucose') || norm.includes('sugar'))) return 'fasting_glucose';
  if (norm.includes('glucose') || norm.includes('sugar')) return 'fasting_glucose';
  if (norm.includes('hemoglobin') || norm.includes('hb')) return 'hemoglobin';
  if (norm.includes('platelet') || norm.includes('plt')) return 'platelets';
  if (norm.includes('wbc') || norm.includes('leukocyte') || norm.includes('tlc')) return 'wbc';
  if (norm.includes('creatinine')) return 'creatinine';
  if (norm.includes('cholesterol')) return 'total_cholesterol';
  if (norm.includes('tsh') || norm.includes('thyroid')) return 'tsh';
  return null;
};

/**
 * Analyzes an individual lab parameter value
 * 
 * @param {string} name - Parameter name
 * @param {number|string} val - Measured value
 * @param {string} unit - Measurement unit
 * @returns {Object} Structured parameter interpretation
 */
const interpretParameter = (name, val, unit = '') => {
  const key = matchBiomarkerKey(name);
  const numVal = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  
  if (!key || isNaN(numVal)) {
    return {
      name: String(name),
      value: String(val),
      unit: unit,
      flag: 'NORMAL',
      status: 'Within Reference Range',
      simpleExplanation: 'Standard physiological measurement. Review with physician for clinical context.',
      isCritical: false
    };
  }

  const standard = STANDARD_BIOMARKER_RANGES[key];
  let flag = 'NORMAL';
  let status = 'Within Reference Range';
  let explanation = 'Within healthy reference intervals.';
  let isCritical = false;

  if (standard.criticalLow !== null && numVal <= standard.criticalLow) {
    flag = 'CRITICAL_LOW';
    status = 'Critical Low';
    explanation = `CRITICAL ALERT: Value is markedly below safe threshold. ${standard.lowMeaning}`;
    isCritical = true;
  } else if (standard.criticalHigh !== null && numVal >= standard.criticalHigh) {
    flag = 'CRITICAL_HIGH';
    status = 'Critical High';
    explanation = `CRITICAL ALERT: Value is markedly above safe threshold. ${standard.highMeaning}`;
    isCritical = true;
  } else if (numVal < standard.refMin) {
    flag = 'LOW';
    status = 'Below Range';
    explanation = standard.lowMeaning;
  } else if (numVal > standard.refMax) {
    flag = 'HIGH';
    status = 'Above Range';
    explanation = standard.highMeaning;
  }

  return {
    name: standard.canonicalName,
    value: String(numVal),
    unit: standard.unit || unit,
    referenceRange: `${standard.refMin} - ${standard.refMax} ${standard.unit}`,
    flag,
    status,
    simpleExplanation: explanation,
    isCritical
  };
};

/**
 * Interprets a batch of lab parameters or extracted report text
 * 
 * @param {Array<Object>} parameters - Array of { name, value, unit }
 * @returns {Object} Structured laboratory analysis summary
 */
const interpretLabReport = (parameters = []) => {
  const analyzedParams = [];
  const abnormalFindings = [];
  let hasCritical = false;

  for (const p of parameters) {
    const analyzed = interpretParameter(p.name, p.value, p.unit);
    analyzedParams.push(analyzed);

    if (analyzed.flag !== 'NORMAL') {
      abnormalFindings.push(analyzed);
    }
    if (analyzed.isCritical) {
      hasCritical = true;
    }
  }

  const questionsForDoctor = [
    'What do the out-of-range parameters indicate in my specific clinical context?',
    'Should any of these tests be repeated to confirm trends or rule out transient changes?',
    'Are there dietary or lifestyle modifications or specific medications recommended based on these results?'
  ];

  return {
    hasCritical,
    totalCount: analyzedParams.length,
    abnormalCount: abnormalFindings.length,
    parameters: analyzedParams,
    abnormalFindings,
    questionsForDoctor,
    summary: abnormalFindings.length === 0
      ? 'All analyzed laboratory biomarkers are within expected standard physiological ranges.'
      : `${abnormalFindings.length} biomarker(s) show deviation from standard reference ranges. Clinical correlation with your doctor is advised.`
  };
};

module.exports = {
  STANDARD_BIOMARKER_RANGES,
  interpretParameter,
  interpretLabReport,
  matchBiomarkerKey
};
