import type { CaseStatus, Level, Priority, Trend } from "./api";

export const LEVEL_STYLES: Record<Level, { chip: string; bar: string }> = {
  high: { chip: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", bar: "from-rose-400 to-rose-500" },
  moderate: { chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", bar: "from-amber-300 to-amber-500" },
  uncertain: { chip: "bg-slate-100 text-slate-600 ring-1 ring-slate-200", bar: "from-slate-300 to-slate-400" },
};

export const STATUS_STYLES: Record<CaseStatus, string> = {
  queued: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  analyzing: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  ai_ready: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  reviewed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  image_rejected: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

export const PRIORITY_STYLES: Record<Priority, { chip: string; dot: string }> = {
  urgent: { chip: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", dot: "bg-rose-500" },
  attention: { chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", dot: "bg-amber-500" },
  routine: { chip: "bg-slate-100 text-slate-500 ring-1 ring-slate-200", dot: "bg-slate-300" },
};

export const TREND_STYLES: Record<Trend, string> = {
  worsened: "text-rose-600",
  new: "text-rose-600",
  improved: "text-emerald-600",
  resolved: "text-emerald-600",
  stable: "text-slate-400",
};

const MODEL_NAMES: Record<string, string> = {
  "densenet121-res224-all": "DenseNet-121",
  "resnet50-res512-all": "ResNet-50",
  "yolov7-p6-bonefracture": "YOLOv7 (fracture)",
  "vit-b16-brain-tumor": "ViT-B/16 (brain tumor)",
  "chestx-det-pspnet": "PSPNet (anatomy)",
  "autoencoder-101-elastic": "ResNet autoencoder (OOD)",
};

export const modelName = (weights: string): string => MODEL_NAMES[weights] ?? weights;

export const caseNumber = (id: number): string => `#${String(id).padStart(4, "0")}`;

/** Minutes between an ISO timestamp and ``until`` (default now). */
export const minutesSince = (iso: string, until?: string | null): number =>
  Math.max(0, ((until ? new Date(until) : new Date()).getTime() - new Date(iso).getTime()) / 60000);
