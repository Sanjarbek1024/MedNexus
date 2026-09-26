import { motion } from "framer-motion";
import { ChevronRight, FolderHeart, ImageOff, LoaderCircle, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { UrgencyChip } from "../components/PatientResult";
import { EmptyState, PageHeader, Skeleton } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type CaseStatus, type CaseSummary } from "../lib/api";
import { Link } from "../lib/router";

const STATUS_TONE: Record<CaseStatus, string> = {
  queued: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  analyzing: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  ai_ready: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  reviewed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  image_rejected: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};

function ScanCard({ scan, index }: { scan: CaseSummary; index: number }) {
  const { t, scanTitle, date, finding } = useI18n();
  const busy = scan.status === "queued" || scan.status === "analyzing";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link
        href={`/cases/${scan.id}`}
        className="group card flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
          {scan.thumbnail ? (
            <img src={scan.thumbnail} alt="" loading="lazy" className="size-full object-contain transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex size-full items-center justify-center text-slate-600"><ImageOff className="size-8" /></div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/70 to-transparent" />
          <span className={`chip absolute top-3 left-3 ${STATUS_TONE[scan.status]}`}>
            {busy && <LoaderCircle className="size-3 animate-spin" />}
            {t(`myScans.status.${scan.status}`)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="line-clamp-2 leading-snug font-bold text-ink">{scanTitle(scan)}</div>
              <div className="mt-0.5 text-xs text-slate-500">{date(scan.acquired_at ?? scan.created_at, false)}</div>
            </div>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {scan.urgency && <UrgencyChip urgency={scan.urgency} />}
            {scan.headline && scan.status !== "image_rejected" && (
              <span className="chip bg-slate-100 text-slate-600">{finding(scan.headline)}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function MyScansPage() {
  const { t } = useI18n();
  const [scans, setScans] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api.cases({ sort: "recent", limit: 100 }).then(
        (body) => {
          setScans(body.items);
          setError(null);
        },
        (e: Error) => setError(e.message),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const processing = scans?.some((s) => s.status === "queued" || s.status === "analyzing") ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [processing, load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t("nav.myScans")}
        title={t("myScans.title")}
        subtitle={t("myScans.subtitle")}
        actions={
          <Link href="/analyze" className="btn-primary rounded-full px-5">
            <Plus className="size-4" /> {t("myScans.newScan")}
          </Link>
        }
      />

      {error && <div role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

      {!scans && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      )}

      {scans && scans.length === 0 && (
        <div className="card">
          <EmptyState
            icon={FolderHeart}
            title={t("myScans.empty")}
            text={t("myScans.emptyText")}
            action={<Link href="/analyze" className="btn-primary mt-2 rounded-full px-6"><Plus className="size-4" /> {t("myScans.newScan")}</Link>}
          />
        </div>
      )}

      {scans && scans.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scans.map((scan, i) => <ScanCard key={scan.id} scan={scan} index={i} />)}
        </div>
      )}
    </div>
  );
}
