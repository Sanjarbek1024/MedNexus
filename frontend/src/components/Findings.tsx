import { motion } from "framer-motion";
import { ChevronDown, CircleCheck, Flame, HeartPulse, Info, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { AnalysisResult, Finding, Measurement } from "../lib/api";
import { LEVELS, modelName, score } from "../lib/format";

const SCORE_NOTE =
  "Model scores are normalized so that 0.50 is each model's decision threshold. They are not calibrated probabilities.";

function ScoreBar({ value, gradient, delay = 0, threshold = 0.5 }: {
  value: number;
  gradient: string;
  delay?: number;
  threshold?: number;
}) {
  return (
    <div className="relative h-2 rounded-full bg-slate-100">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
        initial={{ width: 0 }}
        animate={{ width: `${value * 100}%` }}
        transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="absolute -top-1 h-4 w-px bg-slate-400/70" style={{ left: `${threshold * 100}%` }} />
    </div>
  );
}

export function FindingCard({ finding, index, selected, onSelect }: {
  finding: Finding;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const level = LEVELS[finding.level];
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 * index }}
      className={`card p-5 transition ${selected ? "ring-2 ring-emerald-400" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{finding.name}</h3>
          <span className={`chip mt-1.5 ${level.chip}`}>{level.label}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold tabular-nums text-ink">{score(finding.score)}</div>
          <div className="eyebrow" title={SCORE_NOTE}>AI score</div>
        </div>
      </div>

      <div className="mt-4">
        <ScoreBar value={finding.score} gradient={level.bar} delay={0.1 + 0.08 * index} />
        <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
          <span>0</span>
          <span>0.50 threshold</span>
          <span>1</span>
        </div>
      </div>

      {finding.explanation && <p className="mt-3 text-sm leading-relaxed text-slate-600">{finding.explanation}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {finding.models_agree ? (
          <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            <CircleCheck className="size-3.5" /> {Object.keys(finding.model_scores).length}/{Object.keys(finding.model_scores).length} models agree
          </span>
        ) : (
          <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <TriangleAlert className="size-3.5" /> Models disagree
          </span>
        )}
        {finding.heatmap && (
          <button type="button" onClick={onSelect} className="chip bg-slate-100 text-slate-700 transition hover:bg-slate-200">
            <Flame className="size-3.5 text-orange-500" /> Show heatmap
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Per model <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 space-y-2">
          {Object.entries(finding.model_scores).map(([model, value]) => (
            <div key={model} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-xs">
              <span className="font-semibold text-slate-600">{modelName(model)}</span>
              <ScoreBar value={value} gradient="from-slate-300 to-slate-500" />
              <span className="text-right font-semibold tabular-nums text-slate-600">{score(value)}</span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.article>
  );
}

export function FindingsPanel({ result, selected, onSelect }: {
  result: AnalysisResult;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  return (
    <section aria-labelledby="findings-title" className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="eyebrow">AI findings</div>
          <h2 id="findings-title" className="text-lg font-bold text-ink">
            {result.findings.length ? `${result.findings.length} flagged for review` : "No finding above threshold"}
          </h2>
        </div>
        <span className="flex items-center gap-1 text-xs text-slate-400" title={SCORE_NOTE}>
          <Info className="size-3.5" /> Scores are not probabilities
        </span>
      </div>

      {result.findings.length === 0 && (
        <div className="card p-5 text-sm text-slate-600">
          None of the {result.other_scores.length} assessed pathologies reached the reporting threshold. This does
          not rule out disease; the image still requires physician review.
        </div>
      )}
      {result.findings.map((finding, index) => (
        <FindingCard
          key={finding.name}
          finding={finding}
          index={index}
          selected={finding.name === selected}
          onSelect={() => onSelect(finding.name)}
        />
      ))}

      <div className="card p-4">
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="flex w-full items-center justify-between text-sm font-semibold text-slate-600"
        >
          Below threshold ({result.other_scores.length})
          <ChevronDown className={`size-4 transition ${showAll ? "rotate-180" : ""}`} />
        </button>
        {showAll && (
          <div className="mt-3 space-y-2">
            {result.other_scores.map((item) => (
              <div key={item.name} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 text-xs">
                <span className="text-slate-600">{item.name}</span>
                <ScoreBar value={item.score} gradient="from-slate-200 to-slate-300" />
                <span className="text-right tabular-nums text-slate-500">{score(item.score)}</span>
              </div>
            ))}
            {result.not_assessed.length > 0 && (
              <p className="pt-2 text-xs text-slate-400">
                Not assessed (not covered by every ensemble model): {result.not_assessed.join(", ")}.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function MeasurementCard({ measurement }: { measurement: Measurement }) {
  const above = measurement.reference !== null && measurement.value > measurement.reference;
  return (
    <div className="card flex items-start gap-4 p-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <HeartPulse className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-bold text-ink">{measurement.label}</div>
          <div className="text-xl font-extrabold tabular-nums text-ink">{measurement.value.toFixed(2)}</div>
        </div>
        {measurement.reference !== null && (
          <div className={`mt-0.5 text-xs font-semibold ${above ? "text-amber-600" : "text-emerald-600"}`}>
            {above ? "Above" : "Within"} the conventional {measurement.reference.toFixed(2)} reference
          </div>
        )}
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{measurement.detail}</p>
      </div>
    </div>
  );
}
