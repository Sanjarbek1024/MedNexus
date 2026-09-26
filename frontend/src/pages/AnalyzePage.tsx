import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleAlert, ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ScanningImage, StepList } from "../components/AnalysisProgress";
import { BatchForm } from "../components/BatchUpload";
import { ComplaintFields, ExamFields, HistoryFields, IntakeSection, SymptomFields, VitalFields, type Update } from "../components/ClinicalIntake";
import { RulesView } from "../components/ClinicalPanels";
import { StudyFields, useStudyForm } from "../components/StudyForm";
import { PageHeader, Segmented } from "../components/ui";
import { UploadZone } from "../components/UploadZone";
import { useI18n } from "../i18n";
import { api, ApiError, type ClinicalData, type ClinicalRules, type Sex, type Stage } from "../lib/api";
import { emptyClinical, hasIntake, hasVitals } from "../lib/clinical";
import { navigate } from "../lib/router";
import { rememberCase } from "./CasePage";

function PatientFields({ form }: { form: ReturnType<typeof useStudyForm> }) {
  const { t } = useI18n();
  const { state, update } = form;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block">
        <span className="eyebrow pl-1">{t("analyze.age")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={120}
          className="field mt-1.5 font-mono"
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
      <label className="block">
        <span className="eyebrow pl-1">{t("analyze.patient")}</span>
        <select className="field mt-1.5" value={state.patientId ?? ""} onChange={(e) => update({ patientId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t("analyze.newPatient")}</option>
          {form.patients.map((p) => <option key={p.id} value={p.id}>{p.pseudonym} ({p.case_count})</option>)}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow pl-1">{t("analyze.reportLanguage")}</span>
        <select className="field mt-1.5" value={state.language} onChange={(e) => update({ language: e.target.value as typeof state.language })}>
          <option value="uz">O‘zbekcha</option>
          <option value="en">English</option>
          <option value="ru">Русский</option>
        </select>
      </label>
    </div>
  );
}

/** Debounced rules-engine preview while the intake is being filled in. */
function useLiveRules(clinical: ClinicalData, age: string) {
  const [rules, setRules] = useState<ClinicalRules | null>(null);
  useEffect(() => {
    const parsed = Number.parseInt(age, 10);
    const timer = window.setTimeout(() => {
      api.evaluateRules(clinical, Number.isFinite(parsed) && parsed <= 120 ? parsed : undefined).then(setRules, () => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [clinical, age]);
  return rules;
}

const PLAN = ["rules", "imaging", "vision", "reasoner", "critic", "guardrails"] as const;

export function AnalyzePage() {
  const { t } = useI18n();
  const form = useStudyForm();
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [clinical, setClinical] = useState<ClinicalData>(emptyClinical);
  const [hpi, setHpi] = useState("");
  const [imaging, setImaging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rules = useLiveRules(clinical, form.state.age);
  const update: Update = (patch) => setClinical((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const chooseFile = ([next]: File[]) => {
    setError(null);
    setFile(next ?? null);
    const raster = next && (/\.(png|jpe?g)$/i.test(next.name) || /^image\/(png|jpeg)$/.test(next.type));
    setPreview(raster ? URL.createObjectURL(next) : null);
  };

  const ready = (hasIntake(clinical) || hpi.trim().length > 0 || Boolean(file)) && (!file || form.supported);
  const withImage = Boolean(file);

  const analyze = async () => {
    if (!ready) {
      setError(t("intake.needComplaint"));
      return;
    }
    const { state } = form;
    const context = form.context();
    setError(null);
    setStages([]);
    try {
      const result = await api.analyze(
        file,
        {
          ...(file ? { modality: state.modality, region: state.region, view: state.view } : {}),
          language: state.language,
          patient_id: state.patientId ?? undefined,
          acquired_on: file ? state.acquiredOn || undefined : undefined,
          symptoms: hpi.trim() || undefined,
          age: context.age,
          sex: context.sex,
          clinical: hasIntake(clinical) || hasVitals(clinical) ? clinical : undefined,
        },
        (stage) => setStages((previous) => [...(previous ?? []), stage]),
      );
      rememberCase(result);
      navigate(`/cases/${result.case_id}`);
    } catch (e) {
      setError((e as ApiError).status === 0 ? t("common.offline") : (e as Error).message);
      setStages(null);
    }
  };

  if (stages) {
    return withImage ? (
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ScanningImage preview={preview} />
        <StepList reached={stages} />
      </div>
    ) : (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <StepList reached={stages} clinical />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-24 sm:px-6">
      <PageHeader
        eyebrow={t("nav.analyze")}
        title={t("intake.title")}
        subtitle={t("intake.subtitle")}
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            label="mode"
            options={[{ id: "single", label: t("intake.title") }, { id: "batch", label: t("intake.batch") }]}
          />
        }
      />

      {form.waiting && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
          <CircleAlert className="size-5 shrink-0" /> {t("common.waitingServer")}
        </div>
      )}

      {mode === "batch" ? (
        <BatchForm onQueued={() => navigate("/worklist")} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <IntakeSection n={1} title={t("intake.sections.patient")}>
              <PatientFields form={form} />
            </IntakeSection>
            <IntakeSection n={2} title={t("intake.sections.complaint")} delay={0.03}>
              <ComplaintFields data={clinical} update={update} hpi={hpi} onHpi={setHpi} />
            </IntakeSection>
            <IntakeSection n={3} title={t("intake.sections.symptoms")} hint={t("intake.hints.symptoms")} delay={0.06}>
              <SymptomFields data={clinical} update={update} />
            </IntakeSection>
            <IntakeSection n={4} title={t("intake.sections.vitals")} hint={t("intake.hints.vitals")} delay={0.09}>
              <VitalFields data={clinical} update={update} />
            </IntakeSection>
            <IntakeSection n={5} title={t("intake.sections.history")} delay={0.12}>
              <HistoryFields data={clinical} update={update} />
            </IntakeSection>
            <IntakeSection n={6} title={t("intake.sections.exam")} delay={0.15}>
              <ExamFields data={clinical} update={update} />
            </IntakeSection>

            <section className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setImaging(!imaging)}
                aria-expanded={imaging}
                className="flex w-full items-start gap-3 p-5 text-left sm:p-6"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 font-mono text-xs font-semibold text-slate-500">7</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{t("intake.sections.imaging")}</span>
                  <span className="mt-0.5 block text-sm text-slate-500">{t("intake.hints.imaging")}</span>
                </span>
                {file ? (
                  <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><ImagePlus className="size-3" /> {file.name.slice(0, 18)}</span>
                ) : (
                  <ChevronDown className={`mt-1 size-5 shrink-0 text-slate-400 transition ${imaging ? "rotate-180" : ""}`} />
                )}
              </button>
              <AnimatePresence initial={false}>
                {imaging && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="grid gap-5 border-t border-line p-5 sm:p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <UploadZone files={file ? [file] : []} preview={preview} onFiles={chooseFile} />
                        {file && (
                          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => chooseFile([])}>
                            <X className="size-3.5" /> {file.name}
                          </button>
                        )}
                      </div>
                      <StudyFields form={form} showPatient={false} showLanguage={false} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-ink">{t("intake.liveTriage")}</div>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
              </div>
              <p className="mt-0.5 mb-4 text-xs text-slate-500">{t("intake.liveTriageHint")}</p>
              {rules ? <RulesView rules={rules} compact /> : <p className="text-sm text-slate-400">{t("intake.noVitals")}</p>}
            </div>

            <div className="card p-5">
              <div className="eyebrow mb-3">{t("intake.willRun")}</div>
              <ol className="space-y-2">
                {PLAN.map((step, i) => {
                  const skipped = !withImage && (step === "imaging" || step === "vision");
                  return (
                    <li key={step} className={`flex items-center gap-2.5 text-[13px] ${skipped ? "text-slate-300 line-through" : "text-slate-700"}`}>
                      <span className={`flex size-5 items-center justify-center rounded-md font-mono text-[10px] ${skipped ? "bg-slate-50 text-slate-300" : "bg-emerald-50 text-emerald-700"}`}>{i + 1}</span>
                      {t(`pipeline.steps.${step}`)}
                    </li>
                  );
                })}
              </ol>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
                <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
              </div>
            )}
            <motion.button
              type="button"
              onClick={analyze}
              whileHover={ready ? { scale: 1.02 } : undefined}
              whileTap={ready ? { scale: 0.98 } : undefined}
              className={`btn-primary h-12 w-full rounded-xl text-[15px] ${ready ? "" : "opacity-60 shadow-none"}`}
            >
              <Sparkles className="size-5" /> {withImage ? t("intake.runWithImage") : t("intake.run")}
            </motion.button>
          </aside>
        </div>
      )}
    </div>
  );
}
