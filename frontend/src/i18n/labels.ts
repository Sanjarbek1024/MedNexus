import type { Language } from "../lib/api";

// Model outputs keep their English names in the API and the audit log; the UI localizes them.
const FINDINGS: Record<Exclude<Language, "en">, Record<string, string>> = {
  uz: {
    Atelectasis: "Atelektaz",
    Consolidation: "Konsolidatsiya",
    Infiltration: "Infiltratsiya",
    Pneumothorax: "Pnevmotoraks",
    Edema: "O‘pka shishi",
    Emphysema: "Emfizema",
    Fibrosis: "Fibroz",
    Effusion: "Plevral suyuqlik",
    Pneumonia: "Pnevmoniya",
    "Pleural thickening": "Plevra qalinlashuvi",
    Cardiomegaly: "Kardiomegaliya",
    Nodule: "Tugun",
    Mass: "Hosila",
    Hernia: "Churra",
    "Lung lesion": "O‘pkadagi o‘choq",
    Fracture: "Sinish",
    "Lung opacity": "O‘pka xiralashuvi",
    "Enlarged cardiomediastinum": "Kardiomediastinum kengayishi",
    "Bone anomaly": "Suyak anomaliyasi",
    "Bone lesion": "Suyakdagi o‘choq",
    "Foreign body": "Yot jism",
    Metal: "Metall (implant)",
    "Periosteal reaction": "Periostal reaksiya",
    "Pronator sign": "Pronator belgisi",
    "Soft tissue finding": "Yumshoq to‘qima o‘zgarishi",
    "Cardiothoracic ratio": "Kardiotorakal indeks",
    Glioma: "Glioma",
    Meningioma: "Meningioma",
    "Pituitary tumor": "Gipofiz o‘smasi",
    "No tumor": "O‘sma aniqlanmadi",
  },
  ru: {
    Atelectasis: "Ателектаз",
    Consolidation: "Консолидация",
    Infiltration: "Инфильтрация",
    Pneumothorax: "Пневмоторакс",
    Edema: "Отёк лёгких",
    Emphysema: "Эмфизема",
    Fibrosis: "Фиброз",
    Effusion: "Плевральный выпот",
    Pneumonia: "Пневмония",
    "Pleural thickening": "Утолщение плевры",
    Cardiomegaly: "Кардиомегалия",
    Nodule: "Узел",
    Mass: "Образование",
    Hernia: "Грыжа",
    "Lung lesion": "Очаг в лёгком",
    Fracture: "Перелом",
    "Lung opacity": "Затемнение лёгкого",
    "Enlarged cardiomediastinum": "Расширение кардиомедиастинальной тени",
    "Bone anomaly": "Аномалия кости",
    "Bone lesion": "Очаг в кости",
    "Foreign body": "Инородное тело",
    Metal: "Металл (имплант)",
    "Periosteal reaction": "Периостальная реакция",
    "Pronator sign": "Симптом пронатора",
    "Soft tissue finding": "Изменения мягких тканей",
    "Cardiothoracic ratio": "Кардиоторакальный индекс",
    Glioma: "Глиома",
    Meningioma: "Менингиома",
    "Pituitary tumor": "Опухоль гипофиза",
    "No tumor": "Опухоль не выявлена",
  },
};

const TAXONOMY: Record<Language, Record<string, string>> = {
  en: {
    xray: "X-ray", ct: "CT", mri: "MRI", chest: "Chest", head: "Head", abdomen: "Abdomen", spine: "Spine",
    extremity: "Extremity", PA: "PA", AP: "AP", Lateral: "Lateral", Axial: "Axial", Coronal: "Coronal", Sagittal: "Sagittal",
  },
  uz: {
    xray: "Rentgen", ct: "KT", mri: "MRT", chest: "Ko‘krak qafasi", head: "Bosh", abdomen: "Qorin", spine: "Umurtqa",
    extremity: "Qo‘l-oyoq", PA: "PA", AP: "AP", Lateral: "Yon", Axial: "Aksial", Coronal: "Koronal", Sagittal: "Sagittal",
  },
  ru: {
    xray: "Рентген", ct: "КТ", mri: "МРТ", chest: "Грудная клетка", head: "Голова", abdomen: "Живот", spine: "Позвоночник",
    extremity: "Конечность", PA: "ПЗ", AP: "ЗП", Lateral: "Боковая", Axial: "Аксиальная", Coronal: "Корональная", Sagittal: "Сагиттальная",
  },
};

export const findingName = (language: Language, name: string): string =>
  language === "en" ? name : (FINDINGS[language][name] ?? name);

export const taxonomyLabel = (language: Language, id: string): string => TAXONOMY[language][id] ?? id;

// Assessment.specialty and Hospital.specialties use these ids.
const SPECIALTIES: Record<Language, Record<string, string>> = {
  en: {
    pulmonology: "Pulmonology", oncology: "Oncology", neurosurgery: "Neurosurgery", neurology: "Neurology",
    traumatology: "Traumatology", cardiology: "Cardiology", general: "General practice",
  },
  uz: {
    pulmonology: "Pulmonologiya", oncology: "Onkologiya", neurosurgery: "Neyroxirurgiya", neurology: "Nevrologiya",
    traumatology: "Travmatologiya", cardiology: "Kardiologiya", general: "Umumiy amaliyot",
  },
  ru: {
    pulmonology: "Пульмонология", oncology: "Онкология", neurosurgery: "Нейрохирургия", neurology: "Неврология",
    traumatology: "Травматология", cardiology: "Кардиология", general: "Общая практика",
  },
};

export const specialtyLabel = (language: Language, id: string): string => SPECIALTIES[language][id] ?? id;
