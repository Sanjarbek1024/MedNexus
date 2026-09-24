import { AnimatePresence, motion } from "framer-motion";
import {
  CircleCheck,
  FilePlus2,
  Fingerprint,
  LoaderCircle,
  PencilLine,
  ScanLine,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { api, type AnalysisResult, type AuditEvent, type ReviewAction } from "../lib/api";
import { dateTime, STATUSES } from "../lib/format";

const REVIEWER_KEY = "mednexus.reviewer";

const DIALOG: Record<ReviewAction, { title: string; cta: string; hint: string }> = {
  confirm: {
    title: "Confirm the AI draft",
    cta: "Confirm",
    hint: "You agree with the flagged findings as presented. Add notes if needed.",
  },
  reject: {
    title: "Reject the AI draft",
    cta: "Reject draft",
    hint: "Explain why the AI output is wrong or not usable. The reason is stored in the audit log.",
  },
  edit: {
    title: "Edit the impression",
    cta: "Save edited report",
    hint: "Write the final impression in your own words. The AI draft is kept for comparison.",
  },
};

function readReviewer(): string {
  try {
    return localStorage.getItem(REVIEWER_KEY) ?? "";
  } catch {
    return "";
  }
}

function ReviewDialog({ action, result, onClose, onDone }: {
  action: ReviewAction;
  result: AnalysisResult;
  onClose: () => void;
  onDone: (r: AnalysisResult) => void;
}) {
  const draft = [
    result.report?.summary,
    result.findings.length ? `AI findings: ${result.findings.map((f) => f.name).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const [reviewer, setReviewer] = useState(readReviewer);
  const [notes, setNotes] = useState("");
  const [impression, setImpression] = useState(result.review?.final_impression ?? draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = DIALOG[action];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      localStorage.setItem(REVIEWER_KEY, reviewer.trim());
    } catch {
      // storage unavailable; the name is still sent with the review
    }
    try {
      onDone(
        await api.review(result.case_id, {
          action,
          reviewer: reviewer.trim(),
          notes: notes.trim(),
          ...(action === "edit" ? { final_impression: impression.trim() } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const valid = reviewer.trim() && (action !== "reject" || notes.trim()) && (action !== "edit" || impression.trim());

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="review-title" className="text-lg font-bold text-ink">{copy.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{copy.hint}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="eyebrow">Physician</span>
            <input className="field mt-1.5" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Dr. Name Surname" autoFocus />
          </label>
          {action === "edit" && (
            <label className="block">
              <span className="eyebrow">Final impression</span>
              <textarea className="field mt-1.5 min-h-36" value={impression} onChange={(e) => setImpression(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="eyebrow">{action === "reject" ? "Reason (required)" : "Notes (optional)"}</span>
            <textarea className="field mt-1.5 min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <div className="text-sm text-rose-600" role="alert">{error}</div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            disabled={!valid || saving}
            onClick={submit}
            className={action === "reject" ? "btn bg-rose-500 text-white hover:bg-rose-600" : "btn-primary"}
          >
            {saving && <LoaderCircle className="size-4 animate-spin" />} {copy.cta}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ReviewBar({ result, onUpdate }: { result: AnalysisResult; onUpdate: (r: AnalysisResult) => void }) {
  const [action, setAction] = useState<ReviewAction | null>(null);
  const status = STATUSES[result.status];
  return (
    <>
      <div className="no-print fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", bounce: 0.25 }}
          className="flex items-center gap-2 rounded-full border border-white/80 bg-white/85 p-1.5 pl-4 shadow-xl shadow-slate-900/10 backdrop-blur-xl"
        >
          <span className={`chip mr-1 hidden sm:inline-flex ${status.chip}`}>{status.label}</span>
          <button type="button" className="btn-primary rounded-full" onClick={() => setAction("confirm")}>
            <ThumbsUp className="size-4" /> Confirm
          </button>
          <button type="button" className="btn-ghost rounded-full" onClick={() => setAction("edit")}>
            <PencilLine className="size-4" /> Edit
          </button>
          <button type="button" className="btn-ghost rounded-full text-rose-600 hover:border-rose-200" onClick={() => setAction("reject")}>
            <ThumbsDown className="size-4" /> Reject
          </button>
        </motion.div>
      </div>
      <AnimatePresence>
        {action && (
          <ReviewDialog
            action={action}
            result={result}
            onClose={() => setAction(null)}
            onDone={(updated) => {
              setAction(null);
              onUpdate(updated);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

const EVENT_LABELS: Record<string, { label: string; icon: typeof ScanLine }> = {
  analysis_created: { label: "Analysis created", icon: ScanLine },
  report_generated: { label: "AI report generated", icon: FilePlus2 },
  review_confirm: { label: "Confirmed by physician", icon: ThumbsUp },
  review_reject: { label: "Rejected by physician", icon: ThumbsDown },
  review_edit: { label: "Edited by physician", icon: PencilLine },
};

export function ReviewSummary({ result }: { result: AnalysisResult }) {
  const review = result.review;
  if (!review) return null;
  return (
    <section className="card border-l-4 border-l-emerald-400 p-5">
      <div className="flex items-center gap-2">
        <CircleCheck className="size-5 text-emerald-600" />
        <h2 className="font-bold text-ink">Physician decision</h2>
        <span className={`chip ml-auto ${STATUSES[result.status].chip}`}>{STATUSES[result.status].label}</span>
      </div>
      <div className="mt-2 text-sm text-slate-500">
        {review.reviewer} · {dateTime(review.reviewed_at)}
      </div>
      {review.final_impression && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">{review.final_impression}</p>
      )}
      {review.notes && <p className="mt-3 text-sm text-slate-600"><span className="font-semibold">Notes:</span> {review.notes}</p>}
    </section>
  );
}

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <section className="card p-5" aria-labelledby="audit-title">
      <div className="flex items-center gap-2">
        <Fingerprint className="size-5 text-slate-500" />
        <h2 id="audit-title" className="font-bold text-ink">Audit trail</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">Append-only. Each entry is chained to the previous one with SHA-256.</p>
      <ol className="mt-4 space-y-3">
        {events.map((event) => {
          const meta = EVENT_LABELS[event.action] ?? { label: event.action, icon: ScanLine };
          const Icon = meta.icon;
          return (
            <li key={event.id} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 text-sm">
                <div className="font-semibold text-ink">{meta.label}</div>
                <div className="text-xs text-slate-500">
                  {event.actor} · {dateTime(event.timestamp)} ·{" "}
                  <span className="font-mono" title={event.hash}>{event.hash.slice(0, 12)}…</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
