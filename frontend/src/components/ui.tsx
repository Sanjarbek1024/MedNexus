import { AnimatePresence, motion } from "framer-motion";
import { Info, X, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { useI18n } from "../i18n";
import type { CaseStatus, Priority } from "../lib/api";
import { minutesSince, PRIORITY_STYLES, STATUS_STYLES } from "../lib/format";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-shimmer rounded-xl bg-[linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9)] bg-[length:200%_100%] ${className}`}
    />
  );
}

export function EmptyState({ icon: Icon, title, text, action }: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-emerald-100/60 blur-xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-soft ring-1 ring-emerald-100">
          <Icon className="size-7" />
        </div>
      </div>
      <div className="font-bold text-ink">{title}</div>
      {text && <p className="max-w-sm text-sm text-slate-500">{text}</p>}
      {action}
    </div>
  );
}

export function StatusChip({ status }: { status: CaseStatus }) {
  const { t } = useI18n();
  return <span className={`chip ${STATUS_STYLES[status]}`}>{t(`status.${status}`)}</span>;
}

export function PriorityBadge({ priority, reason }: { priority: Priority; reason?: string | null }) {
  const { t } = useI18n();
  return (
    <span className={`chip ${PRIORITY_STYLES[priority].chip}`} title={reason ?? undefined}>
      <span className={`size-1.5 rounded-full ${PRIORITY_STYLES[priority].dot} ${priority === "urgent" ? "animate-pulse" : ""}`} />
      {t(`priority.${priority}`)}
    </span>
  );
}

export function Waiting({ since, until }: { since: string; until?: string | null }) {
  const { t } = useI18n();
  const minutes = minutesSince(since, until);
  const text =
    minutes < 1 ? t("common.justNow")
    : minutes < 60 ? t("common.minutes", { n: Math.round(minutes) })
    : minutes < 60 * 48 ? t("common.hours", { n: Math.round(minutes / 60) })
    : t("common.days", { n: Math.round(minutes / 1440) });
  return <span className={`tabular-nums ${!until && minutes > 60 ? "font-semibold text-amber-700" : ""}`}>{text}</span>;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, hint, tone = "text-ink", delay = 0 }: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="card p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="eyebrow">{label}</div>
        {hint ? (
          <span title={hint} aria-label={hint} className="text-slate-300 hover:text-slate-500"><Info className="size-4" /></span>
        ) : (
          <Icon className="size-4 shrink-0 text-slate-300" />
        )}
      </div>
      <div className={`mt-2 text-3xl font-extrabold tabular-nums ${tone}`}>{value}</div>
    </motion.div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-2xl bg-white/70 p-1 shadow-soft ring-1 ring-slate-200/60">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`relative rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
            value === option.id ? "text-emerald-800" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {value === option.id && (
            <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-xl bg-emerald-50 ring-1 ring-emerald-200" />
          )}
          <span className="relative">
            {option.label}
            {option.count !== undefined && <span className="ml-1.5 text-xs text-slate-400">{option.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            onClick={(event) => event.stopPropagation()}
            className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">{title}</h2>
                {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label={t("common.close")}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Right-hand slide-over panel (chat, report editor). */
export function Drawer({ open, onClose, children, label, width = "max-w-xl" }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="no-print fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", bounce: 0.08, duration: 0.45 }}
            className={`absolute inset-y-0 right-0 flex w-full ${width} flex-col border-l border-white/80 bg-canvas/95 shadow-2xl backdrop-blur-xl`}
          >
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
