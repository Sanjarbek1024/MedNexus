import { motion } from "framer-motion";
import { ArrowLeft, CircleX, LoaderCircle, Plus, Printer } from "lucide-react";
import { useEffect, useState } from "react";

import { Disclaimer } from "../components/Disclaimer";
import { FindingsPanel, MeasurementCard } from "../components/Findings";
import { ImageViewer } from "../components/ImageViewer";
import { ReportCard } from "../components/ReportCard";
import { AuditTrail, ReviewBar, ReviewSummary } from "../components/Review";
import { SafetyPanel } from "../components/SafetyPanel";
import { api, type AnalysisResult } from "../lib/api";
import { caseNumber, dateTime, STATUSES, studyLabel } from "../lib/format";
import { Link, navigate } from "../lib/router";

// The analyze page hands over the fresh result so the case opens without a refetch.
const recent = new Map<number, AnalysisResult>();
export const rememberCase = (result: AnalysisResult) => recent.set(result.case_id, result);

function RejectedCard({ result }: { result: AnalysisResult }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card border-l-4 border-l-rose-400 p-6"
      role="alert"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <CircleX className="size-6" />
        </div>
        <div>
          <div className="eyebrow text-rose-500">Safety gate</div>
          <h2 className="text-xl font-bold text-ink">Image rejected</h2>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        No findings were produced. The models only run on images that pass every safety gate:
      </p>
      <ul className="mt-3 space-y-2">
        {result.rejection_reasons.map((reason) => (
          <li key={reason} className="rounded-xl bg-rose-50/70 px-3 py-2 text-sm font-medium text-rose-800">
            {reason}
          </li>
        ))}
      </ul>
      <button type="button" className="btn-primary mt-5" onClick={() => navigate("/")}>
        <Plus className="size-4" /> Try another image
      </button>
    </motion.section>
  );
}

function CaseView({ initial }: { initial: AnalysisResult }) {
  const [result, setResult] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.findings.find((f) => f.heatmap)?.name ?? null);
  const status = STATUSES[result.status];
  const totalMs = Object.values(result.timings_ms).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-36 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/history" className="no-print inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="size-4" /> History
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">Case {caseNumber(result.case_id)}</h1>
            <span className={`chip py-1 text-sm ${status.chip}`}>{status.label}</span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {studyLabel(result.selection)} · {dateTime(result.created_at)} · analyzed in {(totalMs / 1000).toFixed(1)} s
          </div>
        </div>
        <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
          <Printer className="size-4" /> Export PDF
        </button>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6 lg:sticky lg:top-24">
          <ImageViewer result={result} selected={selected} onSelect={setSelected} />
        </div>
        <div className="space-y-4">
          {result.rejected ? (
            <RejectedCard result={result} />
          ) : (
            <>
              <ReviewSummary result={result} />
              <FindingsPanel result={result} selected={selected} onSelect={setSelected} />
              {result.measurements.map((m) => <MeasurementCard key={m.id} measurement={m} />)}
            </>
          )}
          <SafetyPanel result={result} />
          {!result.rejected && <ReportCard result={result} onUpdate={setResult} />}
          <AuditTrail events={result.audit} />
        </div>
      </div>

      <Disclaimer className="mt-8 hidden w-fit print:flex" />
      {!result.rejected && <ReviewBar result={result} onUpdate={setResult} />}
      <div className="no-print fixed right-6 bottom-6 z-30">
        <motion.button
          type="button"
          onClick={() => navigate("/")}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="btn rounded-full bg-ink px-5 py-3 text-white shadow-xl shadow-slate-900/20 hover:bg-slate-800"
        >
          <Plus className="size-4" /> New analysis
        </motion.button>
      </div>
    </div>
  );
}

export function CasePage({ caseId }: { caseId: number }) {
  const [result, setResult] = useState<AnalysisResult | null>(recent.get(caseId) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (result?.case_id === caseId) return;
    api.case(caseId).then(setResult, (e: Error) => setError(e.message));
  }, [caseId, result]);

  if (error) {
    return <div className="mx-auto max-w-xl px-6 pt-24 text-center text-slate-600">{error}</div>;
  }
  if (!result) {
    return (
      <div className="flex justify-center pt-32 text-slate-400">
        <LoaderCircle className="size-8 animate-spin" />
      </div>
    );
  }
  return <CaseView initial={result} />;
}
