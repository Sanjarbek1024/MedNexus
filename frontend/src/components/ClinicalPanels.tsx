import { motion } from "framer-motion";
import {
  Activity,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Cpu,
  Eye,
  Gauge,
  ImagePlus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import { api, ApiError, type AnalysisResult, type ClinicalData, type ClinicalRules, type PipelineStep, type Stage } from "../lib/api";
import { useToast } from "../lib/toast";
import { StepList } from "./AnalysisProgress";
import { useClinicalLabels } from "./ClinicalIntake";
import { StudyFields, useStudyForm } from "./StudyForm";
import { UploadZone } from "./UploadZone";

const BAND_STYLE = {
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  high: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

const URGENCY_STYLE = {
  routine: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  soon: "bg-amber-50 text-amber-700 ring-amber-200",
  urgent: "bg-rose-50 text-rose-700 ring-rose-200",
} as const;

/** Scores and red flags from the deterministic rules engine. `compact` is the live preview. */
export function RulesView({ rules, compact = false }: { rules: ClinicalRules; compact?: boolean }) {
  const { t } = useI18n();
  const { symptom } = useClinicalLabels();
  const flagLabel = (code: string) =>
    code.startsWith("symptom_") ? t("rules.symptomFlag", { name: symptom(code.slice(8)) }) : t(`rules.flags.${code}`);
  return (
    <div className="space-y-3">
      {rules.scores.length > 0 ? (
        <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
          {rules.scores.map((score) => (
            <div key={score.name} className="rounded-xl border border-line bg-raised p-3">
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[11px] font-medium text-slate-500">{score.name}</span>
                <span className={`chip px-1.5 py-0 text-[10px] ring-1 ${BAND_STYLE[score.band]}`}>{t(`rules.bands.${score.band}`)}</span>
              </div>
              <div className="mt-1.5 font-mono text-2xl font-semibold text-ink tabular-nums">
                {Number.isInteger(score.value) ? score.value : score.value.toFixed(2)}
              </div>
              {score.partial && <div className="mt-0.5 font-mono text-[10px] text-slate-400">{t("rules.partial")}</div>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">{compact ? t("intake.noVitals") : t("rules.notEnough")}</p>
      )}
      {rules.flags.length > 0 ? (
        <ul className="space-y-1.5">
          {rules.flags.map((flag) => (
            <li
              key={flag.code}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${
                flag.severity === "critical" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              <TriangleAlert className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{flagLabel(flag.code)}</span>
              {flag.value && (
                <span className="shrink-0 font-mono text-[11px] opacity-80">
                  {flag.code === "altered_consciousness" ? t(`intake.consciousness.${flag.value}`) : flag.value}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        rules.scores.length > 0 && <p className="flex items-center gap-1.5 text-sm text-slate-500"><CircleCheck className="size-4 text-emerald-600" /> {t("rules.none")}</p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5 text-xs">
        <span className="text-slate-500">{t("rules.floor")}</span>
        <span className={`chip ring-1 ${URGENCY_STYLE[rules.urgency_floor]}`}>{t(`urgencyClinical.${rules.urgency_floor}`)}</span>
      </div>
    </div>
  );
}

export function RulesPanel({ rules }: { rules: ClinicalRules | null }) {
  const { t } = useI18n();
  if (!rules) return null;
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <div className="flex items-center gap-2">
        <Gauge className="size-5 text-slate-500" />
        <h2 className="font-semibold text-ink">{t("rules.title")}</h2>
        <span className="ml-auto rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-slate-500">no AI</span>
      </div>
      <p className="mt-1 mb-4 text-xs text-slate-500">{t("rules.subtitle")}</p>
      <RulesView rules={rules} />
    </motion.section>
  );
}

const STEP_ICONS: Record<string, LucideIcon> = {
  rules: Gauge, imaging: Activity, vision: Eye, reasoner: Sparkles, critic: ShieldCheck, guardrails: ShieldCheck,
};

/** The AI architecture that actually ran: one row per step with its model and timing. */
export function PipelineTrace({ steps, mode, notes = [] }: { steps: PipelineStep[]; mode?: "clinical" | "multimodal"; notes?: string[] }) {
  const { t } = useI18n();
  if (!steps.length) return null;
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <div className="flex items-center gap-2">
        <Cpu className="size-5 text-slate-500" />
        <h2 className="font-semibold text-ink">{t("pipeline.title")}</h2>
        {mode && <span className="chip ml-auto bg-slate-100 text-slate-600">{t(`pipeline.modes.${mode}`)}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">{t("pipeline.subtitle")}</p>
      <ol className="relative mt-4 space-y-0">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.id] ?? Cpu;
          const StatusIcon = step.status === "done" ? CircleCheck : step.status === "failed" ? CircleX : CircleDashed;
          return (
            <li key={`${step.id}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
              {i < steps.length - 1 && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-line" />}
              <span className={`relative flex size-8 shrink-0 items-center justify-center rounded-lg border ${
                step.status === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : step.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-line bg-raised text-slate-400"
              }`}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className={`text-sm font-semibold ${step.status === "skipped" ? "text-slate-400" : "text-ink"}`}>{t(`pipeline.steps.${step.id}`)}</span>
                  <StatusIcon className={`size-3.5 ${step.status === "done" ? "text-emerald-600" : step.status === "failed" ? "text-rose-500" : "text-slate-300"}`} />
                  <span className="text-[11px] text-slate-400">{t(`pipeline.status.${step.status}`)}</span>
                  {step.ms > 0 && <span className="ml-auto font-mono text-[11px] text-slate-400">{(step.ms / 1000).toFixed(1)} s</span>}
                </div>
                <div className="text-xs text-slate-500">{t(`pipeline.stepText.${step.id}`)}</div>
                {step.model && <div className="mt-0.5 truncate font-mono text-[10.5px] text-slate-400">{step.model}</div>}
                {step.id === "guardrails" && step.detail === "raised" && (
                  <div className="mt-1 text-xs font-medium text-amber-700">{t("pipeline.raised")}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {notes.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="eyebrow mb-1.5 text-amber-700">{t("pipeline.criticNotes")}</div>
          <ul className="space-y-1 text-[13px] text-amber-900">
            {notes.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </div>
      )}
    </motion.section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-800">{children}</dd>
    </div>
  );
}

/** Read-only summary of the structured intake on the case page. */
export function IntakeSummary({ result }: { result: AnalysisResult }) {
  const { t } = useI18n();
  const labels = useClinicalLabels();
  const data: ClinicalData | null = result.clinical;
  const v = data?.vitals;
  const vitals = v ? [
    v.temperature !== null && `${v.temperature.toFixed(1)} °C`,
    v.heart_rate !== null && `HR ${v.heart_rate}`,
    v.resp_rate !== null && `RR ${v.resp_rate}`,
    v.systolic !== null && `BP ${v.systolic}/${v.diastolic ?? "—"}`,
    v.spo2 !== null && `SpO₂ ${v.spo2}%${v.on_oxygen ? " O₂" : ""}`,
    v.consciousness !== "alert" && t(`intake.consciousness.${v.consciousness}`),
  ].filter(Boolean) as string[] : [];
  const demographics = [
    result.patient_age !== null ? t("patient.ageYears", { n: result.patient_age }) : null,
    result.patient_sex ? t(`analyze.sexes.${result.patient_sex}`) : null,
  ].filter(Boolean);

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-5 text-slate-500" />
        <h2 className="font-semibold text-ink">{t("imaging.intake")}</h2>
        {demographics.length > 0 && <span className="ml-auto text-xs text-slate-500">{demographics.join(" · ")}</span>}
      </div>
      {!data && !result.symptoms ? (
        <p className="mt-3 text-sm text-slate-400">{t("imaging.noIntake")}</p>
      ) : (
        <dl className="mt-2 divide-y divide-line">
          {data?.chief_complaint && (
            <Row label={t("intake.chiefComplaint")}>
              <span className="font-semibold text-ink">{data.chief_complaint}</span>
              {(data.onset || data.duration || data.severity) && (
                <span className="block text-xs text-slate-500">
                  {[data.onset && t(`intake.onsets.${data.onset}`), data.duration, data.severity && t(`intake.severities.${data.severity}`)].filter(Boolean).join(" · ")}
                </span>
              )}
            </Row>
          )}
          {data && data.symptoms.length > 0 && (
            <Row label={t("intake.sections.symptoms")}>
              <div className="flex flex-wrap gap-1">
                {data.symptoms.map((s) => <span key={s} className="chip bg-slate-100 text-slate-700">{labels.symptom(s)}</span>)}
              </div>
            </Row>
          )}
          {vitals.length > 0 && (
            <Row label={t("intake.sections.vitals")}><span className="font-mono text-[13px]">{vitals.join(" · ")}</span></Row>
          )}
          {result.symptoms && <Row label={t("intake.hpi")}><span className="whitespace-pre-line">{result.symptoms}</span></Row>}
          {data && (data.history.length > 0 || data.smoking) && (
            <Row label={t("intake.sections.history")}>
              {[...data.history.map(labels.history), data.smoking && `${t("intake.smoking")}: ${t(`intake.smokingLevels.${data.smoking}`)}`].filter(Boolean).join(", ")}
            </Row>
          )}
          {data?.medications && <Row label={t("intake.medications")}>{data.medications}</Row>}
          {data?.allergies && <Row label={t("intake.allergies")}>{data.allergies}</Row>}
          {data?.exam && <Row label={t("intake.exam")}><span className="whitespace-pre-line">{data.exam}</span></Row>}
          {data?.labs && <Row label={t("intake.labs")}><span className="whitespace-pre-line">{data.labs}</span></Row>}
        </dl>
      )}
    </motion.section>
  );
}

/** Upload an image into an existing clinical case; the differential is rebuilt with it. */
export function AddImagingCard({ result, onUpdate }: { result: AnalysisResult; onUpdate: (result: AnalysisResult) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const form = useStudyForm({ loadPatients: false });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const signed = result.status === "reviewed";

  const choose = ([next]: File[]) => {
    setFile(next ?? null);
    const raster = next && (/\.(png|jpe?g)$/i.test(next.name) || /^image\/(png|jpeg)$/.test(next.type));
    setPreview(raster ? URL.createObjectURL(next) : null);
  };
  const run = async () => {
    if (!file || !result.case_id) return;
    setStages([]);
    try {
      const { modality, region, view } = form.state;
      const updated = await api.attachImaging(result.case_id, file, { modality, region, view }, (stage) =>
        setStages((previous) => [...(previous ?? []), stage]),
      );
      onUpdate(updated);
    } catch (e) {
      toast((e as ApiError).status === 0 ? t("common.offline") : (e as Error).message, "error");
      setStages(null);
    }
  };

  if (stages) {
    return <StepList reached={stages} />;
  }
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line bg-raised p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-emerald-600"><ImagePlus className="size-5" /></span>
        <div>
          <h2 className="font-semibold text-ink">{t("imaging.addTitle")}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{t("imaging.addText")}</p>
        </div>
      </div>
      {!signed && (
        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <UploadZone files={file ? [file] : []} preview={preview} onFiles={choose} />
          <div className="space-y-4">
            <StudyFields form={form} showDate={false} showPatient={false} showLanguage={false} />
            <button type="button" className="btn-primary w-full" disabled={!file || !form.supported} onClick={run}>
              <ImagePlus className="size-4" /> {t("imaging.upload")}
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
}
