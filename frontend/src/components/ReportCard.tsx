import { motion } from "framer-motion";
import { ArrowRight, CircleAlert, FileText, LoaderCircle, Lock, RotateCcw } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import { api, type AnalysisResult, type Language } from "../lib/api";
import { useToast } from "../lib/toast";

/** The AI's narrative draft (grounded LLM output). The physician's report lives in the editor. */
export function ReportCard({ result, onUpdate }: { result: AnalysisResult; onUpdate: (r: AnalysisResult) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [loading, setLoading] = useState<Language | null>(null);
  const report = result.report;

  const regenerate = async (language: Language) => {
    setLoading(language);
    try {
      onUpdate(await api.regenerateReport(result.case_id, language));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="card overflow-hidden" aria-labelledby="report-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-transparent px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FileText className="size-5 text-emerald-600" />
          <h2 id="report-title" className="font-bold text-ink">{t("report.title")}</h2>
          {result.status !== "reviewed" && <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">{t("status.draft")}</span>}
        </div>
        <div className="no-print flex shrink-0 gap-1 rounded-xl bg-white/80 p-0.5 ring-1 ring-slate-200" role="group" aria-label={t("report.regenerate")}>
          {(["uz", "en", "ru"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              disabled={loading !== null}
              onClick={() => regenerate(lang)}
              aria-pressed={report?.language === lang}
              title={t("report.regenerate")}
              className={`flex w-10 items-center justify-center rounded-lg py-1 text-xs font-bold uppercase transition ${
                report?.language === lang ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {loading === lang ? <LoaderCircle className="size-3.5 animate-spin" /> : lang}
            </button>
          ))}
        </div>
      </div>
      <div className={`space-y-5 p-5 transition ${loading ? "opacity-40" : ""}`}>
        {report ? (
          <>
            <motion.p key={report.summary} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="leading-relaxed text-slate-700">{report.summary}</motion.p>
            {report.next_steps.length > 0 && (
              <div>
                <div className="eyebrow mb-2">{t("report.nextSteps")}</div>
                <ul className="space-y-1.5">
                  {report.next_steps.map((step) => (
                    <li key={step} className="flex gap-2 text-sm text-slate-700"><ArrowRight className="mt-0.5 size-4 shrink-0 text-emerald-500" /> {step}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.limitations.length > 0 && (
              <div>
                <div className="eyebrow mb-2">{t("report.limitations")}</div>
                <ul className="space-y-1 text-sm text-slate-500">
                  {report.limitations.map((item) => (
                    <li key={item} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" /> {item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><Lock className="size-3" /> {t("report.grounded", { model: report.model })}</span>
              <span>{report.removed_findings.length ? t("report.removed", { n: report.removed_findings.length }) : t("report.noRemoved")}</span>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <div className="font-semibold text-ink">{t("report.unavailable")}</div>
              <div className="mt-0.5">{t("report.unavailableText")}</div>
              {result.report_error && <div className="mt-1 font-mono text-xs text-slate-400">{result.report_error}</div>}
              <button type="button" className="btn-ghost no-print mt-3" onClick={() => regenerate(result.selection.language)}>
                <RotateCcw className="size-4" /> {t("common.retry")}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
