// Typed client for the MedNexus API. Types mirror backend/app/schemas.py.

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckCategory = "quality" | "distribution" | "agreement" | "metadata" | "report";
export type Level = "high" | "moderate" | "uncertain";
export type CaseStatus = "image_rejected" | "draft" | "confirmed" | "rejected" | "edited";
export type ReviewAction = "confirm" | "reject" | "edit";
export type Stage = "quality" | "models" | "explainability" | "report";

export interface ViewOption { id: string; label: string; supported: boolean; analyzers: string[] }
export interface RegionOption { id: string; label: string; supported: boolean; views: ViewOption[] }
export interface ModalityOption { id: string; label: string; supported: boolean; regions: RegionOption[] }
export interface Capabilities {
  modalities: ModalityOption[];
  languages: { id: string; label: string }[];
  default_language: string;
}

export interface Health {
  status: "ok";
  version: string;
  device: string;
  analyzers: { id: string; label: string; versions: Record<string, string> }[];
  llm: { provider: string; model: string; configured: boolean };
}

export interface Box { x: number; y: number; width: number; height: number }
export interface Selection { modality: string; region: string; view: string; language: string }
export interface Check {
  id: string;
  category: CheckCategory;
  label: string;
  status: CheckStatus;
  detail: string;
  blocking: boolean;
}
export interface Finding {
  name: string;
  score: number;
  level: Level;
  model_scores: Record<string, number>;
  models_agree: boolean;
  heatmap: { url: string; box: Box } | null;
  explanation: string | null;
}
export interface Structure { label: string; path: string; size: number; box: Box }
export interface Measurement { id: string; label: string; value: number; reference: number | null; detail: string }
export interface Report {
  language: string;
  model: string;
  summary: string;
  next_steps: string[];
  limitations: string[];
  removed_findings: string[];
}
export interface Review {
  action: ReviewAction;
  reviewer: string;
  notes: string;
  final_impression: string | null;
  reviewed_at: string;
}
export interface AuditEvent {
  id: number;
  timestamp: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  hash: string;
}
export interface AnalysisResult {
  case_id: number;
  created_at: string;
  status: CaseStatus;
  selection: Selection;
  image: { url: string; width: number; height: number; format: string; sha256: string };
  rejected: boolean;
  rejection_reasons: string[];
  checks: Check[];
  findings: Finding[];
  other_scores: { name: string; score: number }[];
  not_assessed: string[];
  thresholds: Record<string, number>;
  structures: Structure[];
  measurements: Measurement[];
  report: Report | null;
  report_error: string | null;
  versions: Record<string, Record<string, string>>;
  timings_ms: Record<string, number>;
  review: Review | null;
  audit: AuditEvent[];
}
export interface CaseSummary {
  id: number;
  created_at: string;
  status: CaseStatus;
  modality: string;
  region: string;
  view: string;
  headline: string | null;
  finding_count: number;
  thumbnail: string;
  reviewer: string | null;
}
export interface ReviewRequest {
  action: ReviewAction;
  reviewer: string;
  notes: string;
  final_impression?: string;
}

export class ApiError extends Error {}

/** Calls `load` until it succeeds (e.g. while the backend is still loading its models). */
export function retryUntilLoaded<T>(load: () => Promise<T>, onLoad: (value: T) => void, onFail: () => void) {
  let timer = 0;
  let cancelled = false;
  const attempt = () =>
    load().then(
      (value) => !cancelled && onLoad(value),
      () => {
        if (cancelled) return;
        onFail();
        timer = window.setTimeout(attempt, 2000);
      },
    );
  attempt();
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError("Cannot reach the MedNexus server. Is the backend running?");
  }
  if (!response.ok) throw new ApiError(await errorDetail(response));
  return response.json() as Promise<T>;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {
    // fall through to the status text
  }
  return `Request failed (${response.status})`;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/health"),
  capabilities: () => request<Capabilities>("/capabilities"),
  cases: () => request<{ items: CaseSummary[]; total: number }>("/cases?limit=200"),
  case: (id: number) => request<AnalysisResult>(`/cases/${id}`),
  review: (id: number, body: ReviewRequest) => request<AnalysisResult>(`/cases/${id}/review`, json(body)),
  report: (id: number, language: string) =>
    request<AnalysisResult>(`/cases/${id}/report`, json({ language })),
  verifyAudit: () => request<{ valid: boolean; events: number }>("/audit/verify"),

  /** Upload a study; progress events arrive while the models run. */
  async analyze(
    file: File,
    selection: Selection,
    onProgress: (stage: Stage) => void,
  ): Promise<AnalysisResult> {
    const form = new FormData();
    form.append("file", file);
    Object.entries(selection).forEach(([key, value]) => form.append(key, value));

    let response: Response;
    try {
      response = await fetch("/api/analyze", {
        method: "POST",
        body: form,
        headers: { Accept: "text/event-stream" },
      });
    } catch {
      throw new ApiError("Cannot reach the MedNexus server. Is the backend running?");
    }
    if (!response.ok || !response.body) throw new ApiError(await errorDetail(response));

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1] ?? "{}";
        if (event === "progress") onProgress(JSON.parse(data).stage);
        if (event === "result") return JSON.parse(data) as AnalysisResult;
        if (event === "error") throw new ApiError(JSON.parse(data).detail);
      }
    }
    throw new ApiError("The analysis stream ended unexpectedly.");
  },
};
