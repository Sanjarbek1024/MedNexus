import type { ClinicalData, Language, Sex } from "./api";
import { emptyClinical } from "./clinical";

/** A fictional teaching case served from public/samples/cases.json (also used by scripts/download_samples.py). */
export interface SampleCase {
  id: string;
  age: number;
  sex: Sex;
  image: { file: string; modality: string; region: string; view: string } | null;
  clinical: Partial<ClinicalData>;
  locale: Record<Language, {
    title: string;
    chief_complaint: string;
    duration: string;
    hpi: string;
    medications: string;
    exam: string;
    labs: string;
    expected: string;
  }>;
}

let cache: Promise<SampleCase[]> | null = null;

export function loadSampleCases(): Promise<SampleCase[]> {
  cache ??= fetch("/samples/cases.json").then((response) => {
    if (!response.ok) throw new Error(`sample cases: ${response.status}`);
    return response.json() as Promise<SampleCase[]>;
  });
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

/** The intake a sample case fills in, in the given language. */
export function sampleIntake(sample: SampleCase, language: Language): ClinicalData {
  const text = sample.locale[language] ?? sample.locale.en;
  const base = emptyClinical();
  return {
    ...base,
    ...sample.clinical,
    vitals: { ...base.vitals, ...sample.clinical.vitals },
    chief_complaint: text.chief_complaint,
    duration: text.duration,
    medications: text.medications,
    exam: text.exam,
    labs: text.labs,
  };
}

export async function sampleImage(sample: SampleCase): Promise<File | null> {
  if (!sample.image) return null;
  const response = await fetch(`/samples/${sample.image.file}`);
  if (!response.ok) throw new Error(`sample image: ${response.status}`);
  const blob = await response.blob();
  return new File([blob], sample.image.file, { type: blob.type || "image/jpeg" });
}
