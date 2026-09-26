import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  CircleCheck,
  CircleMinus,
  Cpu,
  Eye,
  FlaskConical,
  Info,
  ShieldAlert,
  Siren,
  StickyNote,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import type { Assessment, DifferentialItem } from "../lib/api";

const EASE = [0.22, 1, 0.36, 1] as const;

type Source = "image" | "model" | "symptom" | "note";

// The assessment prefixes each piece of evidence with its source, in the answer language.
const SOURCE_PREFIX: { source: Source; pattern: RegExp }[] = [
  { source: "image", pattern: /^(rasm|tasvir|image|imaging|изображение|снимок|рентген|мрт|кт)$/i },
  { source: "model", pattern: /^(model|modellar|ai|модель|модели|ии)$/i },
  { source: "symptom", pattern: /^(simptom|simptomlar|belgilar|anamnez|symptom|symptoms|history|симптом|симптомы|жалобы|анамнез)$/i },
];

const SOURCE_STYLE: Record<Source, { icon: LucideIcon; chip: string }> = {
  image: { icon: Eye, chip: "bg-sky-50 text-sky-700 ring-sky-200" },
  model: { icon: Cpu, chip: "bg-violet-50 text-violet-700 ring-violet-200" },
  symptom: { icon: UserRound, chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  note: { icon: StickyNote, chip: "bg-slate-100 text-slate-600 ring-slate-200" },
};

/** Splits "Rasm: …" into its source and the remaining text. */
export function parseEvidence(text: string): { source: Source | null; text: string } {
  const match = /^\s*([^:：]{1,24})\s*[:：]\s*(.+)$/s.exec(text);
  if (match) {
    const label = match[1].trim();
    const found = SOURCE_PREFIX.find((p) => p.pattern.test(label));
    if (found) return { source: found.source, text: match[2].trim() };
  }
  return { source: null, text: text.trim() };
}

const list = (items: string[] | undefined): string[] => (items ?? []).filter((item) => item && item.trim());

export const hasEvidence = (item: DifferentialItem): boolean =>
  Boolean(item.reasoning?.trim() || list(item.evidence_for).length || list(item.evidence_against).length || list(item.confirm_with).length);

function SourceChip({ source }: { source: Source }) {
  const { t } = useI18n();
  const { icon: Icon, chip } = SOURCE_STYLE[source];
  return (
    <span className={`chip shrink-0 py-0 text-[10px] ring-1 ${chip}`}>
      <Icon className="size-3" /> {t(`evidence.sources.${source}`)}
    </span>
  );
}

function EvidenceGroup({ icon: Icon, tone, title, items, sources = true }: {
  icon: LucideIcon;
  tone: string;
  title: string;
  items: string[];
  sources?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${tone}`}><Icon className="size-3.5" /> {title}</div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((raw, i) => {
          const { source, text } = sources ? parseEvidence(raw) : { source: null, text: raw };
          return (
            <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm leading-relaxed text-slate-700">
              {source && <span className="mt-0.5"><SourceChip source={source} /></span>}
              <span className="min-w-0 flex-1 basis-40">{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReasoningPanel({ item }: { item: DifferentialItem }) {
  const { t } = useI18n();
  return (
    <div className="mt-3 space-y-3.5 rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/70 sm:p-4">
      {item.reasoning?.trim() && <p className="text-sm leading-relaxed text-slate-600">{item.reasoning}</p>}
      <EvidenceGroup icon={CircleCheck} tone="text-emerald-700" title={t("evidence.why")} items={list(item.evidence_for)} />
      <EvidenceGroup icon={CircleMinus} tone="text-slate-500" title={t("evidence.against")} items={list(item.evidence_against)} />
      {list(item.confirm_with).length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700"><FlaskConical className="size-3.5" /> {t("evidence.confirm")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {list(item.confirm_with).map((test, i) => (
              <span key={i} className="chip max-w-full rounded-lg! bg-surface py-1 whitespace-normal text-slate-700 ring-1 ring-sky-200">{test}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Estimated likelihoods as horizontal bars, never presented as certainties. Each row opens a
 * reasoning panel: evidence for and against (with its source) and the tests that would decide it.
 */
export function DifferentialBars({ items, clinical = false }: { items: DifferentialItem[]; clinical?: boolean }) {
  const { t, finding } = useI18n();
  const expandable = items.map(hasEvidence);
  // Doctors see the leading item's reasoning straight away; people open what interests them.
  const [open, setOpen] = useState<Set<number>>(() => new Set(clinical && expandable[0] ? [0] : []));
  const top = Math.max(...items.map((i) => i.probability), 1);
  const toggle = (i: number) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const allOpen = expandable.every((e, i) => !e || open.has(i));

  return (
    <div>
      {clinical && expandable.filter(Boolean).length > 1 && (
        <div className="-mt-1 mb-2 flex justify-end">
          <button
            type="button"
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            onClick={() => setOpen(allOpen ? new Set() : new Set(expandable.flatMap((e, i) => (e ? [i] : []))))}
          >
            {allOpen ? t("evidence.collapseAll") : t("evidence.expandAll")}
          </button>
        </div>
      )}
      <ol className={clinical ? "space-y-3" : "space-y-4"}>
        {items.map((item, i) => {
          const expanded = open.has(i);
          const percent = Math.min(90, Math.max(0, Math.round(item.probability)));
          const flagged = Boolean(item.cannot_miss);
          const bar = clinical && flagged ? "from-amber-300 to-amber-500" : "from-emerald-300 to-teal-500";
          const header = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className={`font-semibold text-ink ${clinical ? "text-sm" : "text-[15px]"}`}>
                    {finding(item.name)}
                    {expandable[i] && (
                      <ChevronDown className={`ml-1 inline size-3.5 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className={`font-semibold text-ink tabular-nums ${clinical ? "text-sm" : "text-lg"}`}>~{percent}%</span>
                  <span className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">{t("patient.estimated")}</span>
                </span>
              </div>
              {flagged && (
                <span className={`mt-1 inline-flex max-w-full items-start gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ring-1 ${clinical ? "bg-amber-100 text-amber-800 ring-amber-300" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                  <ShieldAlert className="mt-0.5 size-3 shrink-0" /> {t(clinical ? "evidence.cannotMissDoctor" : "evidence.cannotMissPatient")}
                </span>
              )}
              <div className={`relative mt-1.5 overflow-hidden rounded-full bg-slate-100 ${clinical ? "h-1.5" : "h-2.5"}`}>
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${bar}`}
                  style={{ opacity: 0.55 + 0.45 * (item.probability / top) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 1, delay: 0.15 + 0.08 * i, ease: EASE }}
                />
                {/* Hatched tail: the part no model can ever claim. */}
                <div className="absolute inset-y-0 right-0 w-[10%] bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(148_163_184/0.25)_3px_5px)]" />
              </div>
            </>
          );
          return (
            <motion.li key={`${item.name}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }}>
              {expandable[i] ? (
                <button type="button" onClick={() => toggle(i)} aria-expanded={expanded} title={t("evidence.showReasoning")} className="group w-full cursor-pointer text-left">
                  {header}
                </button>
              ) : (
                <div>{header}</div>
              )}
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <ReasoningPanel item={item} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

/** Everything a doctor should actively exclude or double-check, collected in one place. */
export function dontMiss(assessment: Assessment | null) {
  return {
    ruleOut: assessment?.differential.filter((d) => d.cannot_miss) ?? [],
    redFlags: list(assessment?.red_flags),
    watchOut: list(assessment?.watch_out),
    mismatch: assessment?.mismatch?.trim() ?? "",
  };
}

export function DontMissPanel({ assessment }: { assessment: Assessment | null }) {
  const { t, finding } = useI18n();
  const { ruleOut, redFlags, watchOut, mismatch } = dontMiss(assessment);
  if (!ruleOut.length && !redFlags.length && !watchOut.length && !mismatch) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden border-amber-200/80 p-0 ring-1 ring-amber-200/70"
      aria-labelledby="dont-miss-title"
    >
      <div className="flex items-start gap-3 bg-gradient-to-br from-amber-50 to-orange-50/40 px-5 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm"><ShieldAlert className="size-5" /></div>
        <div className="min-w-0">
          <h2 id="dont-miss-title" className="font-semibold text-ink">{t("assessment.dontMiss")}</h2>
          <p className="mt-0.5 text-xs text-amber-900/70">{t("assessment.dontMissHint")}</p>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">
        {redFlags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700"><Siren className="size-3.5" /> {t("assessment.redFlags")}</div>
            <ul className="mt-1.5 space-y-1.5">
              {redFlags.map((flag, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-rose-50/80 px-3 py-2 text-sm text-rose-950 ring-1 ring-rose-100">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rose-500" /> <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {ruleOut.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800"><ShieldAlert className="size-3.5" /> {t("assessment.ruleOut")}</div>
            <ul className="mt-1.5 space-y-1.5">
              {ruleOut.map((item) => (
                <li key={item.name} className="rounded-xl bg-surface px-3 py-2 ring-1 ring-amber-200/80">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">{finding(item.name)}</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums">~{Math.min(90, Math.round(item.probability))}%</span>
                  </div>
                  {list(item.confirm_with).length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <FlaskConical className="size-3.5 text-sky-600" />
                      {list(item.confirm_with).map((test, i) => <span key={i} className="chip max-w-full rounded-lg! bg-sky-50 whitespace-normal text-sky-800 ring-1 ring-sky-200">{test}</span>)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {watchOut.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Eye className="size-3.5" /> {t("assessment.watchOut")}</div>
            <ul className="mt-1.5 space-y-1.5">
              {watchOut.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-400" /> <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {mismatch && (
          <div className="flex gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-950 ring-1 ring-sky-200">
            <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
            <div><span className="font-semibold">{t(assessment?.mode === "clinical" ? "assessment.mismatchClinical" : "assessment.mismatch")}: </span>{mismatch}</div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
