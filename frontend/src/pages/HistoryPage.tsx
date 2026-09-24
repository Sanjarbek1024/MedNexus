import { motion } from "framer-motion";
import { ChevronRight, FolderOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { api, type CaseSummary } from "../lib/api";
import { caseNumber, dateTime, STATUSES, studyLabel } from "../lib/format";
import { Link, navigate } from "../lib/router";

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card p-5">
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 text-3xl font-extrabold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export function HistoryPage() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [audit, setAudit] = useState<{ valid: boolean; events: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.cases().then((body) => setCases(body.items), (e: Error) => setError(e.message));
    api.verifyAudit().then(setAudit, () => setAudit(null));
  }, []);

  const count = (predicate: (c: CaseSummary) => boolean) => cases?.filter(predicate).length ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 pb-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Audit log</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">Case history</h1>
          <p className="mt-1 text-slate-500">Every analysis, AI draft and physician decision, in order.</p>
        </div>
        {audit && (
          <div
            className={`chip py-1.5 text-sm ${
              audit.valid ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
            }`}
          >
            {audit.valid ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
            {audit.valid ? `Audit chain intact · ${audit.events} events` : "Audit chain broken: records were altered"}
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cases" value={cases?.length ?? 0} tone="text-ink" />
        <Stat label="Awaiting review" value={count((c) => c.status === "draft")} tone="text-amber-600" />
        <Stat label="Reviewed" value={count((c) => ["confirmed", "rejected", "edited"].includes(c.status))} tone="text-emerald-600" />
        <Stat label="Images rejected" value={count((c) => c.status === "image_rejected")} tone="text-slate-500" />
      </div>

      <div className="card mt-6 overflow-hidden">
        {error && <div className="p-6 text-sm text-rose-600">{error}</div>}
        {cases && cases.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <FolderOpen className="size-10 text-slate-300" />
            <div className="font-semibold text-ink">No cases yet</div>
            <Link href="/" className="btn-primary">Analyze a study</Link>
          </div>
        )}
        {cases && cases.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Case</th>
                  <th className="px-5 py-3 font-semibold">Study</th>
                  <th className="px-5 py-3 font-semibold">AI headline</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Reviewer</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((item, index) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 12) * 0.03 }}
                    onClick={() => navigate(`/cases/${item.id}`)}
                    className="group cursor-pointer transition hover:bg-emerald-50/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <img src={item.thumbnail} alt="" className="size-11 rounded-xl bg-slate-900 object-cover" />
                        <div>
                          <Link href={`/cases/${item.id}`} className="font-bold text-ink">{caseNumber(item.id)}</Link>
                          <div className="text-xs text-slate-500">{dateTime(item.created_at)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{studyLabel(item)}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {item.status === "image_rejected"
                        ? "—"
                        : item.headline
                          ? `${item.headline}${item.finding_count > 1 ? ` +${item.finding_count - 1}` : ""}`
                          : "No finding above threshold"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`chip ${STATUSES[item.status].chip}`}>{STATUSES[item.status].label}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{item.reviewer ?? "—"}</td>
                    <td className="pr-4 text-slate-300 group-hover:text-emerald-500">
                      <ChevronRight className="size-4" />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
