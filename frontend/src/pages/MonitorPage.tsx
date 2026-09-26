import { motion } from "framer-motion";
import { Activity, Ban, CircleHelp, GitCompareArrows, ScanLine, ShieldCheck, Trash2, UserPen } from "lucide-react";
import { useEffect, useState } from "react";

import { Legend, RateLine, SERIES, StackedBar } from "../components/charts";
import { EmptyState, PageHeader, Skeleton, StatCard } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type SafetyStats } from "../lib/api";

export function MonitorPage() {
  const { t, percent, finding, date } = useI18n();
  const [stats, setStats] = useState<SafetyStats | null>(null);

  useEffect(() => {
    api.safety().then(setStats, () => undefined);
  }, []);

  const rate = (value: number | null) => (value === null ? "—" : percent(value));
  const parts = [
    { key: "agree", label: t("monitor.columns.agree"), color: SERIES.emerald },
    { key: "disagree", label: t("monitor.columns.disagree"), color: SERIES.yellow },
    { key: "missed", label: t("monitor.columns.missed"), color: SERIES.violet },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader eyebrow={t("nav.monitor")} title={t("monitor.title")} subtitle={t("monitor.subtitle")} />

      {!stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard icon={ScanLine} label={t("monitor.analyses")} value={stats.analyses} />
          <StatCard icon={Ban} label={t("monitor.rejected")} value={stats.rejected_images} delay={0.04} />
          <StatCard icon={CircleHelp} label={t("monitor.lowConfidence")} value={rate(stats.low_confidence_rate)} delay={0.08} />
          <StatCard icon={GitCompareArrows} label={t("monitor.disagreement")} value={rate(stats.model_disagreement_rate)} delay={0.12} />
          <StatCard icon={UserPen} label={t("monitor.override")} value={rate(stats.override_rate)} tone="text-amber-600" delay={0.16} />
          <StatCard icon={Trash2} label={t("monitor.removed")} value={stats.llm_removed_items} delay={0.2} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <h2 className="flex items-center gap-2 font-semibold text-ink"><Activity className="size-5 text-emerald-600" /> {t("monitor.weekly")}</h2>
          <div className="mt-4">
            {stats ? (
              <RateLine
                format={(v) => percent(v)}
                points={stats.weekly.map((w) => ({
                  label: date(w.week, false).replace(/,? \d{4}$/, ""),
                  value: w.agreement_rate,
                  note: `${w.decisions}`,
                }))}
              />
            ) : <Skeleton className="h-44" />}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card p-6">
          <h2 className="flex items-center gap-2 font-semibold text-ink"><Ban className="size-5 text-rose-500" /> {t("monitor.rejectionReasons")}</h2>
          {stats && Object.keys(stats.rejection_reasons).length === 0 ? (
            <EmptyState icon={ShieldCheck} title={t("dashboard.noData")} />
          ) : (
            <ul className="mt-4 space-y-3">
              {stats && Object.entries(stats.rejection_reasons).sort((a, b) => b[1] - a[1]).map(([gate, count]) => (
                <li key={gate} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                  <div>
                    <div className="font-medium text-slate-700">{t(`monitor.gates.${gate}`).startsWith("monitor.") ? gate : t(`monitor.gates.${gate}`)}</div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-rose-400" style={{ width: `${(count / Math.max(...Object.values(stats.rejection_reasons))) * 100}%` }} />
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums text-ink">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <h2 className="font-semibold text-ink">{t("monitor.perPathology")}</h2>
          <Legend items={parts.map((p) => ({ label: p.label, color: p.color }))} />
        </div>
        {stats && stats.per_pathology.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t("monitor.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">{t("monitor.columns.pathology")}</th>
                  <th className="w-1/3 px-5 py-3" />
                  {parts.map((p) => <th key={p.key} className="px-4 py-3 text-right font-semibold">{p.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats?.per_pathology.map((row) => (
                  <tr key={row.name}>
                    <td className="px-5 py-3 font-medium text-ink">{finding(row.name)}</td>
                    <td className="px-5 py-3"><StackedBar parts={parts.map((p) => ({ label: p.label, value: row[p.key], color: p.color }))} /></td>
                    {parts.map((p) => <td key={p.key} className="px-4 py-3 text-right tabular-nums text-slate-600">{row[p.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
