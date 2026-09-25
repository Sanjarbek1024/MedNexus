import { motion } from "framer-motion";
import { Activity, ArrowRight, CheckCheck, Clock, Handshake, Inbox, ScanLine, Siren, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { GroupedBars, Legend, SERIES } from "../components/charts";
import { EmptyState, PageHeader, PriorityBadge, Skeleton, StatCard, Waiting } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type DashboardStats } from "../lib/api";
import { useAuth } from "../lib/auth";
import { caseNumber } from "../lib/format";
import { Link } from "../lib/router";

function turnaround(minutes: number, t: ReturnType<typeof useI18n>["t"]): string {
  if (minutes < 60) return t("common.minutes", { n: Math.round(minutes) });
  const hours = Math.floor(minutes / 60);
  return `${t("common.hours", { n: hours })} ${Math.round(minutes % 60)}′`;
}

export function DashboardPage() {
  const { t, percent, finding, study, weekday } = useI18n();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const load = () => api.dashboard().then(setStats, () => undefined);
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t("nav.dashboard")}
        title={t(`dashboard.${greeting}`, { name: user?.full_name ?? "" })}
        subtitle={t("dashboard.subtitle")}
        actions={
          <>
            <Link href="/worklist" className="btn-ghost"><Inbox className="size-4" /> {t("dashboard.openWorklist")}</Link>
            <Link href="/analyze" className="btn-primary"><ScanLine className="size-4" /> {t("nav.analyze")}</Link>
          </>
        }
      />

      {!stats ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Inbox} label={t("dashboard.openCases")} value={stats.open_cases} />
          <StatCard icon={Siren} label={t("dashboard.urgentOpen")} value={stats.urgent_open} tone={stats.urgent_open ? "text-rose-600" : "text-ink"} delay={0.04} />
          <StatCard icon={Upload} label={t("dashboard.queuedToday")} value={stats.queued_today} delay={0.08} />
          <StatCard icon={CheckCheck} label={t("dashboard.reviewedToday")} value={stats.reviewed_today} tone="text-emerald-600" delay={0.12} />
          <StatCard
            icon={Clock}
            label={t("dashboard.turnaround")}
            value={<span className="text-2xl">{stats.avg_turnaround_minutes === null ? "—" : turnaround(stats.avg_turnaround_minutes, t)}</span>}
            hint={t("dashboard.turnaroundHint")}
            delay={0.16}
          />
          <StatCard
            icon={Handshake}
            label={t("dashboard.agreement")}
            value={stats.agreement_rate === null ? "—" : percent(stats.agreement_rate)}
            hint={t("dashboard.agreementHint", { n: stats.decisions })}
            delay={0.2}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-bold text-ink"><Activity className="size-5 text-emerald-600" /> {t("dashboard.weekTitle")}</h2>
            <Legend items={[{ label: t("dashboard.uploaded"), color: SERIES.blue }, { label: t("dashboard.reviewed"), color: SERIES.emerald }]} />
          </div>
          <div className="mt-4">
            {stats ? (
              <GroupedBars
                categories={stats.daily.map((d) => weekday(`${d.day}T12:00:00`))}
                series={[
                  { label: t("dashboard.uploaded"), color: SERIES.blue, values: stats.daily.map((d) => d.uploaded) },
                  { label: t("dashboard.reviewed"), color: SERIES.emerald, values: stats.daily.map((d) => d.reviewed) },
                ]}
              />
            ) : (
              <Skeleton className="h-44" />
            )}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card p-6">
          <h2 className="flex items-center gap-2 font-bold text-ink"><Siren className="size-5 text-rose-500" /> {t("dashboard.urgentTitle")}</h2>
          {!stats ? (
            <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : stats.urgent_cases.length === 0 ? (
            <EmptyState icon={CheckCheck} title={t("dashboard.urgentEmpty")} />
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.urgent_cases.map((item) => (
                <li key={item.id}>
                  <Link href={`/cases/${item.id}`} className="group flex items-center gap-3 py-3">
                    {item.thumbnail && <img src={item.thumbnail} alt="" className="size-11 rounded-xl bg-slate-900 object-cover" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-bold text-ink">
                        {caseNumber(item.id)} <span className="font-mono text-xs font-medium text-slate-400">{item.patient.pseudonym}</span>
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {study(item)} · {item.headline ? finding(item.headline) : t("worklist.noFindings")}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                      <PriorityBadge priority={item.priority} reason={item.priority_reason} />
                      <Waiting since={item.created_at} />
                    </div>
                    <ArrowRight className="size-4 text-slate-300 transition group-hover:text-emerald-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>
    </div>
  );
}
