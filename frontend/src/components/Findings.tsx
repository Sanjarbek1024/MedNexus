import { motion } from "framer-motion";
import { BoxSelect, ChevronDown, CircleCheck, Flame, HeartPulse, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import type { AnalysisResult, Finding, Measurement } from "../lib/api";
import { LEVEL_STYLES, modelName } from "../lib/format";

function ScoreBar({ value, gradient, delay = 0, threshold }: { value: number; gradient: string; delay?: number; threshold?: number }) {
  return (
    <div className="relative h-2 rounded-full bg-slate-100">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      />
      {threshold !== undefined && <div className="absolute -top-1 h-4 w-px bg-slate-400/70" style={{ left: `${threshold * 100}%` }} />}
    </div>
  );
}

export function FindingCard({ finding, index, selected, threshold, onSelect }: {
  finding: Finding;
  index: number;
  selected: boolean;
  threshold: number;
  onSelect: () => void;
}) {
  const { t, finding: name } = useI18n();
  const [open, setOpen] = useState(false);
  const models = Object.keys(finding.model_scores).length;
  const style = LEVEL_STYLES[finding.level];
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index }}
      className={`card p-5 transition ${selected ? "ring-2 ring-emerald-400" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{name(finding.name)}</h3>
          <span className={`chip mt-1.5 ${style.chip}`}>{t(`levels.${finding.level}`)}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums text-ink">{finding.score.toFixed(2)}</div>
          <div className="eyebrow" title={t("findings.scoresTooltip")}>{t("findings.aiScore")}</div>
        </div>
      </div>
      <div className="mt-4">
        <ScoreBar value={finding.score} gradient={style.bar} delay={0.1 + 0.08 * index} threshold={threshold} />
        <div className="relative mt-1 h-3 text-[10px] font-medium text-slate-400">
          <span className="absolute left-0">0</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${threshold * 100}%` }}>{t("findings.threshold", { t: threshold.toFixed(2) })}</span>
          <span className="absolute right-0">1</span>
        </div>
      </div>
      {finding.explanation && <p className="mt-3 text-sm leading-relaxed text-slate-600">{finding.explanation}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {models < 2 ? (
          <span className="chip bg-slate-100 text-slate-600">{t("findings.single")}</span>
        ) : finding.models_agree ? (
          <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><CircleCheck className="size-3.5" /> {t("findings.agree", { n: models })}</span>
        ) : (
          <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200"><TriangleAlert className="size-3.5" /> {t("findings.disagree")}</span>
        )}
        {(finding.heatmap || finding.boxes.length > 0) && (
          <button type="button" onClick={onSelect} className="chip bg-slate-100 text-slate-700 transition hover:bg-slate-200">
            {finding.heatmap ? <><Flame className="size-3.5 text-orange-500" /> {t("findings.showHeatmap")}</> : <><BoxSelect className="size-3.5 text-rose-500" /> {t("findings.showBoxes", { n: finding.boxes.length })}</>}
          </button>
        )}
        {models > 1 && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
            {t("findings.perModel")} <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-2">
          {Object.entries(finding.model_scores).map(([model, value]) => (
            <div key={model} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-xs">
              <span className="font-semibold text-slate-600">{modelName(model)}</span>
              <ScoreBar value={value} gradient="from-slate-300 to-slate-500" threshold={threshold} />
              <span className="text-right font-semibold tabular-nums text-slate-600">{value.toFixed(2)}</span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.article>
  );
}

export function FindingsPanel({ result, selected, onSelect }: { result: AnalysisResult; selected: string | null; onSelect: (name: string) => void }) {
  const { t, finding } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const threshold = result.thresholds.report ?? 0.5;
  return (
    <section aria-labelledby="findings-title" className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="eyebrow">{t("findings.eyebrow")}</div>
          <h2 id="findings-title" className="text-lg font-semibold text-ink">
            {result.findings.length ? t("findings.flagged", { n: result.findings.length }) : t("findings.none")}
          </h2>
        </div>
        <span className="flex items-center gap-1 text-xs text-slate-400" title={t("findings.scoresTooltip")}>
          <Info className="size-3.5" /> {t("findings.scoresNote")}
        </span>
      </div>
      {result.findings.length === 0 && (
        <div className="card p-5 text-sm text-slate-600">{t("findings.noneText", { n: result.other_scores.length })}</div>
      )}
      {result.findings.map((f, index) => (
        <FindingCard key={f.name} finding={f} index={index} selected={f.name === selected} threshold={threshold} onSelect={() => onSelect(f.name)} />
      ))}
      <div className="card p-4">
        <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="flex w-full items-center justify-between text-sm font-semibold text-slate-600">
          {t("findings.below", { n: result.other_scores.length })}
          <ChevronDown className={`size-4 transition ${showAll ? "rotate-180" : ""}`} />
        </button>
        {showAll && (
          <div className="mt-3 space-y-2">
            {result.other_scores.map((item) => (
              <div key={item.name} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 text-xs">
                <span className="text-slate-600">{finding(item.name)}</span>
                <ScoreBar value={item.score} gradient="from-slate-200 to-slate-300" threshold={threshold} />
                <span className="text-right tabular-nums text-slate-500">{item.score.toFixed(2)}</span>
              </div>
            ))}
            {result.not_assessed.length > 0 && (
              <p className="pt-2 text-xs text-slate-400">{t("findings.notAssessed", { items: result.not_assessed.map(finding).join(", ") })}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function MeasurementCard({ measurement, view }: { measurement: Measurement; view: string }) {
  const { t, finding } = useI18n();
  const above = measurement.reference !== null && measurement.value > measurement.reference;
  return (
    <div className="card flex items-start gap-4 p-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><HeartPulse className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-semibold text-ink">{finding(measurement.label)}</div>
          <div className="text-xl font-semibold tabular-nums text-ink">{measurement.value.toFixed(2)}</div>
        </div>
        {measurement.reference !== null && (
          <div className={`mt-0.5 text-xs font-semibold ${above ? "text-amber-600" : "text-emerald-600"}`}>
            {t(above ? "findings.above" : "findings.within", { r: measurement.reference.toFixed(2) })}
          </div>
        )}
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {measurement.id === "ctr" ? `${t("findings.ctrDetail")}${view === "AP" ? ` ${t("findings.ctrAp")}` : ""}` : measurement.detail}
        </p>
      </div>
    </div>
  );
}
