import type { CaseStatus, Level, Selection } from "./api";

export const LEVELS: Record<Level, { label: string; chip: string; bar: string }> = {
  high: { label: "High", chip: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", bar: "from-rose-400 to-rose-500" },
  moderate: {
    label: "Moderate",
    chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    bar: "from-amber-300 to-amber-500",
  },
  uncertain: {
    label: "Uncertain – physician review required",
    chip: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
    bar: "from-slate-300 to-slate-400",
  },
};

export const STATUSES: Record<CaseStatus, { label: string; chip: string }> = {
  draft: { label: "Draft (AI)", chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  confirmed: { label: "Confirmed", chip: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  rejected: { label: "Rejected by physician", chip: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
  edited: { label: "Edited by physician", chip: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  image_rejected: { label: "Image rejected", chip: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
};

const MODEL_NAMES: Record<string, string> = {
  "densenet121-res224-all": "DenseNet-121",
  "resnet50-res512-all": "ResNet-50",
};

export const modelName = (weights: string): string => MODEL_NAMES[weights] ?? weights;

export const score = (value: number): string => value.toFixed(2);

const MODALITY_NAMES: Record<string, string> = { xray: "X-ray", ct: "CT", mri: "MRI" };

export function studyLabel(selection: Pick<Selection, "modality" | "region" | "view">): string {
  const region = selection.region.charAt(0).toUpperCase() + selection.region.slice(1);
  return [MODALITY_NAMES[selection.modality] ?? selection.modality, region, selection.view].join(" · ");
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export const caseNumber = (id: number): string => `#${String(id).padStart(4, "0")}`;
