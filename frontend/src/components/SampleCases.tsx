import { AnimatePresence, motion } from "framer-motion";
import { Brain, Bone, FlaskConical, LoaderCircle, ScanLine, Stethoscope, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import { loadSampleCases, type SampleCase } from "../lib/samples";

const IMAGE_ICONS: Record<string, LucideIcon> = { chest: ScanLine, extremity: Bone, head: Brain };

/** "Load sample case": fills the intake (and the image) with a fictional teaching case for demos. */
export function SampleCaseMenu({ onLoad, busy }: { onLoad: (sample: SampleCase) => void; busy: boolean }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState<SampleCase[] | null>(null);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || cases) return;
    loadSampleCases().then(setCases, () => setFailed(true));
  }, [open, cases]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button type="button" className="btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FlaskConical className="size-4 text-emerald-600" />} {t("intake.samples.button")}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top-right rounded-2xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
          >
            <div className="px-3 pt-2 pb-1.5">
              <div className="text-sm font-semibold text-ink">{t("intake.samples.title")}</div>
              <div className="text-xs text-slate-500">{t("intake.samples.hint")}</div>
            </div>
            {!cases && !failed && <div className="flex justify-center py-6 text-slate-400"><LoaderCircle className="size-5 animate-spin" /></div>}
            {failed && <div className="px-3 py-4 text-sm text-rose-600">{t("common.error")}</div>}
            {cases?.map((sample) => {
              const text = sample.locale[language] ?? sample.locale.en;
              const Icon = sample.image ? IMAGE_ICONS[sample.image.region] ?? ScanLine : Stethoscope;
              return (
                <button
                  key={sample.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onLoad(sample);
                  }}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-100"
                >
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border ${sample.image ? "border-sky-200 bg-sky-50 text-sky-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{text.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {t("patient.ageYears", { n: sample.age })} · {t(`analyze.sexes.${sample.sex}`)} · {sample.image ? t("intake.samples.withImage") : t("intake.noImage")}
                    </span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Shown after a sample is loaded: what the presenter should expect to see. */
export function SampleBanner({ sample, onClose }: { sample: SampleCase; onClose: () => void }) {
  const { t, language } = useI18n();
  const text = sample.locale[language] ?? sample.locale.en;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{t("intake.samples.loaded", { title: text.title })}</span>
        <p className="mt-0.5 text-emerald-800/90">{t("intake.samples.expected")}: {text.expected}</p>
      </div>
      <button type="button" onClick={onClose} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100" aria-label={t("common.close")}>
        <X className="size-4" />
      </button>
    </motion.div>
  );
}
