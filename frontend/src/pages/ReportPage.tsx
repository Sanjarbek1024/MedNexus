import { ArrowLeft, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useState } from "react";

import { Logo } from "../components/AppShell";
import { useI18n } from "../i18n";
import { api, type AnalysisResult, type ApiError } from "../lib/api";
import { caseNumber, modelName } from "../lib/format";
import { Link } from "../lib/router";

/** Printable, signed report ("Export PDF" = the browser's Save as PDF). */
export function ReportPage({ caseId }: { caseId: number }) {
  const { t, date, study, finding } = useI18n();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.case(caseId).then(setResult, (e: ApiError) => setError(e.status === 404 ? t("case.notFound") : e.message || t("common.error")));
  }, [caseId, t]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 p-10 text-center text-slate-600">
        <p>{error}</p>
        <Link href="/worklist" className="btn-ghost"><ArrowLeft className="size-4" /> {t("case.history")}</Link>
      </div>
    );
  }
  if (!result) return <div className="flex justify-center p-24 text-slate-400"><LoaderCircle className="size-8 animate-spin" /></div>;

  const report = result.physician_report ?? { ...(result.suggested_report ?? { findings: "", impression: "", recommendations: "" }), status: "draft" as const, author: null, signed_at: null, updated_at: result.created_at };
  const signed = report.status === "final" && report.author && report.signed_at;
  const models = Object.values(result.versions).flatMap((v) => Object.keys(v)).map(modelName);
  const heatmap = result.findings.find((f) => f.heatmap)?.heatmap;

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <Link href={`/cases/${caseId}`} className="btn-ghost"><ArrowLeft className="size-4" /> {t("common.back")}</Link>
        <button type="button" className="btn-primary" onClick={() => window.print()}><Printer className="size-4" /> {t("print.print")}</button>
      </div>
      <article className="mx-auto max-w-3xl px-5 py-10 text-[15px] text-slate-800 sm:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-emerald-500 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="size-10" />
            <div>
              <div className="text-xl font-extrabold text-ink">{t("print.title")}</div>
              <div className="text-sm text-slate-500">MedNexus · {t("common.caseNumber", { id: caseNumber(result.case_id) })}</div>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200 sm:shrink-0">{t("print.note")}</span>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
          <div><dt className="eyebrow">{t("common.patient")}</dt><dd className="mt-1 font-mono font-semibold">{result.patient?.pseudonym}</dd></div>
          <div><dt className="eyebrow">{t("common.study")}</dt><dd className="mt-1 font-semibold">{study(result.selection)}</dd></div>
          <div><dt className="eyebrow">{t("print.studyDate")}</dt><dd className="mt-1">{date(result.acquired_at ?? result.created_at, false)}</dd></div>
          <div><dt className="eyebrow">{t("print.reportDate")}</dt><dd className="mt-1">{date(report.signed_at ?? report.updated_at, false)}</dd></div>
        </dl>

        <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_12rem]">
          <div className="space-y-6">
            {(["findings", "impression", "recommendations"] as const).map((key) => (
              <section key={key}>
                <h2 className="text-xs font-bold tracking-[0.14em] text-emerald-700 uppercase">{key === "findings" ? t("review.findingsSection") : t(`review.${key}`)}</h2>
                <p className="mt-2 leading-relaxed whitespace-pre-line">{report[key] || "—"}</p>
              </section>
            ))}
          </div>
          <figure className="space-y-2">
            <div className="relative overflow-hidden rounded-xl bg-slate-900">
              <img src={result.image.url} alt="" className="w-full" />
              {heatmap && (
                <img src={heatmap.url} alt="" className="absolute opacity-70" style={{ left: `${heatmap.box.x * 100}%`, top: `${heatmap.box.y * 100}%`, width: `${heatmap.box.width * 100}%`, height: `${heatmap.box.height * 100}%` }} />
              )}
            </div>
            <figcaption className="text-[11px] text-slate-500">
              {result.findings.map((f) => `${finding(f.name)} ${f.score.toFixed(2)}`).join(" · ")}
            </figcaption>
          </figure>
        </div>

        <footer className="mt-10 space-y-3 border-t border-slate-200 pt-5 text-sm">
          <p className={`font-semibold ${signed ? "text-ink" : "text-amber-700"}`}>
            {signed ? t("print.signed", { name: report.author!, date: date(report.signed_at!) }) : t("print.unsigned")}
          </p>
          <p className="text-xs leading-relaxed text-slate-500">{t("print.aiDisclosure")} {models.length > 0 && `(${models.join(", ")})`}</p>
          <p className="text-xs font-semibold text-slate-500">{t("common.disclaimer")}</p>
        </footer>
      </article>
    </div>
  );
}
