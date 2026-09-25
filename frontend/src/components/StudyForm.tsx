import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { api, retryUntilLoaded, type Capabilities, type Language, type PatientSummary } from "../lib/api";
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
}

export function useStudyForm() {
  const { language } = useI18n();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [state, setState] = useState<StudyState>({
    modality: "", region: "", view: "", language, patientId: null, acquiredOn: "",
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
    api.patients(1).then(setPatients, () => undefined);
  }, []);

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

  return {
    capabilities, patients, waiting, state, update, chooseModality, chooseRegion,
    modality, region, view, supported: Boolean(view?.supported),
  };
}

export type StudyForm = ReturnType<typeof useStudyForm>;

export function StudyFields({ form, showDate = true }: { form: StudyForm; showDate?: boolean }) {
  const { t, taxonomy } = useI18n();
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
      <div className={`grid gap-3 ${showDate ? "sm:grid-cols-2" : ""}`}>
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
              <li key={name} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" /> {name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
