// Typed client for the MedNexus API. Types mirror backend/app/schemas.py.

export type Language = "uz" | "en" | "ru";
export type Role = "radiologist" | "resident" | "admin";
export type CheckStatus = "pass" | "warn" | "fail";
export type CheckCategory = "quality" | "distribution" | "agreement" | "metadata" | "report";
export type Level = "high" | "moderate" | "uncertain";
export type CaseStatus = "queued" | "analyzing" | "ai_ready" | "reviewed" | "image_rejected" | "failed";
export type Priority = "urgent" | "attention" | "routine";
export type ReviewAction = "confirm" | "edit" | "reject";
export type Stage = "quality" | "models" | "explainability" | "report";
export type Trend = "improved" | "stable" | "worsened" | "new" | "resolved";

export interface User { id: number; email: string; full_name: string; role: Role; language: Language; created_at: string }
export interface AdminUser extends User { is_active: boolean; locked: boolean; last_login_at: string | null }

export interface ViewOption { id: string; label: string; supported: boolean; analyzers: string[] }
export interface RegionOption { id: string; label: string; supported: boolean; views: ViewOption[] }
export interface ModalityOption { id: string; label: string; supported: boolean; regions: RegionOption[] }
export interface Capabilities {
  modalities: ModalityOption[];
  languages: { id: Language; label: string }[];
  default_language: Language;
}
export interface Health {
  status: "ok";
  version: string;
  device: string;
  database: string;
  analyzers: { id: string; label: string; versions: Record<string, string> }[];
  llm: { provider: string; model: string; configured: boolean };
}

export interface Box { x: number; y: number; width: number; height: number }
export interface Detection extends Box { score: number }
export interface Selection { modality: string; region: string; view: string; language: Language }
export interface Check {
  id: string;
  category: CheckCategory;
  label: string;
  status: CheckStatus;
  detail: string;
  blocking: boolean;
  code: string | null;
  params: Record<string, string | number>;
}
export interface Finding {
  name: string;
  score: number;
  level: Level;
  model_scores: Record<string, number>;
  models_agree: boolean;
  heatmap: { url: string; box: Box } | null;
  boxes: Detection[];
  explanation: string | null;
}
export interface Structure { label: string; path: string; size: number; box: Box }
export interface Measurement { id: string; label: string; value: number; reference: number | null; detail: string }
export interface Report {
  language: Language;
  model: string;
  summary: string;
  next_steps: string[];
  limitations: string[];
  removed_findings: string[];
}
export interface ReportSections { findings: string; impression: string; recommendations: string }
export interface PhysicianReport extends ReportSections {
  status: "draft" | "final";
  author: string | null;
  updated_at: string;
  signed_at: string | null;
}
export interface Review {
  action: ReviewAction;
  reviewer: string;
  notes: string;
  final_impression: string | null;
  finding_decisions: Record<string, "agree" | "disagree">;
  added_findings: string[];
  reviewed_at: string;
}
export interface AuditEvent { id: number; timestamp: string; action: string; actor: string; details: Record<string, unknown>; hash: string }
export interface PatientRef { id: number; pseudonym: string }
export interface AnalysisResult {
  case_id: number;
  created_at: string;
  status: CaseStatus;
  priority: Priority;
  priority_reason: string | null;
  patient: PatientRef | null;
  owner: string | null;
  acquired_at: string | null;
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
  physician_report: PhysicianReport | null;
  suggested_report: ReportSections | null;
  versions: Record<string, Record<string, string>>;
  timings_ms: Record<string, number>;
  review: Review | null;
  audit: AuditEvent[];
}
export interface CaseSummary {
  id: number;
  created_at: string;
  acquired_at: string;
  status: CaseStatus;
  priority: Priority;
  priority_reason: string | null;
  modality: string;
  region: string;
  view: string;
  headline: string | null;
  finding_count: number;
  thumbnail: string | null;
  patient: PatientRef;
  owner: string;
  reviewer: string | null;
  reviewed_at: string | null;
  error: string | null;
}
export interface ReviewRequest {
  action: ReviewAction;
  notes?: string;
  report?: ReportSections;
  finding_decisions?: Record<string, "agree" | "disagree">;
  added_findings?: string[];
}
export interface ChatMessage { id: number; role: "user" | "assistant"; content: string; language: Language; author: string | null; created_at: string }
export interface PatientSummary { id: number; pseudonym: string; case_count: number; last_study_at: string | null }
export interface Delta { name: string; prior: number | null; current: number | null; change: number | null; trend: Trend; reported: boolean }
export interface Comparison {
  prior: AnalysisResult;
  current: AnalysisResult;
  deltas: Delta[];
  interval_days: number;
  summary: string | null;
  summary_error: string | null;
}
export interface TrainingCase { case_id: number; image: AnalysisResult["image"]; selection: Selection; candidates: string[]; attempted: number }
export interface LabelOutcome { name: string; resident: boolean; reference: boolean; ai: boolean }
export interface TrainingReveal {
  attempt_id: number;
  score: number;
  outcomes: LabelOutcome[];
  reference: string[];
  ai_findings: string[];
  ai_was_wrong: boolean;
  reviewer: string | null;
  impression: string | null;
  result: AnalysisResult;
}
export interface TrainingStats {
  attempts: number;
  average_score: number | null;
  per_pathology: { name: string; attempts: number; correct: number; sensitivity: number | null; false_positives: number }[];
  recent: { case_id: number; score: number; ai_was_wrong: boolean; created_at: string }[];
}
export interface AIMistake {
  case_id: number;
  thumbnail: string | null;
  study: string;
  ai_findings: string[];
  reference: string[];
  missed_by_ai: string[];
  false_alarms: string[];
  reviewer: string;
  notes: string;
}
export interface DashboardStats {
  open_cases: number;
  urgent_open: number;
  queued_today: number;
  reviewed_today: number;
  avg_turnaround_minutes: number | null;
  agreement_rate: number | null;
  decisions: number;
  daily: { day: string; uploaded: number; reviewed: number }[];
  urgent_cases: CaseSummary[];
}
export interface SafetyStats {
  analyses: number;
  rejected_images: number;
  rejection_reasons: Record<string, number>;
  low_confidence_rate: number | null;
  model_disagreement_rate: number | null;
  override_rate: number | null;
  per_pathology: { name: string; agree: number; disagree: number; missed: number }[];
  weekly: { week: string; agreement_rate: number | null; decisions: number }[];
  llm_removed_items: number;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

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

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const SESSION_EXPIRED = "mednexus:session-expired";

function csrfToken(): string {
  return document.cookie.split("; ").find((c) => c.startsWith("mnx_csrf="))?.slice(9) ?? "";
}

/** The CSRF cookie lives as long as the refresh token, so it tells whether a session may exist. */
export const hasSession = (): boolean => csrfToken() !== "";

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit an expired access token. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", headers: { "X-CSRF-Token": csrfToken() } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

async function send(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (UNSAFE.has((init.method ?? "GET").toUpperCase())) headers.set("X-CSRF-Token", csrfToken());
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError("offline", 0);
  }
  const authRoute = path.startsWith("/auth/login") || path.startsWith("/auth/refresh") || path.startsWith("/auth/register");
  if (response.status === 401 && retry && !authRoute && hasSession()) {
    if (await refreshSession()) return send(path, init, false);
    window.dispatchEvent(new Event(SESSION_EXPIRED));
  }
  if (!response.ok) throw new ApiError(await errorDetail(response), response.status);
  return response;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, "")).join("; ");
  } catch {
    // not JSON
  }
  return `HTTP ${response.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Parses a server-sent-events response body and calls `onEvent` for each event. */
async function readEvents(response: Response, onEvent: (event: string, data: unknown) => boolean | void): Promise<void> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}");
      if (onEvent(event, data) === false) return;
    }
  }
}

export interface CaseQuery {
  group?: "new" | "ai_ready" | "reviewed" | "rejected" | "open";
  priority?: Priority;
  q?: string;
  patient_id?: number;
  sort?: "worklist" | "recent";
  limit?: number;
}

export const api = {
  health: () => request<Health>("/health"),
  capabilities: () => request<Capabilities>("/capabilities"),

  me: () => request<User>("/auth/me"),
  login: (email: string, password: string) => request<User>("/auth/login", json({ email, password })),
  register: (body: { email: string; full_name: string; password: string; role: Role; language: Language }) =>
    request<User>("/auth/register", json(body)),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  updateProfile: (body: { full_name?: string; language?: Language }) => request<User>("/auth/me", json(body, "PATCH")),
  changePassword: (current_password: string, new_password: string) =>
    request<User>("/auth/change-password", json({ current_password, new_password })),

  users: () => request<AdminUser[]>("/users"),
  updateUser: (id: number, body: { role?: Role; is_active?: boolean; unlock?: boolean }) =>
    request<AdminUser>(`/users/${id}`, json(body, "PATCH")),

  cases: (query: CaseQuery = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
    );
    return request<{ items: CaseSummary[]; total: number }>(`/cases?${params}`);
  },
  case: (id: number) => request<AnalysisResult>(`/cases/${id}`),
  review: (id: number, body: ReviewRequest) => request<AnalysisResult>(`/cases/${id}/review`, json(body)),
  saveDraft: (id: number, body: ReportSections) => request<AnalysisResult>(`/cases/${id}/report/draft`, json(body, "PUT")),
  regenerateReport: (id: number, language: Language) => request<AnalysisResult>(`/cases/${id}/report`, json({ language })),
  verifyAudit: () => request<{ valid: boolean; events: number }>("/audit/verify"),

  chatHistory: (id: number) => request<ChatMessage[]>(`/cases/${id}/chat`),
  async chat(id: number, message: string, language: Language, onToken: (text: string) => void): Promise<void> {
    const response = await send(`/cases/${id}/chat`, {
      ...json({ message, language }),
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    });
    let failure: string | null = null;
    await readEvents(response, (event, data) => {
      const payload = data as { text?: string; detail?: string };
      if (event === "token") onToken(payload.text ?? "");
      if (event === "error") failure = payload.detail ?? "error";
    });
    if (failure) throw new ApiError(failure, 502);
  },

  patients: (minCases = 1, q?: string) =>
    request<PatientSummary[]>(`/patients?min_cases=${minCases}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  compare: (prior_id: number, current_id: number, language: Language) =>
    request<Comparison>("/compare", json({ prior_id, current_id, language })),

  trainingNext: (exclude?: number) => request<TrainingCase | undefined>(`/training/next${exclude ? `?exclude=${exclude}` : ""}`),
  trainingAttempt: (caseId: number, selected: string[], marks: { x: number; y: number }[]) =>
    request<TrainingReveal>(`/training/${caseId}/attempt`, json({ selected, marks })),
  trainingStats: () => request<TrainingStats>("/training/stats"),
  aiMistakes: () => request<AIMistake[]>("/training/ai-mistakes"),

  dashboard: () => request<DashboardStats>(`/stats/dashboard?tz_offset=${new Date().getTimezoneOffset()}`),
  safety: () => request<SafetyStats>("/stats/safety"),

  /** Upload one study; progress events arrive while the models run. */
  async analyze(
    file: File,
    fields: Selection & { patient_id?: number; acquired_on?: string },
    onProgress: (stage: Stage) => void,
  ): Promise<AnalysisResult> {
    const form = new FormData();
    form.append("file", file);
    Object.entries(fields).forEach(([key, value]) => value !== undefined && value !== "" && form.append(key, String(value)));
    const response = await send("/analyze", { method: "POST", body: form, headers: { Accept: "text/event-stream" } });
    let result: AnalysisResult | null = null;
    let failure: string | null = null;
    await readEvents(response, (event, data) => {
      if (event === "progress") onProgress((data as { stage: Stage }).stage);
      if (event === "result") result = data as AnalysisResult;
      if (event === "error") failure = (data as { detail: string }).detail;
      return event !== "result" && event !== "error";
    });
    if (failure) throw new ApiError(failure, 500);
    if (!result) throw new ApiError("stream ended", 500);
    return result;
  },

  batch: (files: File[], fields: Selection & { patient_id?: number }) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    Object.entries(fields).forEach(([key, value]) => value !== undefined && form.append(key, String(value)));
    return request<{ queued: CaseSummary[]; rejected: { file: string; reason: string }[] }>("/cases/batch", {
      method: "POST",
      body: form,
    });
  },
};
