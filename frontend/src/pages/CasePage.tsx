import { motion } from "framer-motion";
import {
  ArrowLeft,
  CircleX,
  Columns2,
  FilePlus2,
  FileSignature,
  Fingerprint,
  LoaderCircle,
  MessagesSquare,
  PencilLine,
  Plus,
  Printer,
  ScanLine,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ChatPanel } from "../components/ChatPanel";
import { FindingsPanel, MeasurementCard } from "../components/Findings";
import { ImageViewer } from "../components/ImageViewer";
import { AssessmentCard, PatientResult } from "../components/PatientResult";
import { ReportCard } from "../components/ReportCard";
import { ReportEditor } from "../components/ReportEditor";
import { SafetyPanel } from "../components/SafetyPanel";
import { PriorityBadge, Skeleton, StatusChip } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type AnalysisResult, type AuditEvent, type ReviewAction } from "../lib/api";
import { useAuth } from "../lib/auth";
import { caseNumber } from "../lib/format";
import { Link, navigate } from "../lib/router";

// The analyze page hands over the fresh result so the case opens without a refetch.
const recent = new Map<number, AnalysisResult>();
export const rememberCase = (result: AnalysisResult) => recent.set(result.case_id, result);

const EVENT_ICONS: Record<string, LucideIcon> = {
  case_uploaded: ScanLine,
  analysis_created: ScanLine,
  report_generated: FilePlus2,
  review_confirm: ThumbsUp,
  review_edit: PencilLine,
  review_reject: ThumbsDown,
  chat_question: MessagesSquare,
};

function AuditTrail({ events }: { events: AuditEvent[] }) {
  const { t, date } = useI18n();
  return (
    <section className="card p-5" aria-labelledby="audit-title">
      <div className="flex items-center gap-2">
        <Fingerprint className="size-5 text-slate-500" />
        <h2 id="audit-title" className="font-bold text-ink">{t("audit.title")}</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">{t("audit.subtitle")}</p>
      <ol className="mt-4 space-y-3">
        {events.map((event) => {
          const Icon = EVENT_ICONS[event.action] ?? ScanLine;
          const label = t(`audit.actions.${event.action}`);
          return (
            <li key={event.id} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Icon className="size-4" /></div>
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-ink">{label.startsWith("audit.") ? event.action : label}</div>
                <div className="text-xs text-slate-500">
                  {event.actor} · {date(event.timestamp)} · <span className="font-mono" title={event.hash}>{event.hash.slice(0, 12)}…</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PhysicianReportCard({ result, onAmend }: { result: AnalysisResult; onAmend: () => void }) {
  const { t, date } = useI18n();
  const report = result.physician_report;
  if (!report) return null;
  const final = report.status === "final";
  return (
    <section className={`card p-5 ${final ? "border-l-4 border-l-emerald-400" : "border-l-4 border-l-sky-300"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <FileSignature className={`size-5 ${final ? "text-emerald-600" : "text-sky-500"}`} />
        <h2 className="font-bold text-ink">{t("review.editorTitle")}</h2>
        <span className={`chip ml-auto ${final ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"}`}>
          {final ? t("review.signed") : t("review.saveDraft")}
        </span>
      </div>
      {final && report.author && report.signed_at && (
        <div className="mt-1 text-xs text-slate-500">{t("review.signedBy", { name: report.author, date: date(report.signed_at) })}</div>
      )}
      <dl className="mt-3 space-y-3 text-sm">
        {(["findings", "impression", "recommendations"] as const).map((key) =>
          report[key] ? (
            <div key={key}>
              <dt className="eyebrow">{key === "findings" ? t("review.findingsSection") : t(`review.${key}`)}</dt>
              <dd className="mt-1 whitespace-pre-line text-slate-700">{report[key]}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {result.review?.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{result.review.notes}</p>}
      <div className="no-print mt-4 flex flex-wrap gap-2">
        {final && (
          <Link href={`/cases/${result.case_id}/report`} className="btn-ghost"><Printer className="size-4" /> {t("review.viewReport")}</Link>
        )}
        <button type="button" className="btn-ghost" onClick={onAmend}><PencilLine className="size-4" /> {final ? t("review.amend") : t("review.edit")}</button>
      </div>
    </section>
  );
}

function RejectedCard({ result }: { result: AnalysisResult }) {
  const { t, check } = useI18n();
  const failed = result.checks.filter((c) => c.blocking && c.status === "fail");
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card border-l-4 border-l-rose-400 p-6" role="alert">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><CircleX className="size-6" /></div>
        <div>
          <div className="eyebrow text-rose-500">{t("case.rejectedGate")}</div>
          <h2 className="text-xl font-bold text-ink">{t("case.rejectedTitle")}</h2>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">{t("case.rejectedText")}</p>
      <ul className="mt-3 space-y-2">
        {failed.map((c) => <li key={c.id} className="rounded-xl bg-rose-50/70 px-3 py-2 text-sm font-medium text-rose-800">{check(c)}</li>)}
      </ul>
      <button type="button" className="btn-primary mt-5" onClick={() => navigate("/analyze")}><Plus className="size-4" /> {t("case.tryAnother")}</button>
    </motion.section>
  );
}

function CaseView({ initial }: { initial: AnalysisResult }) {
  const { t, study, date } = useI18n();
  const [result, setResult] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.findings.find((f) => f.heatmap || f.boxes.length)?.name ?? null);
  const [editor, setEditor] = useState<ReviewAction | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [studies, setStudies] = useState(0);
  const totalMs = Object.values(result.timings_ms).reduce((a, b) => a + b, 0);
  const reviewable = result.status === "ai_ready" || result.status === "reviewed";

  useEffect(() => {
    if (!result.patient) return;
    api.cases({ patient_id: result.patient.id, limit: 50 }).then((body) => setStudies(body.items.filter((c) => c.status === "ai_ready" || c.status === "reviewed").length), () => undefined);
  }, [result.patient]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-36 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/worklist" className="no-print inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="size-4" /> {t("case.history")}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">{t("common.caseNumber", { id: caseNumber(result.case_id) })}</h1>
            <StatusChip status={result.status} />
            {reviewable && <PriorityBadge priority={result.priority} reason={result.priority_reason} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            {result.patient && <span className="font-mono font-semibold text-slate-600">{result.patient.pseudonym}</span>}
            <span>· {study(result.selection)}</span>
            <span>· {date(result.acquired_at ?? result.created_at, false)}</span>
            {totalMs > 0 && <span>· {t("case.analyzedIn", { s: (totalMs / 1000).toFixed(1) })}</span>}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {studies >= 2 && result.patient && (
            <Link href={`/compare?patient=${result.patient.id}&current=${result.case_id}`} className="btn-ghost"><Columns2 className="size-4" /> {t("case.comparePriors")}</Link>
          )}
          {reviewable && (
            <Link href={`/cases/${result.case_id}/report`} className="btn-ghost"><Printer className="size-4" /> {t("case.export")}</Link>
          )}
          {reviewable && (
            <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-primary" onClick={() => setChatOpen(true)}>
              <MessagesSquare className="size-4" /> {t("case.chat")}
            </motion.button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6 lg:sticky lg:top-20">
          <ImageViewer result={result} selected={selected} onSelect={setSelected} shortcuts />
        </div>
        <div className="space-y-4">
          {result.rejected ? (
            <RejectedCard result={result} />
          ) : (
            <>
              <PhysicianReportCard result={result} onAmend={() => setEditor("edit")} />
              <FindingsPanel result={result} selected={selected} onSelect={setSelected} />
              <AssessmentCard result={result} onUpdate={setResult} />
              {result.measurements.map((m) => <MeasurementCard key={m.id} measurement={m} view={result.selection.view} />)}
            </>
          )}
          <SafetyPanel result={result} />
          {!result.rejected && <ReportCard result={result} onUpdate={setResult} />}
          <AuditTrail events={result.audit} />
        </div>
      </div>

      {reviewable && result.status !== "reviewed" && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 lg:pl-[248px]">
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", bounce: 0.25 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/80 bg-white/85 p-1.5 shadow-xl sm:pl-4 shadow-slate-900/10 backdrop-blur-xl"
          >
            <span className="chip mr-1 hidden bg-amber-50 text-amber-700 ring-1 ring-amber-200 sm:inline-flex">{t("status.draft")}</span>
            <button type="button" className="btn-primary rounded-full" onClick={() => setEditor("confirm")}><ThumbsUp className="size-4" /> {t("review.confirm")}</button>
            <button type="button" className="btn-ghost rounded-full" onClick={() => setEditor("edit")} title={t("review.edit")}><PencilLine className="size-4" /> <span className="hidden sm:inline">{t("review.edit")}</span></button>
            <button type="button" className="btn-ghost rounded-full text-rose-600 hover:border-rose-200" onClick={() => setEditor("reject")} title={t("review.reject")}><ThumbsDown className="size-4" /> <span className="hidden sm:inline">{t("review.reject")}</span></button>
          </motion.div>
        </div>
      )}
      <div className="no-print fixed right-6 bottom-6 z-30 hidden xl:block">
        <motion.button
          type="button"
          onClick={() => navigate("/analyze")}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="btn rounded-full bg-ink px-5 py-3 text-white shadow-xl shadow-slate-900/20 hover:bg-slate-800"
        >
          <Plus className="size-4" /> {t("case.newAnalysis")}
        </motion.button>
      </div>

      <ReportEditor result={result} action={editor} onClose={() => setEditor(null)} onUpdate={setResult} />
      {reviewable && <ChatPanel result={result} open={chatOpen} onClose={() => setChatOpen(false)} />}
    </div>
  );
}

export function CasePage({ caseId }: { caseId: number }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const doctor = user?.role === "doctor";
  const [result, setResult] = useState<AnalysisResult | null>(recent.get(caseId) ?? null);
  const [error, setError] = useState<string | null>(null);
  const pending = result?.status === "queued" || result?.status === "analyzing";

  useEffect(() => {
    if (result?.case_id === caseId && !pending) return;
    const load = () => api.case(caseId).then(setResult, (e: Error) => setError(e.message));
    if (!result || result.case_id !== caseId) load();
    if (!pending) return;
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [caseId, result, pending]);

  if (error) return <div className="mx-auto max-w-xl px-6 pt-24 text-center text-slate-600">{error}</div>;
  if (!result) {
    return (
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Skeleton className="h-[34rem]" />
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-60" /></div>
      </div>
    );
  }
  if (pending || result.status === "failed") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 pt-24 text-center">
        {result.status === "failed" ? <TriangleAlert className="size-10 text-rose-500" /> : <LoaderCircle className="size-10 animate-spin text-emerald-500" />}
        <h1 className="text-2xl font-bold text-ink">{result.status === "failed" ? t("case.failedTitle") : t("case.pendingTitle")}</h1>
        {result.status !== "failed" && <p className="text-slate-500">{t("case.pendingText")}</p>}
        {result.image.url && <img src={result.image.url} alt="" className="size-40 rounded-2xl bg-slate-900 object-contain" />}
        <Link href={doctor ? "/worklist" : "/my"} className="btn-ghost"><ArrowLeft className="size-4" /> {doctor ? t("case.history") : t("patient.back")}</Link>
      </div>
    );
  }
  const key = `${result.case_id}-${result.status}`;
  return doctor ? <CaseView key={key} initial={result} /> : <PatientResult key={key} initial={result} />;
}
