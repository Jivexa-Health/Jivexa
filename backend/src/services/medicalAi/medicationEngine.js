/**
 * JIVEXA Health AI - Medication Information & Safety Engine
 * 
 * Clinical pharmacology safety layer:
 * - Active ingredient & therapeutic class resolution
 * - Drug-drug interaction screening for major adverse pairs
 * - Patient allergy cross-checking (e.g. Beta-lactam / Penicillin, NSAID, Sulfa)
 * - Strict dosage non-prescription guardrail
 * - Standard administration precautions (food, hydration, timing)
 */

// Drug database with pharmacological classes, indications, contraindications, and major precautions
const DRUG_CATALOG = {
  paracetamol: {
    genericName: 'Paracetamol (Acetaminophen)',
    classes: ['Analgesic', 'Antipyretic'],
    indications: ['Mild to moderate pain', 'Fever reduction'],
    contraindications: ['Severe hepatic impairment', 'Active liver disease'],
    cautions: ['Do not exceed safe daily limits', 'Beware of multi-ingredient cold remedies containing paracetamol', 'Avoid chronic heavy alcohol consumption'],
    foodAdvice: 'Can be taken with or without food. Taking with water is recommended.'
  },
  ibuprofen: {
    genericName: 'Ibuprofen',
    classes: ['Non-Steroidal Anti-Inflammatory Drug (NSAID)'],
    indications: ['Inflammation', 'Pain', 'Fever', 'Arthritic conditions'],
    contraindications: ['Active peptic ulcer', 'Severe heart failure', 'Third trimester of pregnancy', 'Severe renal impairment', 'Known NSAID-induced asthma'],
    cautions: ['Risk of gastrointestinal ulceration/bleeding', 'May elevate blood pressure', 'Fluid retention'],
    foodAdvice: 'Always take with food or milk to minimize gastrointestinal discomfort.'
  },
  aspirin: {
    genericName: 'Aspirin (Acetylsalicylic Acid)',
    classes: ['NSAID', 'Antiplatelet agent'],
    indications: ['Cardiovascular prophylaxis', 'Acute coronary syndrome', 'Pain/fever (in adults)'],
    contraindications: ['Children/adolescents under 18 with viral illness (Reye syndrome risk)', 'Active bleeding', 'Hemophilia', 'Peptic ulcer'],
    cautions: ['Significantly increases bleeding risk', 'Gastrointestinal mucosal irritation'],
    foodAdvice: 'Take with or immediately after food or meals.'
  },
  metformin: {
    genericName: 'Metformin',
    classes: ['Biguanide', 'Oral Hypoglycemic'],
    indications: ['Type 2 Diabetes Mellitus'],
    contraindications: ['Severe renal impairment (eGFR < 30 mL/min)', 'Acute metabolic acidosis', 'Severe heart failure', 'Severe hepatic impairment'],
    cautions: ['Rare but serious risk of lactic acidosis', 'Hold temporarily before iodinated contrast procedures', 'Vitamin B12 deficiency with long-term use'],
    foodAdvice: 'Take with or right after meals to reduce stomach upset and nausea.'
  },
  atorvastatin: {
    genericName: 'Atorvastatin',
    classes: ['HMG-CoA Reductase Inhibitor (Statin)', 'Lipid-Lowering Agent'],
    indications: ['Hypercholesterolemia', 'Cardiovascular risk reduction'],
    contraindications: ['Active liver disease', 'Pregnancy and breastfeeding'],
    cautions: ['Report unexplained muscle pain, tenderness, or weakness (myopathy/rhabdomyolysis)', 'Avoid large quantities of grapefruit juice'],
    foodAdvice: 'Can be taken at any time of day, with or without food. Consistency in timing is recommended.'
  },
  amlodipine: {
    genericName: 'Amlodipine',
    classes: ['Calcium Channel Blocker (Dihydropyridine)', 'Antihypertensive'],
    indications: ['Hypertension', 'Chronic stable angina'],
    contraindications: ['Severe hypotension', 'Cardiogenic shock'],
    cautions: ['May cause peripheral pedal edema (ankle swelling)', 'Dizziness upon standing'],
    foodAdvice: 'May be taken with or without food.'
  },
  omeprazole: {
    genericName: 'Omeprazole',
    classes: ['Proton Pump Inhibitor (PPI)'],
    indications: ['Gastroesophageal reflux disease (GERD)', 'Peptic ulcer disease', 'Gastritis'],
    contraindications: ['Known hypersensitivity to PPIs'],
    cautions: ['Long-term use associated with hypomagnesemia, vitamin B12 deficiency, bone fracture risk', 'May mask gastric malignancy symptoms'],
    foodAdvice: 'Best taken in the morning 30 to 60 minutes before breakfast.'
  },
  pantoprazole: {
    genericName: 'Pantoprazole',
    classes: ['Proton Pump Inhibitor (PPI)'],
    indications: ['Acid reflux', 'Gastric ulcers', 'Zollinger-Ellison syndrome'],
    contraindications: ['Hypersensitivity to substituted benzimidazoles'],
    cautions: ['Long-term bone density considerations', 'Interaction with certain antifungal and antiretroviral agents'],
    foodAdvice: 'Take 30-60 minutes before a meal, swallowed whole with water.'
  },
  amoxicillin: {
    genericName: 'Amoxicillin',
    classes: ['Beta-Lactam Antibiotic', 'Aminopenicillin'],
    indications: ['Bacterial infections (respiratory, ear, throat, urinary)'],
    contraindications: ['Severe hypersensitivity / anaphylaxis to penicillin or beta-lactams'],
    cautions: ['Complete full course prescribed by physician even if symptoms improve to prevent antibiotic resistance', 'May cause diarrhea or mild rash'],
    foodAdvice: 'Can be taken with or without meals.'
  },
  azithromycin: {
    genericName: 'Azithromycin',
    classes: ['Macrolide Antibiotic'],
    indications: ['Atypical respiratory tract infections', 'Skin infections', 'Chlamydia'],
    contraindications: ['History of cholestatic jaundice or hepatic dysfunction with prior azithromycin'],
    cautions: ['QT interval prolongation risk', 'Never take for viral colds or flu', 'Finish complete course'],
    foodAdvice: 'Tablets can be taken with or without food; take at least 1 hour before or 2 hours after antacids containing aluminum or magnesium.'
  },
  losartan: {
    genericName: 'Losartan',
    classes: ['Angiotensin II Receptor Blocker (ARB)', 'Antihypertensive'],
    indications: ['Hypertension', 'Diabetic nephropathy'],
    contraindications: ['Pregnancy (boxed warning for fetotoxicity)', 'Concomitant aliskiren in diabetes'],
    cautions: ['Risk of hyperkalemia (high blood potassium)', 'Hypotension with volume depletion'],
    foodAdvice: 'Can be taken with or without food.'
  },
  warfarin: {
    genericName: 'Warfarin',
    classes: ['Vitamin K Antagonist', 'Anticoagulant'],
    indications: ['Venous thromboembolism', 'Atrial fibrillation thromboembolism prophylaxis'],
    contraindications: ['Active bleeding', 'Severe thrombocytopenia', 'Pregnancy'],
    cautions: ['High risk of serious bleeding', 'Requires regular INR monitoring', 'Interacts with dietary vitamin K (leafy greens) and numerous drugs'],
    foodAdvice: 'Maintain consistent dietary intake of vitamin K.'
  },
  tramadol: {
    genericName: 'Tramadol',
    classes: ['Opioid Analgesic', 'Centrally Acting'],
    indications: ['Moderate to severe pain'],
    contraindications: ['Acute intoxication with alcohol/sedatives', 'Severe respiratory depression', 'Concomitant MAOI use'],
    cautions: ['Risk of dependence, respiratory depression, seizures, and serotonin syndrome'],
    foodAdvice: 'Can be taken with or without food.'
  },
  cetirizine: {
    genericName: 'Cetirizine',
    classes: ['Second-Generation Antihistamine'],
    indications: ['Allergic rhinitis', 'Urticaria (hives)', 'Allergic itching'],
    contraindications: ['Severe renal failure (CrCl < 10 mL/min)'],
    cautions: ['May cause mild sedation/drowsiness in some individuals', 'Avoid alcohol while taking'],
    foodAdvice: 'Can be taken with or without food, preferably in the evening.'
  }
};

// Known high-risk clinical drug-drug interactions
const DRUG_INTERACTION_RULES = [
  {
    drugs: ['aspirin', 'warfarin'],
    severity: 'CRITICAL',
    title: 'Severe Bleeding Hemorrhage Risk',
    description: 'Combining Aspirin (antiplatelet) with Warfarin (anticoagulant) substantially multiplies gastrointestinal and intracranial bleeding risks. Co-administration requires strict hematological/cardiological oversight.',
    action: 'Do not combine without direct, supervised instructions and INR monitoring from your cardiologist or hematologist.'
  },
  {
    drugs: ['ibuprofen', 'aspirin'],
    severity: 'HIGH',
    title: 'Reduced Cardioprotective Effect & Increased GI Ulceration',
    description: 'Ibuprofen can competitively block the cardioprotective antiplatelet effect of low-dose aspirin and doubles the risk of stomach ulcers and bleeding.',
    action: 'Separate dosing if required, or consult physician for a safer alternative like paracetamol for pain relief.'
  },
  {
    drugs: ['ibuprofen', 'losartan'],
    severity: 'HIGH',
    title: 'Blunted Antihypertensive Response & Acute Kidney Injury Risk',
    description: 'NSAIDs (like Ibuprofen) decrease renal prostaglandin synthesis, which antagonizes the blood-pressure lowering effect of Losartan and significantly elevates the risk of acute renal dysfunction, especially if combined with diuretics.',
    action: 'Monitor blood pressure and renal function. Use paracetamol as the preferred first-line analgesic when taking antihypertensives.'
  },
  {
    drugs: ['tramadol', 'fluoxetine'],
    severity: 'CRITICAL',
    title: 'Serotonin Syndrome & Seizure Risk',
    description: 'Co-administration of serotonergic agents (tramadol + SSRIs) can trigger life-threatening Serotonin Syndrome (hyperthermia, clonus, autonomic instability) and lowers the seizure threshold.',
    action: 'Avoid co-administration. Immediate medical evaluation needed if tremor, agitation, fever, or confusion develop.'
  },
  {
    drugs: ['metformin', 'contrast'],
    severity: 'HIGH',
    title: 'Risk of Contrast-Induced Nephropathy and Lactic Acidosis',
    description: 'Iodinated radiopaque contrast agents used in CT scans can cause transient renal impairment leading to Metformin accumulation and severe lactic acidosis.',
    action: 'Metformin is typically paused at the time of or prior to iodinated contrast procedures and resumed 48 hours later after verifying normal renal function.'
  },
  {
    drugs: ['azithromycin', 'amiodarone'],
    severity: 'CRITICAL',
    title: 'Severe QT Prolongation and Ventricular Arrhythmias',
    description: 'Combining macrolide antibiotics with antiarrhythmics like Amiodarone can provoke severe cardiac QT interval prolongation and Torsades de Pointes.',
    action: 'Requires immediate cardiology review; alternative antimicrobial therapy should be selected.'
  },
  {
    drugs: ['paracetamol', 'alcohol'],
    severity: 'MODERATE',
    title: 'Elevated Hepatotoxicity Risk',
    description: 'Regular or excessive alcohol consumption depletes hepatic glutathione stores, dramatically increasing the vulnerability of liver tissue to paracetamol-induced hepatotoxicity.',
    action: 'Strictly avoid excessive alcohol while taking paracetamol.'
  }
];

// Allergy cross-reactivity mapping
const ALLERGY_CROSS_REACTIONS = [
  {
    allergyKeyword: /penicillin|amoxicillin|ampicillin|augmentin/i,
    contraindicatedDrugs: ['amoxicillin', 'ampicillin', 'amoxicillin-clavulanate', 'piperacillin'],
    cautionDrugs: ['cephalexin', 'cefuroxime', 'ceftriaxone', 'cefixime'],
    warning: 'Patient has a recorded Beta-Lactam / Penicillin allergy. Beta-lactam antibiotics are contraindicated due to severe anaphylaxis risk. Cephalosporins require cautious evaluation.'
  },
  {
    allergyKeyword: /nsaid|ibuprofen|aspirin|diclofenac|naproxen/i,
    contraindicatedDrugs: ['ibuprofen', 'aspirin', 'diclofenac', 'naproxen', 'mefenamic acid', 'ketorolac'],
    cautionDrugs: ['celecoxib'],
    warning: 'Patient has a recorded NSAID allergy. Cross-reactivity between different NSAIDs and Aspirin is common, potentially triggering bronchospasm, angioedema, or urticaria.'
  },
  {
    allergyKeyword: /sulfa|sulfonamide|cotrimoxazole|bactrim/i,
    contraindicatedDrugs: ['cotrimoxazole', 'sulfamethoxazole', 'sulfasalazine'],
    cautionDrugs: ['furosemide', 'hydrochlorothiazide', 'glimepiride'],
    warning: 'Patient has a recorded Sulfa allergy. Antibacterial sulfonamides are contraindicated.'
  }
];

/**
 * Normalizes drug name from user query to catalog key
 */
const normalizeDrugName = (input) => {
  if (!input) return null;
  const cleaned = String(input).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const key of Object.keys(DRUG_CATALOG)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return key;
    }
  }
  return null;
};

/**
 * Checks for drug-drug interactions among mentioned medicines
 * 
 * @param {Array<string>|string} drugs - List or string of drug names
 * @returns {Array} List of detected drug interactions
 */
const checkDrugInteractions = (drugs) => {
  const drugList = Array.isArray(drugs) 
    ? drugs.map(d => String(d).toLowerCase()) 
    : String(drugs).toLowerCase().split(/[\s,+/&]+/);

  const matchedKeys = new Set();
  for (const drug of drugList) {
    const norm = normalizeDrugName(drug);
    if (norm) matchedKeys.add(norm);
  }

  const interactions = [];
  const keysArray = Array.from(matchedKeys);

  for (const rule of DRUG_INTERACTION_RULES) {
    const [d1, d2] = rule.drugs;
    const hasD1 = keysArray.includes(d1) || drugList.some(d => d.includes(d1));
    const hasD2 = keysArray.includes(d2) || drugList.some(d => d.includes(d2));

    if (hasD1 && hasD2) {
      interactions.push(rule);
    }
  }

  return interactions;
};

/**
 * Checks for allergy alerts between patient's allergy profile and inquired drug
 * 
 * @param {string} drugName - Drug being inquired about
 * @param {Array<string>} patientAllergies - Allergies from patient's HealthId profile
 * @returns {Array} Allergy warnings if detected
 */
const checkAllergyAlert = (drugName, patientAllergies = []) => {
  if (!drugName || !Array.isArray(patientAllergies) || patientAllergies.length === 0) {
    return [];
  }

  const drugStr = String(drugName).toLowerCase();
  const alerts = [];

  for (const allergy of patientAllergies) {
    const allergyStr = String(allergy).trim();
    for (const rule of ALLERGY_CROSS_REACTIONS) {
      if (rule.allergyKeyword.test(allergyStr)) {
        const directMatch = rule.contraindicatedDrugs.some(d => drugStr.includes(d));
        const cautionMatch = rule.cautionDrugs.some(d => drugStr.includes(d));

        if (directMatch) {
          alerts.push({
            severity: 'CRITICAL',
            allergy: allergyStr,
            message: `CONTRAINDICATION: ${rule.warning}`
          });
        } else if (cautionMatch) {
          alerts.push({
            severity: 'CAUTION',
            allergy: allergyStr,
            message: `PRECAUTION: Potential cross-reactivity warning. ${rule.warning}`
          });
        }
      }
    }
  }

  return alerts;
};

/**
 * Retrieves standard pharmacological monograph for educational display
 * 
 * @param {string} drugName 
 * @returns {Object|null}
 */
const getMedicationProfile = (drugName) => {
  const norm = normalizeDrugName(drugName);
  return norm ? DRUG_CATALOG[norm] : null;
};

module.exports = {
  DRUG_CATALOG,
  checkDrugInteractions,
  checkAllergyAlert,
  getMedicationProfile,
  normalizeDrugName
};
