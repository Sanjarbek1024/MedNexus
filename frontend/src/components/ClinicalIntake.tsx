import { motion } from "framer-motion";
import { Plus, TriangleAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import type { ClinicalData, Consciousness, Vitals } from "../lib/api";
import { HISTORY_CODES, isKnownHistory, isKnownSymptom, RED_FLAG_SYMPTOMS, SYMPTOM_GROUPS } from "../lib/clinical";

/** Accepts a patch or a function of the current intake (safe for quick successive clicks). */
export type Update = (patch: Partial<ClinicalData> | ((current: ClinicalData) => Partial<ClinicalData>)) => void;

/** Label for a symptom or history code; free-text entries are shown as typed. */
export function useClinicalLabels() {
  const { t } = useI18n();
  return {
    symptom: (code: string) => (isKnownSymptom(code) ? t(`intake.symptomCodes.${code}`) : code),
    history: (code: string) => (isKnownHistory(code) ? t(`intake.historyCodes.${code}`) : code),
  };
}

export function IntakeSection({ n, title, hint, children, delay = 0 }: { n: number; title: string; hint?: string; children: ReactNode; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="card p-5 sm:p-6"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-xs font-semibold text-canvas">{n}</span>
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="eyebrow pl-1">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5 pl-1">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(value === option.id ? ("" as T) : option.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              value === option.id ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-slate-600 hover:border-slate-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ComplaintFields({ data, update, hpi, onHpi }: { data: ClinicalData; update: Update; hpi: string; onHpi: (value: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("intake.chiefComplaint")}>
        <input
          className="field text-[15px]"
          value={data.chief_complaint}
          maxLength={300}
          placeholder={t("intake.chiefPlaceholder")}
          onChange={(e) => update({ chief_complaint: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.2fr]">
        <Choice
          label={t("intake.onset")}
          value={data.onset}
          onChange={(onset) => update({ onset })}
          options={(["sudden", "gradual"] as const).map((id) => ({ id, label: t(`intake.onsets.${id}`) }))}
        />
        <Field label={t("intake.duration")}>
          <input className="field" value={data.duration} maxLength={60} placeholder={t("intake.durationPlaceholder")} onChange={(e) => update({ duration: e.target.value })} />
        </Field>
        <Choice
          label={t("intake.severity")}
          value={data.severity}
          onChange={(severity) => update({ severity })}
          options={(["mild", "moderate", "severe"] as const).map((id) => ({ id, label: t(`intake.severities.${id}`) }))}
        />
      </div>
      <Field label={t("intake.hpi")}>
        <textarea
          className="field min-h-24 resize-y leading-relaxed"
          value={hpi}
          maxLength={2000}
          placeholder={t("intake.hpiPlaceholder")}
          onChange={(e) => onHpi(e.target.value)}
        />
      </Field>
    </div>
  );
}

function Chip({ active, onClick, children, flag = false }: { active: boolean; onClick: () => void; children: ReactNode; flag?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition ${
        active
          ? flag ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-500 bg-emerald-50 text-emerald-800"
          : "border-line bg-surface text-slate-600 hover:border-slate-300 hover:text-ink"
      }`}
    >
      {flag && <TriangleAlert className={`size-3 ${active ? "text-rose-500" : "text-slate-400"}`} />}
      {children}
    </button>
  );
}

function CustomEntries({ items, known, onRemove, onAdd, placeholder }: {
  items: string[];
  known: (code: string) => boolean;
  onRemove: (item: string) => void;
  onAdd: (item: string) => void;
  placeholder: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const custom = items.filter((item) => !known(item));
  const add = () => {
    if (draft.trim()) onAdd(draft.trim());
    setDraft("");
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {custom.map((item) => (
        <span key={item} className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-emerald-50 py-1 pr-1 pl-2.5 text-[13px] font-medium text-emerald-800">
          {item}
          <button type="button" onClick={() => onRemove(item)} className="rounded p-0.5 hover:bg-emerald-100" aria-label={`${t("common.close")} ${item}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          className="field h-8 w-48 py-1 text-[13px]"
          value={draft}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className="btn-ghost h-8 px-2.5 py-1 text-[13px]" aria-label={t("intake.add")}>
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

const toggle = (items: string[], code: string) => (items.includes(code) ? items.filter((i) => i !== code) : [...items, code]);

export function SymptomFields({ data, update }: { data: ClinicalData; update: Update }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        {SYMPTOM_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="eyebrow mb-2 pl-1">{t(`intake.symptomGroups.${group.id}`)}</div>
            <div className="flex flex-wrap gap-1.5">
              {group.codes.map((code) => (
                <Chip key={code} active={data.symptoms.includes(code)} flag={RED_FLAG_SYMPTOMS.has(code)} onClick={() => update((c) => ({ symptoms: toggle(c.symptoms, code) }))}>
                  {t(`intake.symptomCodes.${code}`)}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <CustomEntries
        items={data.symptoms}
        known={isKnownSymptom}
        placeholder={t("intake.otherSymptom")}
        onAdd={(item) => update((c) => ({ symptoms: c.symptoms.includes(item) ? c.symptoms : [...c.symptoms, item] }))}
        onRemove={(item) => update((c) => ({ symptoms: c.symptoms.filter((s) => s !== item) }))}
      />
    </div>
  );
}

// Normal adult ranges; values outside are highlighted as the physician types.
const RANGES: Record<string, [number, number]> = {
  temperature: [36.1, 38.0], heart_rate: [51, 100], resp_rate: [12, 20], systolic: [100, 179], diastolic: [60, 109], spo2: [94, 100],
};

function VitalInput({ name, label, unit, value, onChange, step = 1, min, max }: {
  name: keyof Vitals;
  label: string;
  unit: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min: number;
  max: number;
}) {
  const range = RANGES[name];
  const abnormal = value !== null && range && (value < range[0] || value > range[1]);
  return (
    <label className="block">
      <span className="eyebrow pl-1">{label}</span>
      <div className={`mt-1.5 flex items-center rounded-xl border bg-surface transition focus-within:ring-4 ${
        abnormal ? "border-rose-300 focus-within:ring-rose-100" : "border-slate-200 focus-within:border-emerald-500 focus-within:ring-emerald-100"
      }`}>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => {
            const parsed = e.target.value === "" ? null : Number(e.target.value);
            onChange(parsed === null || Number.isNaN(parsed) ? null : parsed);
          }}
          className={`w-full min-w-0 bg-transparent px-3 py-2 font-mono text-[15px] focus:outline-none ${abnormal ? "text-rose-700" : "text-ink"}`}
        />
        <span className="shrink-0 pr-3 font-mono text-[11px] text-slate-400">{unit}</span>
      </div>
    </label>
  );
}

export function VitalFields({ data, update }: { data: ClinicalData; update: Update }) {
  const { t } = useI18n();
  const vitals = data.vitals;
  const set = (patch: Partial<Vitals>) => update((c) => ({ vitals: { ...c.vitals, ...patch } }));
  const bounded = (value: number | null, min: number, max: number) => (value === null || value < min || value > max ? null : value);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <VitalInput name="temperature" label={t("intake.vitalsLabels.temperature")} unit="°C" step={0.1} min={25} max={45} value={vitals.temperature} onChange={(v) => set({ temperature: bounded(v, 25, 45) })} />
        <VitalInput name="heart_rate" label={t("intake.vitalsLabels.heart_rate")} unit="/min" min={20} max={250} value={vitals.heart_rate} onChange={(v) => set({ heart_rate: bounded(v, 20, 250) })} />
        <VitalInput name="resp_rate" label={t("intake.vitalsLabels.resp_rate")} unit="/min" min={4} max={80} value={vitals.resp_rate} onChange={(v) => set({ resp_rate: bounded(v, 4, 80) })} />
        <VitalInput name="systolic" label={`${t("intake.vitalsLabels.bp")} ↑`} unit="mmHg" min={40} max={300} value={vitals.systolic} onChange={(v) => set({ systolic: bounded(v, 40, 300) })} />
        <VitalInput name="diastolic" label={`${t("intake.vitalsLabels.bp")} ↓`} unit="mmHg" min={20} max={200} value={vitals.diastolic} onChange={(v) => set({ diastolic: bounded(v, 20, 200) })} />
        <VitalInput name="spo2" label={t("intake.vitalsLabels.spo2")} unit="%" min={50} max={100} value={vitals.spo2} onChange={(v) => set({ spo2: bounded(v, 50, 100) })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="eyebrow pl-1">{t("intake.vitalsLabels.consciousness")}</span>
          <select className="field mt-1.5" value={vitals.consciousness} onChange={(e) => set({ consciousness: e.target.value as Consciousness })}>
            {(["alert", "confused", "voice", "pain", "unresponsive"] as const).map((id) => (
              <option key={id} value={id}>{t(`intake.consciousness.${id}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={vitals.on_oxygen} onChange={(e) => set({ on_oxygen: e.target.checked })} className="size-4 accent-emerald-600" />
          {t("intake.vitalsLabels.on_oxygen")}
        </label>
      </div>
    </div>
  );
}

export function HistoryFields({ data, update }: { data: ClinicalData; update: Update }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {HISTORY_CODES.map((code) => (
          <Chip key={code} active={data.history.includes(code)} onClick={() => update((c) => ({ history: toggle(c.history, code) }))}>
            {t(`intake.historyCodes.${code}`)}
          </Chip>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("intake.medications")}>
          <input className="field" value={data.medications} maxLength={1000} onChange={(e) => update({ medications: e.target.value })} />
        </Field>
        <Field label={t("intake.allergies")}>
          <input className="field" value={data.allergies} maxLength={300} onChange={(e) => update({ allergies: e.target.value })} />
        </Field>
      </div>
      <Choice
        label={t("intake.smoking")}
        value={data.smoking}
        onChange={(smoking) => update({ smoking })}
        options={(["never", "former", "current"] as const).map((id) => ({ id, label: t(`intake.smokingLevels.${id}`) }))}
      />
    </div>
  );
}

export function ExamFields({ data, update }: { data: ClinicalData; update: Update }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t("intake.exam")}>
        <textarea className="field min-h-24 resize-y leading-relaxed" value={data.exam} maxLength={2000} placeholder={t("intake.examPlaceholder")} onChange={(e) => update({ exam: e.target.value })} />
      </Field>
      <Field label={t("intake.labs")}>
        <textarea className="field min-h-24 resize-y leading-relaxed" value={data.labs} maxLength={2000} placeholder={t("intake.labsPlaceholder")} onChange={(e) => update({ labs: e.target.value })} />
      </Field>
    </div>
  );
}
