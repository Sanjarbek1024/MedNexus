import { LoaderCircle, Upload } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { StudyFields, useStudyForm } from "./StudyForm";
import { Modal } from "./ui";
import { UploadZone } from "./UploadZone";

/** Several studies at once: queued for background analysis, they appear in the worklist. */
export function BatchForm({ onQueued }: { onQueued: () => void }) {
  const { t, finding } = useI18n();
  const toast = useToast();
  const form = useStudyForm();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const { state } = form;
      const result = await api.batch(files, {
        modality: state.modality, region: state.region, view: state.view, language: state.language,
        patient_id: state.patientId ?? undefined,
      });
      if (result.queued.length) toast(t("analyze.queued", { n: result.queued.length }));
      if (result.rejected.length) {
        toast(t("analyze.skipped", { n: result.rejected.length, reasons: result.rejected.map((r) => `${r.file}: ${finding(r.reason)}`).join("; ") }), "error");
      }
      setFiles([]);
      onQueued();
    } catch (e) {
      toast((e as ApiError).status === 0 ? t("common.offline") : (e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <UploadZone files={files} multiple onFiles={setFiles} compact />
      <div className="flex flex-col gap-4">
        <StudyFields form={form} showDate={false} />
        <button type="button" className="btn-primary py-3" disabled={!files.length || !form.supported || busy} onClick={submit}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {t("analyze.runBatch", { n: files.length })}
        </button>
      </div>
    </div>
  );
}

export function BatchUpload({ open, onClose, onQueued }: { open: boolean; onClose: () => void; onQueued: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t("worklist.batch")} subtitle={t("analyze.subtitle")} wide>
      <BatchForm
        onQueued={() => {
          onQueued();
          onClose();
        }}
      />
    </Modal>
  );
}
