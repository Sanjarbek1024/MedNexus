import { motion } from "framer-motion";
import { Check, FileImage, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import type { Stage } from "../lib/api";

const IMAGE_STEPS: Stage[] = ["clinical", "quality", "models", "explainability", "report"];
const CLINICAL_STEPS: Stage[] = ["clinical", "report"];

export function ScanningImage({ preview }: { preview: string | null }) {
  return (
    <div className="relative flex h-[30rem] items-center justify-center overflow-hidden rounded-[28px] bg-night shadow-soft">
      {preview ? <img src={preview} alt="" className="h-full w-full object-contain opacity-90" /> : <FileImage className="size-16 text-emerald-400/70" />}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(92,255,99,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(92,255,99,.25) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-x-0 h-28"
        initial={{ top: "-15%" }}
        animate={{ top: ["-15%", "100%"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
      >
        <div className="h-full bg-gradient-to-b from-transparent via-emerald-400/20 to-emerald-400/5" />
        <div className="h-0.5 bg-emerald-300 shadow-[0_0_24px_6px_rgba(92,255,99,0.75)]" />
      </motion.div>
    </div>
  );
}

/** `clinical`: a case without an image (rules engine, then the clinical reasoner). */
export function StepList({ reached, clinical = false }: { reached: Stage[]; clinical?: boolean }) {
  const STEPS = clinical ? CLINICAL_STEPS : IMAGE_STEPS;
  const { t, list } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => window.clearInterval(timer);
  }, []);
  const current = reached.length ? STEPS.indexOf(reached[reached.length - 1]) : 0;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{t("analyze.analyzing")}</div>
          <div className="mt-1 text-lg font-semibold text-ink">{t("analyze.running")}</div>
        </div>
        <div className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold whitespace-nowrap tabular-nums text-emerald-700">{elapsed.toFixed(1)} s</div>
      </div>
      <ol className="mt-6 space-y-1">
        {STEPS.map((step, index) => {
          const [label, detail] = list<string>(clinical && step === "report" ? "analyze.clinicalSteps.report" : `analyze.steps.${step}`);
          const state = index < current ? "done" : index === current ? "active" : "pending";
          return (
            <motion.li
              key={step}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className={`flex items-start gap-4 rounded-2xl p-3 transition ${state === "active" ? "bg-emerald-50/70" : ""}`}
            >
              <div
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition ${
                  state === "done" ? "bg-brand text-on-brand ring-emerald-500"
                  : state === "active" ? "bg-surface text-emerald-600 ring-emerald-300"
                  : "bg-surface text-slate-300 ring-slate-200"
                }`}
              >
                {state === "done" ? <Check className="size-4" /> : state === "active" ? <LoaderCircle className="size-4 animate-spin" /> : <span className="text-xs font-semibold">{index + 1}</span>}
              </div>
              <div>
                <div className={`font-semibold ${state === "pending" ? "text-slate-400" : "text-ink"}`}>{label}</div>
                <div className="text-sm text-slate-500">{detail}</div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
