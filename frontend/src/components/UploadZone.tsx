import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, FileImage, RotateCcw } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

const ACCEPT = ".dcm,.dicom,.png,.jpg,.jpeg,image/png,image/jpeg,application/dicom";

interface Props {
  file: File | null;
  preview: string | null;
  onFile: (file: File) => void;
}

export function UploadZone({ file, preview, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`group relative flex min-h-[26rem] flex-col items-center justify-center overflow-hidden rounded-[28px] transition ${
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
          className={`animate-dash transition-colors ${
            dragging ? "stroke-emerald-500" : "stroke-emerald-300/80 group-hover:stroke-emerald-400"
          }`}
        />
      </svg>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}
        aria-label="Upload a study"
      />

      <AnimatePresence mode="wait">
        {file ? (
          <motion.div
            key={file.name + file.size}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full flex-col items-center gap-4 p-5"
          >
            <div className="flex w-full items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{file.name}</div>
                <div className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>
                <RotateCcw className="size-4" /> Replace
              </button>
            </div>
            <div className="flex h-80 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-950">
              {preview ? (
                <img src={preview} alt="Selected study" className="h-full w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <FileImage className="size-12 text-emerald-400" />
                  <span className="text-sm font-semibold text-slate-200">DICOM study</span>
                  <span className="text-xs">Preview appears after analysis</span>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="empty"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => input.current?.click()}
            className="flex flex-col items-center gap-4 px-8 py-16 text-center"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow"
            >
              <CloudUpload className="size-9" />
            </motion.div>
            <div>
              <div className="text-lg font-bold text-ink">Drop a study here</div>
              <div className="mt-1 text-sm text-slate-500">
                or <span className="font-semibold text-emerald-700 underline-offset-4 group-hover:underline">browse</span>{" "}
                · DICOM, PNG or JPEG · up to 40 MB
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
