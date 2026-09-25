import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, CircleCheck, GraduationCap, LoaderCircle, Play, Stethoscope, Target, TriangleAlert, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ImageViewer, type Point } from "../components/ImageViewer";
import { EmptyState, PageHeader, Skeleton, StatCard } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type AIMistake, type AnalysisResult, type TrainingCase, type TrainingReveal, type TrainingStats } from "../lib/api";
import { useToast } from "../lib/toast";

function blind(task: TrainingCase): AnalysisResult {
  return {
    case_id: task.case_id, created_at: "", status: "reviewed", priority: "routine", priority_reason: null, patient: null,
    owner: null, acquired_at: null, selection: task.selection, image: task.image, rejected: false, rejection_reasons: [],
    checks: [], findings: [], other_scores: [], not_assessed: [], thresholds: {}, structures: [], measurements: [],
    report: null, report_error: null, physician_report: null, suggested_report: null, versions: {}, timings_ms: {}, review: null, audit: [],
  };
}

function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const color = score >= 75 ? "#059669" : score >= 40 ? "#d97706" : "#e11d48";
  return (
    <svg viewBox="0 0 100 100" className="size-28" aria-hidden>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <motion.circle
        cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - score / 100) }} transition={{ duration: 1.1, ease: "easeOut" }}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="56" textAnchor="middle" className="fill-ink text-[22px] font-extrabold">{Math.round(score)}</text>
    </svg>
  );
}

const Mark = ({ on }: { on: boolean }) =>
  on ? <Check className="mx-auto size-4 text-emerald-600" /> : <span className="mx-auto block size-1.5 rounded-full bg-slate-200" />;

export function TrainingPage() {
  const { t, finding, percent, study } = useI18n();
  const toast = useToast();
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [mistakes, setMistakes] = useState<AIMistake[] | null>(null);
  const [task, setTask] = useState<TrainingCase | null | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [marks, setMarks] = useState<Point[]>([]);
  const [reveal, setReveal] = useState<TrainingReveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const refresh = () => {
    api.trainingStats().then(setStats, () => undefined);
    api.aiMistakes().then(setMistakes, () => setMistakes([]));
  };
  useEffect(refresh, []);

  const next = async () => {
    setBusy(true);
    setReveal(null);
    setSelected([]);
    setMarks([]);
    try {
      setTask((await api.trainingNext(task?.case_id)) ?? null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!task) return;
    setBusy(true);
    try {
      setReveal(await api.trainingAttempt(task.case_id, selected, marks));
      refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (name: string) => setSelected((all) => (all.includes(name) ? all.filter((n) => n !== name) : [...all, name]));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow={t("nav.training")}
        title={t("training.title")}
        subtitle={t("training.subtitle")}
        actions={
          <button type="button" className="btn-primary" onClick={next} disabled={busy}>
            {busy && !reveal ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
            {task ? t("training.next") : t("training.start")}
          </button>
        }
      />

      {task === null && <div className="card"><EmptyState icon={GraduationCap} title={t("training.empty")} /></div>}

      <AnimatePresence mode="wait">
        {task && (
          <motion.div key={task.case_id + (reveal ? "-r" : "")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="px-1 text-sm text-slate-500">{study(task.selection)}</div>
              {reveal ? (
                <ImageViewer result={reveal.result} selected={highlight} onSelect={setHighlight} marks={marks} compact />
              ) : (
                <ImageViewer result={blind(task)} selected={null} onSelect={() => undefined} overlays={false} marks={marks} onImageClick={(p) => setMarks((m) => [...m, p].slice(-20))} />
              )}
              {!reveal && <p className="px-1 text-xs text-slate-400">{t("training.markHint")}</p>}
            </div>

            {!reveal ? (
              <section className="card p-5">
                <h2 className="flex items-center gap-2 font-bold text-ink"><Stethoscope className="size-5 text-emerald-600" /> {t("training.yourRead")}</h2>
                <p className="mt-1 text-sm text-slate-500">{t("training.selectFindings")}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {task.candidates.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={selected.includes(name)}
                      onClick={() => toggle(name)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium ring-1 transition ${
                        selected.includes(name) ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                      }`}
                    >
                      <span className={`flex size-4 items-center justify-center rounded-md border ${selected.includes(name) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300"}`}>
                        {selected.includes(name) && <Check className="size-3" />}
                      </span>
                      {finding(name)}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-primary mt-5 w-full py-3" onClick={submit} disabled={busy}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Target className="size-4" />} {selected.length ? t("training.submit") : `${t("training.none")} · ${t("training.submit")}`}
                </button>
              </section>
            ) : (
              <section className="space-y-4">
                <div className="card flex items-center gap-5 p-5">
                  <ScoreRing score={reveal.score} />
                  <div>
                    <div className="eyebrow">{t("training.score")}</div>
                    <p className="mt-1 text-xs text-slate-500">{t("training.scoreHint")}</p>
                    <div className={`mt-3 flex items-center gap-2 text-sm font-semibold ${reveal.ai_was_wrong ? "text-amber-700" : "text-emerald-700"}`}>
                      {reveal.ai_was_wrong ? <TriangleAlert className="size-4" /> : <CircleCheck className="size-4" />}
                      {reveal.ai_was_wrong ? t("training.aiWrong") : t("training.aiRight")}
                    </div>
                  </div>
                </div>
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/60 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold" />
                        <th className="px-2 py-2.5 font-semibold"><UserRound className="mx-auto size-4" /><span className="sr-only">{t("training.you")}</span></th>
                        <th className="px-2 py-2.5 font-semibold"><Bot className="mx-auto size-4" /><span className="sr-only">{t("training.ai")}</span></th>
                        <th className="px-2 py-2.5 font-semibold"><Stethoscope className="mx-auto size-4" /><span className="sr-only">{t("training.radiologist")}</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reveal.outcomes.filter((o) => o.resident || o.ai || o.reference).map((o) => {
                        const right = o.resident === o.reference;
                        return (
                          <tr key={o.name} className={right ? "" : "bg-rose-50/40"}>
                            <td className="px-4 py-2.5 font-medium text-ink">
                              <span className="flex items-center gap-2">{right ? <Check className="size-4 text-emerald-500" /> : <X className="size-4 text-rose-500" />} {finding(o.name)}</span>
                            </td>
                            <td className="px-2"><Mark on={o.resident} /></td>
                            <td className="px-2"><Mark on={o.ai} /></td>
                            <td className="px-2"><Mark on={o.reference} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><UserRound className="size-3.5" /> {t("training.you")}</span>
                    <span className="flex items-center gap-1"><Bot className="size-3.5" /> {t("training.ai")}</span>
                    <span className="flex items-center gap-1"><Stethoscope className="size-3.5" /> {t("training.radiologist")}</span>
                  </div>
                </div>
                {reveal.impression && (
                  <div className="card p-5">
                    <div className="eyebrow">{t("training.impression")}{reveal.reviewer ? ` · ${reveal.reviewer}` : ""}</div>
                    <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{reveal.impression}</p>
                  </div>
                )}
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="space-y-4">
          <h2 className="font-bold text-ink">{t("training.stats")}</h2>
          {!stats ? <Skeleton className="h-40" /> : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <StatCard icon={GraduationCap} label={t("training.attempts")} value={stats.attempts} />
                <StatCard icon={Target} label={t("training.average")} value={stats.average_score === null ? "—" : Math.round(stats.average_score)} tone="text-emerald-600" />
              </div>
              {stats.per_pathology.some((p) => p.sensitivity !== null) && (
                <div className="card p-5">
                  <div className="eyebrow mb-3">{t("training.perPathology")}</div>
                  <ul className="space-y-2.5">
                    {stats.per_pathology.filter((p) => p.sensitivity !== null).slice(0, 10).map((p) => (
                      <li key={p.name} className="grid grid-cols-[1fr_6rem_3rem] items-center gap-3 text-xs">
                        <span className="truncate font-medium text-slate-700">{finding(p.name)}</span>
                        <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.sensitivity! * 100}%` }} /></div>
                        <span className="text-right tabular-nums text-slate-500">{percent(p.sensitivity!)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-bold text-ink">{t("training.mistakesTitle")}</h2>
            <p className="text-sm text-slate-500">{t("training.mistakesSubtitle")}</p>
          </div>
          {mistakes === null ? <Skeleton className="h-40" /> : mistakes.length === 0 ? (
            <div className="card"><EmptyState icon={CircleCheck} title={t("training.noMistakes")} /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {mistakes.slice(0, 6).map((m) => (
                <motion.div key={m.case_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card flex gap-3 p-4">
                  {m.thumbnail && <img src={m.thumbnail} alt="" className="size-16 shrink-0 rounded-xl bg-slate-900 object-cover" />}
                  <div className="min-w-0 space-y-1.5 text-xs">
                    {m.missed_by_ai.length > 0 && (
                      <div><span className="font-semibold text-violet-700">{t("training.missed")}:</span> {m.missed_by_ai.map(finding).join(", ")}</div>
                    )}
                    {m.false_alarms.length > 0 && (
                      <div><span className="font-semibold text-rose-700">{t("training.falseAlarm")}:</span> {m.false_alarms.map(finding).join(", ")}</div>
                    )}
                    {m.notes && <p className="line-clamp-2 text-slate-500 italic">“{m.notes}”</p>}
                    <div className="text-slate-400">{m.reviewer}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
