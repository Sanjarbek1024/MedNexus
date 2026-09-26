import { motion } from "framer-motion";
import { Bone, Brain, Check, Stethoscope, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api, retryUntilLoaded, type Capabilities, type Language, type PatientSummary, type Sex } from "../lib/api";
import { Skeleton } from "./ui";
import { StudySelect } from "./StudySelect";

const firstSupported = <T extends { supported: boolean }>(items: T[]): T | undefined =>
  items.find((item) => item.supported) ?? items[0];

export interface StudyState {
  modality: string;
  region: string;
  view: string;
  language: Language;
  patientId: number | null;
  acquiredOn: string;
  symptoms: string;
  age: string;
  sex: Sex | "";
}

export const SYMPTOMS_MAX = 2000;

interface Preset { id: string; icon: LucideIcon; modality: string; region: string; view: string }

/** Simple study choices for people analyzing their own image. */
const PRESETS: Preset[] = [
  { id: "chest", icon: Stethoscope, modality: "xray", region: "chest", view: "PA" },
  { id: "extremity", icon: Bone, modality: "xray", region: "extremity", view: "PA" },
  { id: "brain", icon: Brain, modality: "mri", region: "head", view: "Axial" },
];

/** The supported study a preset maps to, or null when the backend cannot analyze it yet. */
function presetTarget(capabilities: Capabilities, preset: Preset) {
  const region = capabilities.modalities.find((m) => m.id === preset.modality)?.regions.find((r) => r.id === preset.region);
  const view = region?.views.find((v) => v.id === preset.view && v.supported) ?? region?.views.find((v) => v.supported);
  return region && view ? { modality: preset.modality, region: region.id, view: view.id } : null;
}

export function useStudyForm({ loadPatients = true }: { loadPatients?: boolean } = {}) {
  const { language } = useI18n();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [state, setState] = useState<StudyState>({
    modality: "", region: "", view: "", language, patientId: null, acquiredOn: "", symptoms: "", age: "", sex: "",
  });

  useEffect(
    () =>
      retryUntilLoaded(
        api.capabilities,
        (caps) => {
          setWaiting(false);
          setCapabilities(caps);
          const m = firstSupported(caps.modalities)!;
          const r = firstSupported(m.regions)!;
          setState((s) => ({ ...s, modality: m.id, region: r.id, view: firstSupported(r.views)!.id }));
        },
        () => setWaiting(true),
      ),
    [],
  );
  useEffect(() => {
    if (loadPatients) api.patients(1).then(setPatients, () => undefined);
  }, [loadPatients]);

  const modality = capabilities?.modalities.find((m) => m.id === state.modality);
  const region = modality?.regions.find((r) => r.id === state.region);
  const view = region?.views.find((v) => v.id === state.view);

  const update = (patch: Partial<StudyState>) => setState((s) => ({ ...s, ...patch }));
  const chooseModality = (id: string) => {
    const m = capabilities!.modalities.find((item) => item.id === id)!;
    const r = firstSupported(m.regions)!;
    update({ modality: id, region: r.id, view: firstSupported(r.views)!.id });
  };
  const chooseRegion = (id: string) => {
    const r = modality!.regions.find((item) => item.id === id)!;
    update({ region: id, view: firstSupported(r.views)!.id });
  };

  const presets = capabilities
    ? PRESETS.map((preset) => ({ ...preset, target: presetTarget(capabilities, preset) }))
    : [];
  const preset = presets.find((p) => p.target && p.target.modality === state.modality && p.target.region === state.region)?.id ?? null;

  /** Optional patient context sent with the study (symptoms, age, sex). */
  const context = () => {
    const age = Number.parseInt(state.age, 10);
    return {
      symptoms: state.symptoms.trim() || undefined,
      age: Number.isFinite(age) && age >= 0 && age <= 120 ? age : undefined,
      sex: state.sex || undefined,
    };
  };

  return {
    capabilities, patients, waiting, state, update, chooseModality, chooseRegion,
    modality, region, view, supported: Boolean(view?.supported), presets, preset, context,
  };
}

export type StudyForm = ReturnType<typeof useStudyForm>;

export function StudyFields({ form, showDate = true }: { form: StudyForm; showDate?: boolean }) {
  const { t, taxonomy, analyzer } = useI18n();
  const { capabilities, modality, region, state, update } = form;

  if (!capabilities || !modality || !region) {
    return <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  }
  const localized = <T extends { id: string; label: string; supported: boolean }>(items: T[]) =>
    items.map((item) => ({ ...item, label: taxonomy(item.id) }));

  return (
    <div className="flex flex-col gap-4">
      <StudySelect label={t("analyze.modality")} value={state.modality} options={localized(capabilities.modalities)} onChange={form.chooseModality} />
      <StudySelect label={t("analyze.region")} value={state.region} options={localized(modality.regions)} onChange={form.chooseRegion} />
      <StudySelect label={t("analyze.view")} value={state.view} options={localized(region.views)} onChange={(view) => update({ view })} />
      <div className={`grid gap-3 ${showDate ? "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" : ""}`}>
        <label className="block">
          <span className="eyebrow pl-1">{t("analyze.patient")}</span>
          <select
            className="field mt-1.5"
            value={state.patientId ?? ""}
            onChange={(e) => update({ patientId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t("analyze.newPatient")}</option>
            {form.patients.map((p) => (
              <option key={p.id} value={p.id}>{p.pseudonym} ({p.case_count})</option>
            ))}
          </select>
        </label>
        {showDate && (
          <label className="block">
            <span className="eyebrow pl-1">{t("analyze.studyDate")}</span>
            <input type="date" className="field mt-1.5" value={state.acquiredOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => update({ acquiredOn: e.target.value })} />
          </label>
        )}
      </div>
      <p className="-mt-2 pl-1 text-xs text-slate-400">{t("analyze.patientHint")}</p>
      <div>
        <div className="eyebrow mb-1.5 pl-1">{t("analyze.reportLanguage")}</div>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100/80 p-1">
          {capabilities.languages.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => update({ language: lang.id })}
              aria-pressed={state.language === lang.id}
              className={`relative rounded-xl py-2 text-sm font-semibold transition ${state.language === lang.id ? "text-emerald-800" : "text-slate-500 hover:text-slate-700"}`}
            >
              {state.language === lang.id && <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-xl bg-white shadow-sm ring-1 ring-emerald-200" />}
              <span className="relative">{lang.label}</span>
            </button>
          ))}
        </div>
      </div>
      {form.view && form.view.analyzers.length > 0 && (
        <div className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
          <div className="eyebrow text-emerald-700/70">{t("analyze.pipeline")}</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {form.view.analyzers.map((name) => (
              <li key={name} className="flex items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-emerald-400" /> {analyzer(name)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Symptoms, age and sex: optional context for the AI assessment. */
export function SymptomFields({ form }: { form: StudyForm }) {
  const { t } = useI18n();
  const { state, update } = form;
  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="flex items-baseline justify-between gap-2 pl-1">
          <span className="eyebrow">{t("analyze.symptoms")}</span>
          <span className={`text-[11px] tabular-nums ${state.symptoms.length > SYMPTOMS_MAX * 0.9 ? "text-amber-600" : "text-slate-400"}`}>
            {state.symptoms.length}/{SYMPTOMS_MAX}
          </span>
        </span>
        <textarea
          className="field mt-1.5 min-h-24 resize-y leading-relaxed"
          value={state.symptoms}
          maxLength={SYMPTOMS_MAX}
          placeholder={t("analyze.symptomsPlaceholder")}
          onChange={(e) => update({ symptoms: e.target.value })}
        />
        <span className="mt-1 block pl-1 text-xs text-slate-400">{t("analyze.symptomsHint")}</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="eyebrow pl-1">{t("analyze.age")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={120}
            className="field mt-1.5"
            value={state.age}
            onChange={(e) => update({ age: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })}
          />
        </label>
        <label className="block">
          <span className="eyebrow pl-1">{t("analyze.sex")}</span>
          <select className="field mt-1.5" value={state.sex} onChange={(e) => update({ sex: e.target.value as Sex | "" })}>
            <option value="">{t("analyze.sexUnset")}</option>
            <option value="male">{t("analyze.sexes.male")}</option>
            <option value="female">{t("analyze.sexes.female")}</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/** Plain-language study picker for people analyzing their own image. */
export function StudyPresets({ form }: { form: StudyForm }) {
  const { t } = useI18n();
  if (!form.capabilities) {
    return <div className="grid grid-cols-1 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  }
  return (
    <div role="radiogroup" aria-label={t("analyze.studyType")} className="grid grid-cols-1 gap-2">
      {form.presets.map(({ id, icon: Icon, target }) => {
        const active = form.preset === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!target}
            onClick={() => target && form.update({ ...target })}
            className={`relative flex items-start gap-3 rounded-2xl border p-3 pr-8 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
              active ? "border-emerald-400 bg-emerald-50/80 ring-4 ring-emerald-100" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition ${active ? "bg-emerald-500 text-white shadow-glow" : "bg-slate-100 text-slate-500"}`}>
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug font-bold text-ink">{t(`analyze.presets.${id}.title`)}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {target ? t(`analyze.presets.${id}.text`) : t("analyze.presetUnavailable")}
              </span>
            </span>
            {active && <Check className="absolute top-3 right-3 size-4 text-emerald-600" />}
          </button>
        );
      })}
    </div>
  );
}
