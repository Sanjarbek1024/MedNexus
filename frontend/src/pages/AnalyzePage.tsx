import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ScanningImage, StepList } from "../components/AnalysisProgress";
import { StudySelect } from "../components/StudySelect";
import { UploadZone } from "../components/UploadZone";
import { api, retryUntilLoaded, type Capabilities, type Stage } from "../lib/api";
import { navigate } from "../lib/router";
import { rememberCase } from "./CasePage";

const firstSupported = <T extends { supported: boolean }>(items: T[]): T | undefined =>
  items.find((item) => item.supported) ?? items[0];

export function AnalyzePage() {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [modality, setModality] = useState("");
  const [region, setRegion] = useState("");
  const [view, setView] = useState("");
  const [language, setLanguage] = useState("");
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      retryUntilLoaded(
        api.capabilities,
        (caps) => {
          setError(null);
          setCapabilities(caps);
          const m = firstSupported(caps.modalities)!;
          const r = firstSupported(m.regions)!;
          setModality(m.id);
          setRegion(r.id);
          setView(firstSupported(r.views)!.id);
          setLanguage(caps.default_language);
        },
        () => setError("Waiting for the MedNexus server to start…"),
      ),
    [],
  );

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const modalityOption = capabilities?.modalities.find((m) => m.id === modality);
  const regionOption = modalityOption?.regions.find((r) => r.id === region);
  const viewOption = regionOption?.views.find((v) => v.id === view);
  const ready = Boolean(file && viewOption?.supported);

  const chooseModality = (id: string) => {
    const m = capabilities!.modalities.find((item) => item.id === id)!;
    const r = firstSupported(m.regions)!;
    setModality(id);
    setRegion(r.id);
    setView(firstSupported(r.views)!.id);
  };
  const chooseRegion = (id: string) => {
    const r = modalityOption!.regions.find((item) => item.id === id)!;
    setRegion(id);
    setView(firstSupported(r.views)!.id);
  };

  const chooseFile = (next: File) => {
    setError(null);
    setFile(next);
    const isRaster = /\.(png|jpe?g)$/i.test(next.name) || /^image\/(png|jpeg)$/.test(next.type);
    setPreview(isRaster ? URL.createObjectURL(next) : null);
  };

  const analyze = async () => {
    if (!file) return;
    setError(null);
    setStages([]);
    try {
      const result = await api.analyze(file, { modality, region, view, language }, (stage) =>
        setStages((previous) => [...(previous ?? []), stage]),
      );
      rememberCase(result);
      navigate(`/cases/${result.case_id}`);
    } catch (e) {
      setError((e as Error).message);
      setStages(null);
    }
  };

  const analyzers = useMemo(() => viewOption?.analyzers ?? [], [viewOption]);

  if (stages) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-10 pb-24 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
        <ScanningImage preview={preview} />
        <StepList reached={stages} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 pb-40 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
        <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <Sparkles className="size-3.5" /> Decision support · the physician decides
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          AI findings you can <span className="bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">verify</span>.
        </h1>
        <p className="mt-4 text-lg text-slate-500">
          Upload a study. Open-source models flag findings, show where they looked and check their own
          limits. Every result stays a draft until you confirm it.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <UploadZone file={file} preview={preview} onFile={chooseFile} />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card flex flex-col gap-5 p-6"
        >
          <div>
            <div className="text-lg font-bold text-ink">Study details</div>
            <p className="text-sm text-slate-500">Choose what the image shows. Only validated combinations can run.</p>
          </div>
          {capabilities && modalityOption && regionOption ? (
            <>
              <StudySelect label="Modality" value={modality} options={capabilities.modalities} onChange={chooseModality} />
              <StudySelect label="Body region" value={region} options={modalityOption.regions} onChange={chooseRegion} />
              <StudySelect label="View" value={view} options={regionOption.views} onChange={setView} />
              <div>
                <div className="eyebrow mb-1.5 pl-1">Report language</div>
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100/80 p-1">
                  {capabilities.languages.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setLanguage(lang.id)}
                      aria-pressed={language === lang.id}
                      className={`relative rounded-xl py-2 text-sm font-semibold transition ${
                        language === lang.id ? "text-emerald-800" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {language === lang.id && (
                        <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-xl bg-white shadow-sm ring-1 ring-emerald-200" />
                      )}
                      <span className="relative">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {analyzers.length > 0 && (
                <div className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
                  <div className="eyebrow text-emerald-700/70">Pipeline</div>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {analyzers.map((name) => (
                      <li key={name} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-emerald-400" /> {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-shimmer rounded-2xl bg-[linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9)] bg-[length:200%_100%]" />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="mt-6 flex items-center gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200"
          >
            <CircleAlert className="size-5 shrink-0" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="no-print fixed inset-x-0 bottom-8 z-30 flex justify-center">
        <motion.button
          type="button"
          onClick={analyze}
          disabled={!ready}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={ready ? { scale: 1.03 } : undefined}
          whileTap={ready ? { scale: 0.97 } : undefined}
          className="btn-primary rounded-full px-8 py-4 text-base disabled:shadow-none"
        >
          <Sparkles className="size-5" />
          {file ? "Analyze" : "Choose a study to analyze"}
        </motion.button>
      </div>
    </div>
  );
}
