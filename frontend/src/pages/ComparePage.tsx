import { motion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarRange, Columns2, Link2, Minus, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ImageViewer, INITIAL_VIEW, type ViewState } from "../components/ImageViewer";
import { EmptyState, PageHeader, Segmented, Skeleton, StatusChip } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type CaseSummary, type Comparison, type PatientSummary, type Trend } from "../lib/api";
import { caseNumber, TREND_STYLES } from "../lib/format";
import { navigate } from "../lib/router";

const TREND_ICONS: Record<Trend, typeof ArrowUpRight> = {
  worsened: ArrowUpRight, new: ArrowUpRight, improved: ArrowDownRight, resolved: ArrowDownRight, stable: Minus,
};

export function ComparePage({ query }: { query: URLSearchParams }) {
  const { t, finding, date, study, language } = useI18n();
  const [patients, setPatients] = useState<PatientSummary[] | null>(null);
  const [studies, setStudies] = useState<CaseSummary[]>([]);
  const [loaded, setLoaded] = useState<{ key: string; comparison: Comparison | null; error: string | null } | null>(null);
  const [view, setView] = useState<ViewState>(INITIAL_VIEW);
  const [scope, setScope] = useState<"changed" | "all">("changed");
  const [selectedPrior, setSelectedPrior] = useState<string | null>(null);
  const [selectedCurrent, setSelectedCurrent] = useState<string | null>(null);

  const patientId = Number(query.get("patient")) || null;
  const priorId = Number(query.get("prior")) || null;
  const currentId = Number(query.get("current")) || null;
  const setQuery = (patch: Record<string, number | null>) => {
    const next = new URLSearchParams(query);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    navigate(`/compare?${next}`, { replace: true });
  };

  useEffect(() => {
    api.patients(2).then((list) => {
      setPatients(list);
      if (!patientId && list[0]) setQuery({ patient: list[0].id });
    }, () => setPatients([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  useEffect(() => {
    if (!patientId) return;
    api.cases({ patient_id: patientId, sort: "recent", limit: 50 }).then((body) => {
      const analyzed = body.items
        .filter((c) => c.status === "ai_ready" || c.status === "reviewed")
        .sort((a, b) => new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime());
      setStudies(analyzed);
      if (analyzed.length >= 2 && (!priorId || !currentId)) {
        const current = currentId ?? analyzed[0].id;
        const prior = priorId ?? analyzed.find((c) => c.id !== current)!.id;
        setQuery({ patient: patientId, prior, current });
      }
    }, () => setStudies([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on the patient only
  }, [patientId]);

  const requested = priorId && currentId && priorId !== currentId ? `${priorId}-${currentId}-${language}` : null;
  useEffect(() => {
    if (!requested || !priorId || !currentId) return;
    api.compare(priorId, currentId, language).then(
      (body) => {
        setLoaded({ key: requested, comparison: body, error: null });
        setView(INITIAL_VIEW);
      },
      (e: Error) => setLoaded({ key: requested, comparison: null, error: e.message }),
    );
  }, [requested, priorId, currentId, language]);
  const loading = requested !== null && loaded?.key !== requested;
  const comparison = loaded?.comparison ?? null;
  const error = loaded?.key === requested ? loaded.error : null;

  const rows = useMemo(
    () => (comparison?.deltas ?? []).filter((d) => scope === "all" || d.reported || d.trend !== "stable"),
    [comparison, scope],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader eyebrow={t("nav.compare")} title={t("compare.title")} subtitle={t("compare.subtitle")} />

      {patients === null ? (
        <Skeleton className="h-24" />
      ) : patients.length === 0 ? (
        <div className="card"><EmptyState icon={Users} title={t("compare.patientsEmpty")} /></div>
      ) : (
        <div className="card flex flex-wrap items-end gap-4 p-4">
          <label className="block">
            <span className="eyebrow">{t("compare.choosePatient")}</span>
            <select className="field mt-1.5 w-56 font-mono" value={patientId ?? ""} onChange={(e) => setQuery({ patient: Number(e.target.value), prior: null, current: null })}>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.pseudonym} ({p.case_count})</option>)}
            </select>
          </label>
          {(["prior", "current"] as const).map((role) => (
            <label key={role} className="block">
              <span className="eyebrow">{t(`compare.${role}`)}</span>
              <select
                className="field mt-1.5 w-72"
                value={(role === "prior" ? priorId : currentId) ?? ""}
                onChange={(e) => setQuery({ [role]: Number(e.target.value) })}
              >
                {studies.map((c) => (
                  <option key={c.id} value={c.id}>{caseNumber(c.id)} · {date(c.acquired_at, false)} · {study(c)}</option>
                ))}
              </select>
            </label>
          ))}
          {comparison && (
            <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
              <span className="chip bg-emerald-50 py-1.5 text-emerald-700 ring-1 ring-emerald-200"><CalendarRange className="size-4" /> {comparison.interval_days >= 1 ? t("compare.interval", { days: Math.round(comparison.interval_days) }) : t("compare.intervalHours", { n: Math.max(1, Math.round(comparison.interval_days * 24)) })}</span>
              <span className="chip bg-slate-100 py-1.5 text-slate-600"><Link2 className="size-4" /> {t("compare.sync")}</span>
            </div>
          )}
        </div>
      )}

      {error && <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      {loading && !comparison && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>}

      {comparison && (
        <>
          <div className={`grid gap-6 lg:grid-cols-2 transition ${loading ? "opacity-50" : ""}`}>
            {([["prior", comparison.prior], ["current", comparison.current]] as const).map(([role, result]) => (
              <div key={role} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-sm font-bold text-ink">{t(`compare.${role}`)} · {caseNumber(result.case_id)} <span className="font-normal text-slate-500">· {date(result.acquired_at ?? result.created_at, false)}</span></div>
                  <StatusChip status={result.status} />
                </div>
                <ImageViewer
                  result={result}
                  selected={role === "prior" ? selectedPrior : selectedCurrent}
                  onSelect={role === "prior" ? setSelectedPrior : setSelectedCurrent}
                  view={view}
                  onViewChange={setView}
                  compact
                />
              </div>
            ))}
          </div>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
            <div className="flex items-center gap-2"><Sparkles className="size-5 text-emerald-600" /><h2 className="font-bold text-ink">{t("compare.summaryTitle")}</h2></div>
            <p className="mt-3 leading-relaxed text-slate-700">{comparison.summary ?? t("compare.summaryUnavailable")}</p>
          </motion.section>

          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 font-bold text-ink"><Columns2 className="size-5 text-emerald-600" /> {t("compare.deltaTitle")}</h2>
              <Segmented value={scope} onChange={setScope} label="delta-scope" options={[{ id: "changed", label: t("compare.onlyChanged") }, { id: "all", label: t("compare.showAll") }]} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/60 text-xs text-slate-500">
                  <tr>{(["finding", "prior", "current", "change", "trend"] as const).map((c) => <th key={c} className="px-5 py-3 font-semibold">{t(`compare.columns.${c}`)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((d) => {
                    const Icon = TREND_ICONS[d.trend];
                    return (
                      <tr key={d.name} className={d.reported ? "" : "text-slate-500"}>
                        <td className="px-5 py-3 font-semibold text-ink">{finding(d.name)}</td>
                        <td className="px-5 py-3 tabular-nums">{d.prior?.toFixed(2) ?? "—"}</td>
                        <td className="px-5 py-3 tabular-nums">{d.current?.toFixed(2) ?? "—"}</td>
                        <td className={`px-5 py-3 font-semibold tabular-nums ${TREND_STYLES[d.trend]}`}>
                          {d.change === null ? "—" : `${d.change > 0 ? "+" : ""}${d.change.toFixed(2)}`}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 font-semibold ${TREND_STYLES[d.trend]}`}><Icon className="size-4" /> {t(`compare.trends.${d.trend}`)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-1 border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              <ArrowRight className="size-3.5" /> {t("findings.scoresTooltip")}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
