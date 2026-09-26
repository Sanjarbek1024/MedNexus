import type { ClinicalData } from "./api";

/** Symptom checklist, grouped by system. Codes match the backend rules engine's red-flag list. */
export const SYMPTOM_GROUPS: { id: string; codes: string[] }[] = [
  { id: "general", codes: ["fever", "chills", "fatigue", "weight_loss", "night_sweats", "sweating"] },
  { id: "respiratory", codes: ["cough", "sputum", "hemoptysis", "dyspnea", "severe_dyspnea", "wheezing", "sore_throat"] },
  { id: "cardiovascular", codes: ["chest_pain", "palpitations", "syncope", "edema_legs"] },
  {
    id: "neuro",
    codes: ["headache", "thunderclap_headache", "dizziness", "confusion", "seizure", "focal_deficit", "vision_change", "neck_stiffness"],
  },
  { id: "gi", codes: ["nausea", "vomiting", "abdominal_pain", "diarrhea"] },
  { id: "musculoskeletal", codes: ["pain", "swelling", "trauma", "limited_motion"] },
];

/** Symptoms the rules engine treats as red flags on their own (shown with a marker). */
export const RED_FLAG_SYMPTOMS = new Set([
  "hemoptysis", "chest_pain", "syncope", "focal_deficit", "thunderclap_headache", "seizure", "confusion",
  "severe_dyspnea", "neck_stiffness", "weight_loss", "night_sweats",
]);

export const HISTORY_CODES = [
  "hypertension", "diabetes", "copd_asthma", "heart_disease", "ckd", "cancer", "immunosuppression", "tb_history",
  "pregnancy", "anticoagulants",
];

const KNOWN_SYMPTOMS = new Set(SYMPTOM_GROUPS.flatMap((g) => g.codes));
export const isKnownSymptom = (code: string) => KNOWN_SYMPTOMS.has(code);
export const isKnownHistory = (code: string) => HISTORY_CODES.includes(code);

export const emptyClinical = (): ClinicalData => ({
  chief_complaint: "",
  onset: "",
  duration: "",
  severity: "",
  symptoms: [],
  vitals: {
    temperature: null, heart_rate: null, resp_rate: null, systolic: null, diastolic: null, spo2: null,
    on_oxygen: false, consciousness: "alert",
  },
  history: [],
  medications: "",
  allergies: "",
  smoking: "",
  exam: "",
  labs: "",
});

export const hasVitals = (data: ClinicalData) =>
  [data.vitals.temperature, data.vitals.heart_rate, data.vitals.resp_rate, data.vitals.systolic, data.vitals.spo2].some(
    (v) => v !== null,
  ) || data.vitals.consciousness !== "alert";

export const hasIntake = (data: ClinicalData) => Boolean(data.chief_complaint.trim() || data.symptoms.length);
