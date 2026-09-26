import { motion } from "framer-motion";
import { CircleAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { ScanningImage, StepList } from "../components/AnalysisProgress";
import { BatchForm } from "../components/BatchUpload";
import { StudyFields, StudyPresets, SymptomFields, useStudyForm } from "../components/StudyForm";
import { PageHeader, Segmented } from "../components/ui";
import { UploadZone } from "../components/UploadZone";
import { useI18n } from "../i18n";
import { api, ApiError, type Stage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { navigate } from "../lib/router";
import { rememberCase } from "./CasePage";

export function AnalyzePage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const doctor = user?.role === "doctor";
  const form = useStudyForm({ loadPatients: doctor });
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const chooseFile = ([next]: File[]) => {
    setError(null);
    setFile(next ?? null);
    const raster = next && (/\.(png|jpe?g)$/i.test(next.name) || /^image\/(png|jpeg)$/.test(next.type));
    setPreview(raster ? URL.createObjectURL(next) : null);
  };

  const analyze = async () => {
    if (!file) return;
    const { state } = form;
    setError(null);
    setStages([]);
    try {
      const result = await api.analyze(
        file,
        {
          modality: state.modality, region: state.region, view: state.view,
          // People get their explanation in the language they are reading the app in.
          language: doctor ? state.language : language,
          patient_id: doctor ? (state.patientId ?? undefined) : undefined,
          acquired_on: state.acquiredOn || undefined,
          ...form.context(),
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
    return (
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ScanningImage preview={preview} />
        <StepList reached={stages} patient={!doctor} />
      </div>
    );
  }

  const ready = Boolean(file && form.supported);
  const batch = doctor && mode === "batch";
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 pb-36 sm:px-6">
      <PageHeader
        eyebrow={t("nav.analyze")}
        title={doctor ? t("analyze.title") : t("analyze.userTitle")}
        subtitle={doctor ? t("analyze.subtitle") : t("analyze.userSubtitle")}
        actions={
          doctor && (
            <Segmented
              value={mode}
              onChange={setMode}
              label="mode"
              options={[{ id: "single", label: t("analyze.single") }, { id: "batch", label: t("analyze.batch") }]}
            />
          )
        }
      />

      {(error || form.waiting) && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
          <CircleAlert className="size-5 shrink-0" /> {error ?? t("common.waitingServer")}
        </div>
      )}

      {batch ? (
        <BatchForm onQueued={() => navigate("/worklist")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <UploadZone files={file ? [file] : []} preview={preview} onFiles={chooseFile} />
            {!doctor && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {t("patient.disclaimer")}
              </div>
            )}
          </div>
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
              <div className="mb-5">
                <div className="text-lg font-bold text-ink">{doctor ? t("analyze.details") : t("analyze.studyType")}</div>
                {doctor && <p className="text-sm text-slate-500">{t("analyze.detailsHint")}</p>}
              </div>
              {doctor ? <StudyFields form={form} /> : <StudyPresets form={form} />}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="card p-6">
              <div className="mb-4 text-lg font-bold text-ink">{doctor ? t("assessment.symptoms") : t("analyze.aboutYou")}</div>
              <SymptomFields form={form} />
            </motion.div>
          </div>
        </div>
      )}

      {!batch && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-8 z-30 flex justify-center px-4 lg:pl-[248px]">
          <motion.button
            type="button"
            onClick={analyze}
            disabled={!ready}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={ready ? { scale: 1.03 } : undefined}
            whileTap={ready ? { scale: 0.97 } : undefined}
            className="btn-primary pointer-events-auto rounded-full px-8 py-4 text-base disabled:shadow-none"
          >
            <Sparkles className="size-5" /> {file ? t("analyze.run") : t("analyze.choose")}
          </motion.button>
        </div>
      )}
    </div>
  );
}
