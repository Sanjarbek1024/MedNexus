import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, FileImage, Files, RotateCcw, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { useI18n } from "../i18n";

const ACCEPT = ".dcm,.dicom,.png,.jpg,.jpeg,image/png,image/jpeg,application/dicom";
export const MAX_BATCH = 20;

interface Props {
  files: File[];
  preview?: string | null;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  compact?: boolean;
}

export function UploadZone({ files, preview, multiple = false, onFiles, compact = false }: Props) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = Array.from(list);
    onFiles(multiple ? [...files, ...picked].slice(0, MAX_BATCH) : picked.slice(0, 1));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files);
  };

  const single = !multiple && files[0];

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`group relative flex ${compact ? "min-h-56" : "min-h-[26rem]"} flex-col items-center justify-center overflow-hidden rounded-[28px] transition ${
        dragging ? "bg-emerald-50/80" : "bg-white/60"
      } shadow-soft backdrop-blur-xl`}
    >
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        <rect
          x="1.5"
          y="1.5"
          style={{ width: "calc(100% - 3px)", height: "calc(100% - 3px)" }}
          rx="27"
          fill="none"
          strokeWidth="2"
          strokeDasharray="10 6"
          className={`animate-dash transition-colors ${dragging ? "stroke-emerald-500" : "stroke-emerald-300/80 group-hover:stroke-emerald-400"}`}
        />
      </svg>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = "";
        }}
        aria-label={multiple ? t("analyze.dropBatch") : t("analyze.drop")}
      />

      <AnimatePresence mode="wait">
        {single ? (
          <motion.div key={single.name + single.size} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{single.name}</div>
                <div className="text-xs text-slate-500">{(single.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>
                <RotateCcw className="size-4" /> {t("analyze.replace")}
              </button>
            </div>
            <div className="flex h-80 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-950">
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <FileImage className="size-12 text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-200">{t("analyze.dicomStudy")}</span>
                  <span className="text-xs">{t("analyze.dicomHint")}</span>
                </div>
              )}
            </div>
          </motion.div>
        ) : multiple && files.length ? (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Files className="size-4 text-emerald-600" /> {t("analyze.filesSelected", { n: files.length })}
              </span>
              <button type="button" className="btn-ghost py-1.5" onClick={() => input.current?.click()} disabled={files.length >= MAX_BATCH}>
                <CloudUpload className="size-4" /> {t("analyze.browse")}
              </button>
            </div>
            <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-sm ring-1 ring-slate-200/70">
                  <span className="truncate">{file.name}</span>
                  <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => onFiles(files.filter((_, j) => j !== i))} aria-label="×">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <motion.button key="empty" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => input.current?.click()} className="flex flex-col items-center gap-4 px-8 py-12 text-center">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow"
            >
              {multiple ? <Files className="size-9" /> : <CloudUpload className="size-9" />}
            </motion.div>
            <div>
              <div className="text-lg font-bold text-ink">{multiple ? t("analyze.dropBatch") : t("analyze.drop")}</div>
              <div className="mt-1 text-sm text-slate-500">
                <span className="font-semibold text-emerald-700 underline-offset-4 group-hover:underline">{t("analyze.browse")}</span> · {t("analyze.formats")}
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
