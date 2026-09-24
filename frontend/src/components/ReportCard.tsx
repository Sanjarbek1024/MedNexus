import { motion } from "framer-motion";
import { ArrowRight, CircleAlert, FileText, LoaderCircle, Lock, RotateCcw } from "lucide-react";
import { useState } from "react";

import { api, type AnalysisResult } from "../lib/api";

const LANGUAGES = [
  { id: "uz", label: "UZ" },
  { id: "en", label: "EN" },
  { id: "ru", label: "RU" },
];

export function ReportCard({ result, onUpdate }: { result: AnalysisResult; onUpdate: (r: AnalysisResult) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = result.report;

  const regenerate = async (language: string) => {
    setLoading(language);
    setError(null);
    try {
      onUpdate(await api.report(result.case_id, language));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="card overflow-hidden" aria-labelledby="report-title">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-transparent px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-emerald-600" />
          <h2 id="report-title" className="font-bold text-ink">AI report</h2>
          {result.status === "draft" && (
            <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">Draft (AI)</span>
          )}
        </div>
        <div className="no-print flex gap-1 rounded-xl bg-white/80 p-0.5 ring-1 ring-slate-200" role="group" aria-label="Report language">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              disabled={loading !== null}
              onClick={() => regenerate(lang.id)}
              aria-pressed={report?.language === lang.id}
              className={`flex w-10 items-center justify-center rounded-lg py-1 text-xs font-bold transition ${
                report?.language === lang.id ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {loading === lang.id ? <LoaderCircle className="size-3.5 animate-spin" /> : lang.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`space-y-5 p-5 transition ${loading ? "opacity-40" : ""}`}>
        {report ? (
          <>
            <motion.p key={report.summary} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="leading-relaxed text-slate-700">
              {report.summary}
            </motion.p>
            {report.next_steps.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Suggested next steps for the physician</div>
                <ul className="space-y-1.5">
                  {report.next_steps.map((step) => (
                    <li key={step} className="flex gap-2 text-sm text-slate-700">
                      <ArrowRight className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.limitations.length > 0 && (
              <div>
                <div className="eyebrow mb-2">Limitations</div>
                <ul className="space-y-1 text-sm text-slate-500">
                  {report.limitations.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Lock className="size-3" /> Written by {report.model} from model outputs only; the image is never sent
              </span>
              <span>
                {report.removed_findings.length
                  ? `${report.removed_findings.length} unsupported item(s) removed`
                  : "No unsupported statements"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <div className="font-semibold text-ink">AI narrative unavailable</div>
              <div className="mt-0.5">
                {result.report_error ? `${result.report_error[0].toUpperCase()}${result.report_error.slice(1)}. ` : ""}
                The model results on this page are complete without it.
              </div>
              <button type="button" className="btn-ghost no-print mt-3" onClick={() => regenerate(result.selection.language)}>
                <RotateCcw className="size-4" /> Try again
              </button>
            </div>
          </div>
        )}
        {error && <div className="text-sm text-rose-600" role="alert">{error}</div>}
      </div>
    </section>
  );
}
