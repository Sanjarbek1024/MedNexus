import { motion } from "framer-motion";
import { ChevronRight, FolderOpen, LoaderCircle, Search, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BatchUpload } from "../components/BatchUpload";
import { EmptyState, PageHeader, PriorityBadge, Segmented, Skeleton, StatusChip, Waiting } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type CaseQuery, type CaseSummary, type Priority } from "../lib/api";
import { caseNumber } from "../lib/format";
import { Link, navigate } from "../lib/router";

type Group = NonNullable<CaseQuery["group"]> | "all";

export function WorklistPage() {
  const { t, finding, study } = useI18n();
  const [group, setGroup] = useState<Group>("open");
  const [priority, setPriority] = useState<Priority | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [audit, setAudit] = useState<{ valid: boolean; events: number } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useMemo(
    () => () =>
      api
        .cases({ group: group === "all" ? undefined : group, priority: priority || undefined, q: search || undefined, limit: 200 })
        .then((body) => {
          setCases(body.items);
          setError(null);
        }, (e: Error) => setError(e.message)),
    [group, priority, search],
  );

  useEffect(() => {
    load();
    api.verifyAudit().then(setAudit, () => setAudit(null));
  }, [load]);

  const processing = cases?.filter((c) => c.status === "queued" || c.status === "analyzing").length ?? 0;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [processing, load]);

  const groups: { id: Group; label: string }[] = (["open", "new", "ai_ready", "reviewed", "rejected", "all"] as const).map((id) => ({
    id,
    label: t(`worklist.groups.${id}`),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t("nav.worklist")}
        title={t("worklist.title")}
        subtitle={t("worklist.subtitle")}
        actions={
          <>
            {audit && (
              <span className={`chip py-1.5 ${audit.valid ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"}`}>
                {audit.valid ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                {audit.valid ? t("audit.intact", { n: audit.events }) : t("audit.broken")}
              </span>
            )}
            <button type="button" className="btn-primary" onClick={() => setBatchOpen(true)}>
              <Upload className="size-4" /> {t("worklist.batch")}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={group} options={groups} onChange={setGroup} label="status" />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority | "")}
          className="field w-auto py-2"
          aria-label={t("worklist.priorityAll")}
        >
          <option value="">{t("worklist.priorityAll")}</option>
          {(["urgent", "attention", "routine"] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
        </select>
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="field pl-9"
            placeholder={t("worklist.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("common.search")}
          />
        </label>
      </div>

      {processing > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
          <LoaderCircle className="size-4 animate-spin" /> {t("worklist.processing", { n: processing })}
        </motion.div>
      )}

      <div className="card overflow-hidden">
        {error && <div className="p-6 text-sm text-rose-600">{error}</div>}
        {!cases && !error && (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        )}
        {cases && cases.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            title={search || priority || group !== "all" ? t("worklist.emptyFiltered") : t("worklist.empty")}
            action={<Link href="/analyze" className="btn-primary">{t("worklist.analyzeFirst")}</Link>}
          />
        )}
        {cases && cases.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                <tr>
                  {(["case", "study", "flag", "status", "waiting", "owner"] as const).map((column) => (
                    <th key={column} className="px-5 py-3 font-semibold whitespace-nowrap">{t(`worklist.columns.${column}`)}</th>
                  ))}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((item, index) => (
                  <motion.tr
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 12) * 0.025 }}
                    onClick={() => navigate(`/cases/${item.id}`)}
                    className={`group cursor-pointer transition hover:bg-emerald-50/40 ${item.priority === "urgent" && item.status !== "reviewed" ? "bg-rose-50/30" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="size-11 rounded-xl bg-slate-900 object-cover" />
                        ) : (
                          <div className="size-11 rounded-xl bg-slate-100" />
                        )}
                        <div>
                          <Link href={`/cases/${item.id}`} className="font-bold text-ink">{caseNumber(item.id)}</Link>
                          <div className="font-mono text-xs whitespace-nowrap text-slate-500">{item.patient.pseudonym}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">{study(item)}</td>
                    <td className="px-5 py-3">
                      {item.status === "ai_ready" || item.status === "reviewed" ? (
                        <div className="flex flex-col items-start gap-1">
                          <PriorityBadge priority={item.priority} reason={item.priority_reason} />
                          <span className="text-xs text-slate-500">
                            {item.headline
                              ? `${finding(item.headline)}${item.finding_count > 1 ? ` +${item.finding_count - 1}` : ""}`
                              : t("worklist.noFindings")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {(item.status === "queued" || item.status === "analyzing") && <LoaderCircle className="size-3.5 animate-spin text-sky-500" />}
                        <StatusChip status={item.status} />
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600"><Waiting since={item.created_at} until={item.reviewed_at} /></td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">{item.reviewer ?? item.owner}</td>
                    <td className="pr-4 text-slate-300 group-hover:text-emerald-500"><ChevronRight className="size-4" /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BatchUpload open={batchOpen} onClose={() => setBatchOpen(false)} onQueued={load} />
    </div>
  );
}
