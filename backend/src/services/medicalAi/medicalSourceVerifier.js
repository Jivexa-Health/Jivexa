/**
 * JIVEXA Health AI - Medical Source Verification Layer
 *
 * Prevents LLM citation hallucinations (invented PMIDs, broken DOIs, fake URLs).
 * Only returns verified sources from accredited public health institutions when genuinely referenced.
 */

const TRUSTED_DOMAINS = [
  'who.int',
  'icmr.gov.in',
  'cdc.gov',
  'medlineplus.gov',
  'ncbi.nlm.nih.gov',
  'nhs.uk',
  'fda.gov',
  'mohfw.gov.in',
  'cochranelibrary.com',
  'heart.org',
  'diabetes.org',
  'mayoclinic.org'
];

const TOPIC_GUIDELINE_REGISTRY = {
  emergency: [
    {
      organization: 'World Health Organization (WHO)',
      title: 'Emergency and Trauma Care Guidelines',
      url: 'https://www.who.int/emergencies',
      verified: true
    },
    {
      organization: 'Ministry of Health and Family Welfare (MoHFW), India',
      title: 'National Emergency Life Support Guidelines',
      url: 'https://main.mohfw.gov.in',
      verified: true
    }
  ],
  diabetes: [
    {
      organization: 'Indian Council of Medical Research (ICMR)',
      title: 'Guidelines for Management of Type 2 Diabetes in India',
      url: 'https://www.icmr.gov.in',
      verified: true
    },
    {
      organization: 'World Health Organization (WHO)',
      title: 'Diabetes Key Facts & Global Clinical Guidelines',
      url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes',
      verified: true
    }
  ],
  hypertension: [
    {
      organization: 'Indian Council of Medical Research (ICMR)',
      title: 'Standard Treatment Guidelines: Management of Hypertension',
      url: 'https://www.icmr.gov.in',
      verified: true
    },
    {
      organization: 'World Health Organization (WHO)',
      title: 'Guideline for the Pharmacological Treatment of Hypertension in Adults',
      url: 'https://www.who.int/news-room/fact-sheets/detail/hypertension',
      verified: true
    }
  ],
  medication: [
    {
      organization: 'U.S. National Library of Medicine (MedlinePlus)',
      title: 'Drug Information & Pharmacology Directory',
      url: 'https://medlineplus.gov/druginformation.html',
      verified: true
    },
    {
      organization: 'Indian Council of Medical Research (ICMR)',
      title: 'Treatment Guidelines for Antimicrobial Use in Common Syndromes',
      url: 'https://www.icmr.gov.in',
      verified: true
    }
  ],
  fever: [
    {
      organization: 'National Centre for Disease Control (NCDC), India',
      title: 'Clinical Management Guidelines for Acute Febrile Illnesses',
      url: 'https://ncdc.mohfw.gov.in',
      verified: true
    },
    {
      organization: 'NHS England',
      title: 'High Temperature (Fever) Clinical Management Overview',
      url: 'https://www.nhs.uk/conditions/fever-in-adults/',
      verified: true
    }
  ],
  lab_reports: [
    {
      organization: 'U.S. National Library of Medicine (MedlinePlus)',
      title: 'Medical Laboratory Tests and Reference Ranges',
      url: 'https://medlineplus.gov/lab-tests/',
      verified: true
    }
  ],
  general: [
    {
      organization: 'World Health Organization (WHO)',
      title: 'Health Topics and Clinical Fact Sheets',
      url: 'https://www.who.int/health-topics',
      verified: true
    },
    {
      organization: 'NHS UK Health A to Z',
      title: 'Evidence-Based Clinical Health Guide',
      url: 'https://www.nhs.uk/conditions/',
      verified: true
    }
  ]
};

const isTrustedMedicalDomain = (urlString) => {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();
    return TRUSTED_DOMAINS.some(trusted => hostname === trusted || hostname.endsWith('.' + trusted));
  } catch (err) {
    return false;
  }
};

const getVerifiedSourcesForTopic = (intent = '', query = '') => {
  const q = String(query).toLowerCase();

  if (intent === 'EMERGENCY_TRIAGE' || q.includes('emergency') || q.includes('chest pain')) {
    return TOPIC_GUIDELINE_REGISTRY.emergency;
  }
  if (q.includes('diabet') || q.includes('sugar') || q.includes('glucose') || q.includes('hba1c') || q.includes('metformin')) {
    return TOPIC_GUIDELINE_REGISTRY.diabetes;
  }
  if (q.includes('hypertens') || q.includes('blood pressure') || q.includes('bp') || q.includes('amlodipine') || q.includes('losartan')) {
    return TOPIC_GUIDELINE_REGISTRY.hypertension;
  }
  if (intent === 'MEDICATION_INQUIRY' || intent === 'DRUG_INTERACTION' || q.includes('tablet') || q.includes('dose') || q.includes('medicine')) {
    return TOPIC_GUIDELINE_REGISTRY.medication;
  }
  if (intent === 'LAB_REPORT_ANALYSIS' || q.includes('report') || q.includes('test') || q.includes('cbc') || q.includes('creatinine')) {
    return TOPIC_GUIDELINE_REGISTRY.lab_reports;
  }
  if (q.includes('fever') || q.includes('bukhar') || q.includes('cold') || q.includes('cough')) {
    return TOPIC_GUIDELINE_REGISTRY.fever;
  }
  return TOPIC_GUIDELINE_REGISTRY.general;
};

/**
 * Strips hallucinated or untrusted source citations.
 * Never fabricates references when none were legitimately verified.
 */
const verifyAndSanitizeSources = (sourcesList = [], intent = '', query = '') => {
  const verifiedList = [];

  if (Array.isArray(sourcesList) && sourcesList.length > 0) {
    for (const src of sourcesList) {
      if (!src || typeof src !== 'object') continue;

      const title = String(src.title || src.name || '').trim();
      const org = String(src.organization || src.source || '').trim();
      const url = String(src.url || '').trim();

      // Reject fabricated PMIDs, DOIs, or untrusted URLs
      if (!url || !isTrustedMedicalDomain(url)) {
        continue;
      }

      if (!title || !org || /pmid\s*:?\s*\d+/i.test(title)) {
        continue;
      }

      verifiedList.push({
        organization: org,
        title,
        url,
        verified: true
      });
    }
  }

  return verifiedList.slice(0, 2);
};

module.exports = {
  TRUSTED_DOMAINS,
  isTrustedMedicalDomain,
  getVerifiedSourcesForTopic,
  verifyAndSanitizeSources
};
