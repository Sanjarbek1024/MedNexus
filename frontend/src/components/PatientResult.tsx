import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronDown,
  CircleHelp,
  CircleX,
  ClipboardList,
  Eye,
  Globe,
  HeartPulse,
  LoaderCircle,
  MapPin,
  MessagesSquare,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import { api, type AnalysisResult, type Assessment, type Hospital, type Urgency } from "../lib/api";
import { useToast } from "../lib/toast";
import { Link, navigate } from "../lib/router";
import { ChatPanel, type ChatHandle } from "./ChatPanel";
import { ImageViewer } from "./ImageViewer";

const EASE = [0.22, 1, 0.36, 1] as const;

// Calm colours throughout: even "urgent" reads as a clear next step, never an alarm.
const URGENCY: Record<Urgency, { icon: LucideIcon; chip: string; banner: string; badge: string; dot: string }> = {
  routine: {
    icon: ShieldCheck,
    chip: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    banner: "from-emerald-50 to-teal-50/60 ring-emerald-200/80 text-emerald-950",
    badge: "bg-emerald-500 text-white",
    dot: "bg-emerald-500",
  },
  soon: {
    icon: CalendarClock,
    chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    banner: "from-amber-50 to-orange-50/50 ring-amber-200/80 text-amber-950",
    badge: "bg-amber-500 text-white",
    dot: "bg-amber-500",
  },
  urgent: {
    icon: Stethoscope,
    chip: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    banner: "from-rose-50 to-pink-50/50 ring-rose-200/80 text-rose-950",
    badge: "bg-rose-500 text-white",
    dot: "bg-rose-500",
  },
};

/** `clinical` shows the timing for a physician ("Same day") instead of advice to the person ("See a doctor today"). */
export function UrgencyChip({ urgency, clinical = false }: { urgency: Urgency; clinical?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`chip max-w-full whitespace-normal ${URGENCY[urgency].chip}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${URGENCY[urgency].dot}`} /> {t(`${clinical ? "urgencyClinical" : "urgency"}.${urgency}`)}
    </span>
  );
}

/** Regenerates the AI assessment in the current UI language. */
export function useRegenerateAssessment(result: AnalysisResult, onUpdate: (result: AnalysisResult) => void) {
  const { language, t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const updated = await api.regenerateAssessment(result.case_id, language);
      onUpdate(updated);
      if (!updated.assessment) toast(t("patient.unavailableText"), "error");
    } catch (e) {
      toast((e as Error).message || t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, run, stale: Boolean(result.assessment && result.assessment.language !== language) };
}

/** Estimated likelihoods as horizontal bars; never presented as certainties. */
export function DifferentialBars({ items, compact = false }: { items: Assessment["differential"]; compact?: boolean }) {
  const { t, finding } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  const top = Math.max(...items.map((i) => i.probability), 1);
  return (
    <ol className={compact ? "space-y-3" : "space-y-4"}>
      {items.map((item, i) => {
        const expanded = open === i;
        const percent = Math.min(90, Math.max(0, Math.round(item.probability)));
        return (
          <motion.li key={`${item.name}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }}>
            <button
              type="button"
              onClick={() => item.reasoning && setOpen(expanded ? null : i)}
              aria-expanded={item.reasoning ? expanded : undefined}
              className={`group w-full text-left ${item.reasoning ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`min-w-0 font-semibold text-ink ${compact ? "text-sm" : "text-[15px]"}`}>
                  {finding(item.name)}
                  {item.reasoning && (
                    <ChevronDown className={`ml-1 inline size-3.5 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className={`font-extrabold text-ink tabular-nums ${compact ? "text-sm" : "text-lg"}`}>~{percent}%</span>
                  <span className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">{t("patient.estimated")}</span>
                </span>
              </div>
              <div className={`relative mt-1.5 overflow-hidden rounded-full bg-slate-100 ${compact ? "h-1.5" : "h-2.5"}`}>
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-teal-500"
                  style={{ opacity: 0.55 + 0.45 * (item.probability / top) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 1, delay: 0.15 + 0.08 * i, ease: EASE }}
                />
                {/* Hatched tail: the part no model can ever claim. */}
                <div className="absolute inset-y-0 right-0 w-[10%] bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(148_163_184/0.25)_3px_5px)]" />
              </div>
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden text-sm leading-relaxed text-slate-600"
                >
                  <span className="block pt-2">{item.reasoning}</span>
                </motion.p>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}

function Block({ icon: Icon, title, hint, children, delay = 0, tone = "bg-emerald-50 text-emerald-600 ring-emerald-100" }: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
  delay?: number;
  tone?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: EASE }}
      className="card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}><Icon className="size-[18px]" /></div>
        <div className="min-w-0">
          <h2 className="font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </motion.section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-700">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow-glow">{i + 1}</span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Questions({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 rounded-xl bg-sky-50/70 px-3 py-2.5 text-sm text-sky-950 ring-1 ring-sky-100">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-sky-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function UrgencyBanner({ assessment }: { assessment: Assessment }) {
  const { t, specialty } = useI18n();
  const style = URGENCY[assessment.urgency];
  const Icon = style.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={`flex flex-col gap-4 rounded-3xl bg-gradient-to-br p-5 ring-1 sm:flex-row sm:items-center sm:p-6 ${style.banner}`}
    >
      <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${style.badge}`}><Icon className="size-6" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold">{t(`urgency.${assessment.urgency}`)}</div>
        {assessment.urgency_text && <p className="mt-0.5 text-sm leading-relaxed opacity-80">{assessment.urgency_text}</p>}
      </div>
      {assessment.specialty && (
        <span className="chip w-fit bg-white/80 py-1.5 text-slate-700 ring-1 ring-white">
          <Stethoscope className="size-3.5 text-emerald-600" /> {specialty(assessment.specialty)}
        </span>
      )}
    </motion.div>
  );
}

function HospitalCard({ hospital, index }: { hospital: Hospital; index: number }) {
  const { t, language, specialty } = useI18n();
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ delay: Math.min(index, 5) * 0.06 }}
      className={`card relative flex flex-col p-5 ${hospital.partner ? "ring-2 ring-emerald-300/70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${hospital.partner ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow" : "bg-slate-100 text-slate-500"}`}>
          <Building2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {hospital.partner && (
              <span className="chip bg-emerald-500 text-white"><Star className="size-3 fill-current" /> {t("patient.partner")}</span>
            )}
            {hospital.emergency && (
              <span className="chip bg-rose-50 text-rose-700 ring-1 ring-rose-200"><Siren className="size-3" /> {t("patient.emergency")}</span>
            )}
          </div>
          <h3 className="mt-1.5 leading-snug font-bold text-ink">{hospital.names[language] || hospital.names.en}</h3>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3.5" /> {hospital.city}</div>
        </div>
      </div>
      {(hospital.description[language] || hospital.description.en) && (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{hospital.description[language] || hospital.description.en}</p>
      )}
      {/* Centers for every specialty (partners, emergency care) need no chips. */}
      {hospital.specialties.length > 0 && hospital.specialties.length < 4 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hospital.specialties.map((id) => <span key={id} className="chip bg-slate-100 text-slate-600">{specialty(id)}</span>)}
        </div>
      )}
      {(hospital.phone || hospital.website) && (
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {hospital.phone && (
            <a href={`tel:${hospital.phone.replace(/[^+\d]/g, "")}`} className="btn-ghost py-1.5 text-xs">
              <Phone className="size-3.5" /> {hospital.phone}
            </a>
          )}
          {hospital.website && /^https?:\/\//i.test(hospital.website) && (
            <a href={hospital.website} target="_blank" rel="noopener noreferrer" className="btn-ghost py-1.5 text-xs">
              <Globe className="size-3.5" /> {t("patient.website")}
            </a>
          )}
        </div>
      )}
    </motion.article>
  );
}

function RejectedNotice({ result }: { result: AnalysisResult }) {
  const { t, check } = useI18n();
  const failed = result.checks.filter((c) => c.blocking && c.status === "fail");
  const reasons = failed.length ? failed.map((c) => check(c)) : result.rejection_reasons;
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6" role="alert">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><CircleX className="size-6" /></div>
        <h2 className="text-xl font-bold text-ink">{t("patient.rejectedTitle")}</h2>
      </div>
      <p className="mt-4 text-sm text-slate-600">{t("patient.rejectedText")}</p>
      <ul className="mt-3 space-y-2">
        {reasons.map((reason, i) => <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200">{reason}</li>)}
      </ul>
      <button type="button" className="btn-primary mt-5" onClick={() => navigate("/analyze")}><Plus className="size-4" /> {t("patient.tryAnother")}</button>
    </motion.section>
  );
}

function Unavailable({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col items-center gap-3 p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-emerald-100/60 blur-xl" />
        <div className="relative flex size-14 items-center justify-center rounded-2xl bg-white text-emerald-500 shadow-soft ring-1 ring-emerald-100">
          {busy ? <LoaderCircle className="size-7 animate-spin" /> : <Sparkles className="size-7" />}
        </div>
      </div>
      <h2 className="text-lg font-bold text-ink">{t("patient.unavailableTitle")}</h2>
      <p className="max-w-md text-sm text-slate-500">{t("patient.unavailableText")}</p>
      <button type="button" className="btn-primary mt-1 rounded-full px-6" onClick={onRetry} disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("patient.retry")}
      </button>
    </motion.section>
  );
}

function ChatInvite({ onOpen }: { onOpen: (question?: string) => void }) {
  const { t, list } = useI18n();
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-900/15"
    >
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "22px 22px" }} />
      <div className="relative">
        <div className="flex items-center gap-2 text-lg font-bold"><MessagesSquare className="size-5" /> {t("patient.chat")}</div>
        <p className="mt-1 text-sm text-emerald-50/90">{t("patient.chatHint")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {list<string>("chat.patientSuggestions").map((s) => (
            <button key={s} type="button" onClick={() => onOpen(s)} className="chip bg-white/15 py-1.5 text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25">
              {s}
            </button>
          ))}
        </div>
        <motion.button
          type="button"
          onClick={() => onOpen()}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn mt-5 rounded-full bg-white px-6 py-3 text-emerald-700 shadow-lg hover:bg-emerald-50"
        >
          <MessagesSquare className="size-4" /> {t("patient.chat")}
        </motion.button>
      </div>
    </motion.section>
  );
}

function DisclaimerBox() {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-amber-50/80 p-4 text-sm text-amber-950 ring-1 ring-amber-200/80">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div>
        <div className="font-bold">{t("patient.disclaimerTitle")}</div>
        <p className="mt-0.5 leading-relaxed text-amber-900/90">{t("patient.disclaimerText")}</p>
      </div>
    </div>
  );
}

/** The result page for people analyzing their own image: calm, plain language, never a diagnosis. */
export function PatientResult({ initial }: { initial: AnalysisResult }) {
  const { t, scanTitle, date, finding } = useI18n();
  const [result, setResult] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.findings.find((f) => f.heatmap || f.boxes.length)?.name ?? null);
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useRef<ChatHandle>(null);
  const openChat = (question?: string) => {
    setChatOpen(true);
    if (question) chat.current?.ask(question);
  };
  const regenerate = useRegenerateAssessment(result, setResult);
  const assessment = result.assessment;
  const hospitals = [...result.hospitals].sort((a, b) => Number(b.partner) - Number(a.partner));
  const chattable = !result.rejected && (result.status === "ai_ready" || result.status === "reviewed");

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/my" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="size-4" /> {t("patient.back")}
          </Link>
          <div className="eyebrow mt-3">{t("patient.eyebrow")}</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{scanTitle(result.selection)}</h1>
          <div className="mt-1 text-sm text-slate-500">{date(result.acquired_at ?? result.created_at, false)}</div>
        </div>
        {chattable && (
          <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="btn-primary rounded-full px-5" onClick={() => setChatOpen(true)}>
            <MessagesSquare className="size-4" /> {t("patient.chat")}
          </motion.button>
        )}
      </div>

      {assessment && !result.rejected && <div className="mt-6"><UrgencyBanner assessment={assessment} /></div>}

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4 lg:sticky lg:top-20">
          <ImageViewer result={result} selected={selected} onSelect={setSelected} />
          {result.findings.length > 0 && !result.rejected && (
            <div className="card p-4">
              <div className="eyebrow">{t("patient.marked")}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.findings.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => setSelected(f.name)}
                    className={`chip py-1 transition ${selected === f.name ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {finding(f.name)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(result.symptoms || result.patient_age !== null || result.patient_sex) && (
            <div className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow">{t("patient.symptoms")}</span>
                {result.patient_age !== null && <span className="chip bg-slate-100 text-slate-600"><UserRound className="size-3" /> {t("patient.ageYears", { n: result.patient_age })}</span>}
                {result.patient_sex && <span className="chip bg-slate-100 text-slate-600">{t(`analyze.sexes.${result.patient_sex}`)}</span>}
              </div>
              {result.symptoms && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{result.symptoms}</p>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {result.rejected ? (
            <RejectedNotice result={result} />
          ) : !assessment ? (
            <Unavailable busy={regenerate.busy} onRetry={regenerate.run} />
          ) : (
            <>
              {regenerate.stale && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
                  {t("patient.otherLanguage")}
                  <button type="button" className="btn-ghost py-1.5" onClick={regenerate.run} disabled={regenerate.busy}>
                    {regenerate.busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("patient.rewrite")}
                  </button>
                </div>
              )}
              <motion.section
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="card relative overflow-hidden p-6"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-emerald-500 to-teal-500" />
                <div className="flex items-center gap-2"><HeartPulse className="size-5 text-emerald-600" /><h2 className="font-bold text-ink">{t("patient.summary")}</h2></div>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{assessment.summary}</p>
                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Sparkles className="size-3.5" /> {t("patient.readBy", { model: assessment.model })}
                </div>
              </motion.section>

              {assessment.image_observations.length > 0 && (
                <Block icon={Eye} title={t("patient.observations")} delay={0.05}><Bullets items={assessment.image_observations} /></Block>
              )}
              {assessment.differential.length > 0 && (
                <Block icon={ClipboardList} title={t("patient.differential")} hint={t("patient.differentialHint")} delay={0.1}>
                  <DifferentialBars items={assessment.differential} />
                </Block>
              )}
              {assessment.causes.length > 0 && (
                <Block icon={CircleHelp} title={t("patient.causes")} delay={0.15}><Bullets items={assessment.causes} /></Block>
              )}
              {assessment.next_steps.length > 0 && (
                <Block icon={CalendarClock} title={t("patient.nextSteps")} delay={0.2}><Steps items={assessment.next_steps} /></Block>
              )}
              {assessment.questions_for_doctor.length > 0 && (
                <Block icon={MessagesSquare} title={t("patient.questions")} delay={0.25} tone="bg-sky-50 text-sky-600 ring-sky-100">
                  <Questions items={assessment.questions_for_doctor} />
                </Block>
              )}
            </>
          )}
          {chattable && <ChatInvite onOpen={openChat} />}
          {!result.rejected && <DisclaimerBox />}
        </div>
      </div>

      {hospitals.length > 0 && !result.rejected && (
        <section className="mt-10" aria-labelledby="hospitals-title">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"><Building2 className="size-5" /></div>
            <div>
              <h2 id="hospitals-title" className="text-xl font-extrabold tracking-tight text-ink">{t("patient.hospitals")}</h2>
              <p className="text-sm text-slate-500">{t("patient.hospitalsHint")}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hospitals.map((hospital, i) => <HospitalCard key={hospital.id} hospital={hospital} index={i} />)}
          </div>
        </section>
      )}

      {chattable && <ChatPanel ref={chat} result={result} open={chatOpen} onClose={() => setChatOpen(false)} patient />}
    </div>
  );
}

/** Compact clinical view of the same assessment for doctors. */
export function AssessmentCard({ result, onUpdate }: { result: AnalysisResult; onUpdate: (result: AnalysisResult) => void }) {
  const { t, specialty } = useI18n();
  const regenerate = useRegenerateAssessment(result, onUpdate);
  const assessment = result.assessment;
  const context = [
    result.patient_age !== null ? t("patient.ageYears", { n: result.patient_age }) : null,
    result.patient_sex ? t(`analyze.sexes.${result.patient_sex}`) : null,
  ].filter(Boolean);

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card border-l-4 border-l-violet-300 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-5 text-violet-500" />
        <h2 className="min-w-[12rem] flex-1 font-bold text-ink">{t("assessment.title")}</h2>
        {assessment && <UrgencyChip urgency={assessment.urgency} clinical />}
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200/70">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow">{t("assessment.symptoms")}</span>
          {context.map((c) => <span key={c} className="chip bg-white text-slate-600 ring-1 ring-slate-200">{c}</span>)}
        </div>
        <p className={`mt-1.5 whitespace-pre-line ${result.symptoms ? "text-slate-700" : "text-slate-400 italic"}`}>
          {result.symptoms || t("assessment.noSymptoms")}
        </p>
      </div>

      {!assessment ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{t("assessment.unavailable")}</span>
          </div>
          <button type="button" className="btn-ghost py-1.5" onClick={regenerate.run} disabled={regenerate.busy}>
            {regenerate.busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("assessment.regenerate")}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">{assessment.summary}</p>
          {assessment.differential.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow mb-2">{t("assessment.differential")}</div>
              <DifferentialBars items={assessment.differential} compact />
              <p className="mt-2 text-[11px] text-slate-400">{t("assessment.note")}</p>
            </div>
          )}
          {assessment.image_observations.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow mb-2">{t("assessment.observations")}</div>
              <Bullets items={assessment.image_observations} />
            </div>
          )}
          {assessment.urgency_text && <p className="mt-4 text-sm text-slate-600">{assessment.urgency_text}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="chip bg-slate-100 text-slate-600"><Stethoscope className="size-3" /> {specialty(assessment.specialty)}</span>
            <span className="min-w-0 truncate font-mono text-[11px]">{t("assessment.model", { model: assessment.model })}</span>
            <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50" onClick={regenerate.run} disabled={regenerate.busy}>
              {regenerate.busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {regenerate.stale ? t("report.regenerate") : t("assessment.regenerate")}
            </button>
          </div>
        </>
      )}
    </motion.section>
  );
}
