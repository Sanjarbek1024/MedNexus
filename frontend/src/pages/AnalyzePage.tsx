import { motion } from "framer-motion";
import { CircleAlert, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { ScanningImage, StepList } from "../components/AnalysisProgress";
import { BatchForm } from "../components/BatchUpload";
import { StudyFields, useStudyForm } from "../components/StudyForm";
import { PageHeader, Segmented } from "../components/ui";
import { UploadZone } from "../components/UploadZone";
import { useI18n } from "../i18n";
import { api, ApiError, type Stage } from "../lib/api";
import { navigate } from "../lib/router";
import { rememberCase } from "./CasePage";

export function AnalyzePage() {
  const { t } = useI18n();
  const form = useStudyForm();
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
          modality: state.modality, region: state.region, view: state.view, language: state.language,
          patient_id: state.patientId ?? undefined, acquired_on: state.acquiredOn || undefined,
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
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
        <ScanningImage preview={preview} />
        <StepList reached={stages} />
      </div>
    );
  }

  const ready = Boolean(file && form.supported);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 pb-36 sm:px-6">
      <PageHeader
        eyebrow={t("nav.analyze")}
        title={t("analyze.title")}
        subtitle={t("analyze.subtitle")}
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            label="mode"
            options={[{ id: "single", label: t("analyze.single") }, { id: "batch", label: t("analyze.batch") }]}
          />
        }
      />

      {(error || form.waiting) && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
          <CircleAlert className="size-5 shrink-0" /> {error ?? t("common.waitingServer")}
        </div>
      )}

      {mode === "batch" ? (
        <BatchForm onQueued={() => navigate("/worklist")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <UploadZone files={file ? [file] : []} preview={preview} onFiles={chooseFile} />
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
            <div className="mb-5">
              <div className="text-lg font-bold text-ink">{t("analyze.details")}</div>
              <p className="text-sm text-slate-500">{t("analyze.detailsHint")}</p>
            </div>
            <StudyFields form={form} />
          </motion.div>
        </div>
      )}

      {mode === "single" && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-8 z-30 flex justify-center lg:pl-[248px]">
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
