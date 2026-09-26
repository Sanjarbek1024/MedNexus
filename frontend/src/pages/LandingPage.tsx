import { animate, motion, useInView } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  Brain,
  ClipboardList,
  CircleCheck,
  Eye,
  Fingerprint,
  Gauge,
  GraduationCap,
  Link2,
  LockKeyhole,
  Microscope,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { LanguageSwitch, Logo, LogoMark, ThemeToggle, Wordmark } from "../components/Brand";
import { Disclaimer } from "../components/Disclaimer";
import { useI18n } from "../i18n";
import { api, type Health } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { Link } from "../lib/router";

type Item = { title: string; text: string };
type Audience = { title: string; text: string; points: readonly string[] };
type Evidence = { value: string; label: string; source: string };
type Model = { name: string; task: string; detail: string; tag: string };
type DiffItem = { name: string; value: number };

const EASE = [0.22, 1, 0.36, 1] as const;
const STEP_ICONS = [ClipboardList, Gauge, ScanLine, Sparkles, UserCheck];
const SAFETY_ICONS = [UserCheck, ShieldCheck, Activity, Eye, Link2, Microscope, LockKeyhole, GraduationCap];
const MODEL_ICONS = [Stethoscope, ScanLine, Activity, Brain, Sparkles, BookOpenCheck];
const STACK = ["React 19", "TypeScript", "Vite", "Tailwind 4", "FastAPI", "PyTorch", "ONNX Runtime", "SQLModel", "PostgreSQL 16", "Docker", "pytest", "Playwright"];
const MARQUEE = ["DenseNet-121", "ResNet-50", "PSPNet", "ResNet autoencoder", "YOLOv7-p6", "ViT-B/16", "Grad-CAM", "Qwen 3.8 27B VLM", "gpt-oss-120b", "DICOM PS3.15", "SHA-256 audit chain", "argon2id"];
// Browsers ship incomplete Uzbek number data; Uzbek uses the same "12 600" / "2,6" style as Russian.
const LOCALES = { uz: "ru-RU", en: "en-US", ru: "ru-RU" } as const;

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: EASE },
};

/** A stylized chest radiograph drawn in SVG (no patient data, no third-party image). */
function XrayArt() {
  return (
    <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <radialGradient id="xr-body" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#6b7a76" />
          <stop offset="1" stopColor="#0d1412" />
        </radialGradient>
        <radialGradient id="xr-lung" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#0a100e" />
          <stop offset="1" stopColor="#1f2a27" />
        </radialGradient>
        <radialGradient id="xr-heart" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c9d2cf" stopOpacity="0.9" />
          <stop offset="1" stopColor="#8a9793" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id="xr-heat" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ef4444" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#f97316" stopOpacity="0.55" />
          <stop offset="1" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="440" fill="#050807" />
      <path d="M40 440 C40 250 70 120 200 95 C330 120 360 250 360 440 Z" fill="url(#xr-body)" />
      <path d="M108 360 C80 300 88 170 150 130 C185 140 188 250 184 360 C160 372 130 372 108 360 Z" fill="url(#xr-lung)" />
      <path d="M292 360 C320 300 312 170 250 130 C215 140 212 250 216 360 C240 372 270 372 292 360 Z" fill="url(#xr-lung)" />
      <rect x="190" y="90" width="20" height="350" rx="8" fill="#c7d0cd" opacity="0.35" />
      {[150, 185, 220, 255, 290, 325].map((y) => (
        <g key={y} opacity="0.26" stroke="#e5ecea" strokeWidth="5" fill="none">
          <path d={`M195 ${y} C150 ${y - 30} 105 ${y - 10} 88 ${y + 40}`} />
          <path d={`M205 ${y} C250 ${y - 30} 295 ${y - 10} 312 ${y + 40}`} />
        </g>
      ))}
      <path d="M110 118 C150 108 180 112 196 124 M290 118 C250 108 220 112 204 124" stroke="#e5ecea" strokeWidth="7" opacity="0.4" fill="none" strokeLinecap="round" />
      <ellipse cx="228" cy="300" rx="62" ry="54" fill="url(#xr-heart)" />
      <motion.ellipse
        cx="140"
        cy="205"
        rx="50"
        ry="58"
        fill="url(#xr-heat)"
        animate={{ opacity: [0.55, 0.95, 0.55], scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "140px 205px" }}
      />
      <path d="M108 360 C80 300 88 170 150 130 C185 140 188 250 184 360 C160 372 130 372 108 360 Z" fill="none" stroke="#5cff63" strokeWidth="1.5" strokeDasharray="5 4" className="animate-dash" />
      <path d="M292 360 C320 300 312 170 250 130 C215 140 212 250 216 360 C240 372 270 372 292 360 Z" fill="none" stroke="#5cff63" strokeWidth="1.5" strokeDasharray="5 4" className="animate-dash" />
      <ellipse cx="228" cy="300" rx="62" ry="54" fill="none" stroke="#fb7185" strokeWidth="1.5" />
      <g fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5">
        <path d="M84 148 v-12 h12 M196 148 v-12 h-12 M84 262 v12 h12 M196 262 v12 h-12" />
      </g>
    </svg>
  );
}

/** The product in one frame: gates → finding → differential. Clearly labelled as an illustration. */
function HeroConsole() {
  const { t, list } = useI18n();
  const gates = list<string>("landing.preview.gateItems");
  const diff = list<DiffItem>("landing.preview.diffItems");
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,var(--color-glow),transparent)] opacity-50 blur-2xl" />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE }}
        className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_40px_80px_-32px_rgba(4,19,10,0.35)]"
      >
        <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 truncate font-mono text-[11px] text-slate-400">mednexus / cases / #0014 · PX-3f9a1c07</span>
          <span className="ml-auto shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{t("landing.preview.label")}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative min-h-72 overflow-hidden bg-night">
            <XrayArt />
            <div className="pointer-events-none absolute inset-x-0 h-16 animate-scan">
              <div className="h-full bg-gradient-to-b from-transparent to-[#5cff63]/10" />
              <div className="h-px bg-[#5cff63] shadow-[0_0_18px_4px_rgba(92,255,99,0.55)]" />
            </div>
            <div className="absolute top-3 left-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] text-white/80 backdrop-blur">Grad-CAM · PA</div>
            <div className="absolute bottom-3 left-3 flex gap-1.5">
              <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] text-[#8dff92] backdrop-blur">lungs</span>
              <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] text-rose-300 backdrop-blur">heart</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div>
              <div className="eyebrow mb-2">{t("landing.preview.gates")}</div>
              {gates.map((gate, i) => (
                <motion.div
                  key={gate}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.3 }}
                  className="flex items-center gap-2 py-0.5 text-[12.5px] font-medium text-slate-700"
                >
                  <CircleCheck className="size-3.5 text-emerald-600" /> {gate}
                  <span className="ml-auto font-mono text-[10px] text-emerald-700">PASS</span>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6 }}
              className="rounded-xl border border-line bg-raised p-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-ink">{t("landing.preview.finding")}</span>
                <span className="font-mono text-lg font-semibold text-ink tabular-nums">0.80</span>
              </div>
              <div className="relative mt-2 h-1.5 rounded-full bg-slate-100">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500" initial={{ width: 0 }} animate={{ width: "80%" }} transition={{ delay: 1.8, duration: 1, ease: EASE }} />
                <span className="absolute -top-1 left-1/2 h-3.5 w-px bg-slate-400" title="0.50" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="chip bg-rose-50 text-rose-700 ring-1 ring-rose-200"><span className="size-1.5 animate-pulse rounded-full bg-rose-500" /> {t("landing.preview.urgent")}</span>
                <span className="chip bg-slate-100 text-slate-600">{t("landing.preview.draft")}</span>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.2 }}>
              <div className="eyebrow mb-2">{t("landing.preview.differential")}</div>
              <div className="space-y-2">
                {diff.map((item, i) => (
                  <div key={item.name}>
                    <div className="flex justify-between text-[12px]">
                      <span className="truncate font-medium text-slate-700">{item.name}</span>
                      <span className="shrink-0 font-mono text-slate-500">~{item.value}% <span className="text-slate-400">{t("landing.preview.estimated")}</span></span>
                    </div>
                    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <motion.div
                        className="h-full rounded-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ delay: 2.4 + i * 0.15, duration: 0.9, ease: EASE }}
                      />
                      <div className="absolute inset-y-0 right-0 w-[10%] bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-slate-300)_3px_5px)] opacity-60" />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line bg-amber-50 px-4 py-2 text-[11px] font-medium text-amber-800">
          <ShieldCheck className="size-3.5 shrink-0" /> {t("patient.disclaimer")}
        </div>
      </motion.div>
    </div>
  );
}

/** Live analyzer registry from the public health endpoint: the page proves the engine is running. */
function EngineStrip() {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, []);
  if (health === undefined) return <div className="h-9" />;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface/80 px-3 py-2 font-mono text-[11px] text-slate-500 backdrop-blur"
    >
      <span className="flex items-center gap-2 font-sans text-xs font-semibold text-ink">
        <span className="relative flex size-2">
          {health && <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-emerald-400 opacity-70" />}
          <span className={`relative inline-flex size-2 rounded-full ${health ? "bg-emerald-500" : "bg-slate-300"}`} />
        </span>
        {t(health ? "landing.engine.online" : "landing.engine.offline")}
      </span>
      {health && (
        <>
          <span>{t("landing.engine.analyzers", { n: health.analyzers.length })}</span>
          <span className="text-slate-300">/</span>
          <span>{t("landing.engine.device", { device: health.device })}</span>
          <span className="text-slate-300">/</span>
          <span>{health.llm.model}</span>
        </>
      )}
    </motion.div>
  );
}

function CountUp({ value }: { value: string }) {
  const { language } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const match = /^([\d.,]+)(.*)$/.exec(value);
  const target = match ? Number(match[1].replace(/,/g, "")) : NaN;
  const decimals = match?.[1].includes(".") ? match[1].split(".")[1].length : 0;
  const format = (n: number) =>
    new Intl.NumberFormat(LOCALES[language], { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n) + (match?.[2] ?? "");
  const [text, setText] = useState(() => (Number.isFinite(target) ? format(0) : value));
  useEffect(() => {
    if (!inView || !Number.isFinite(target)) return;
    const controls = animate(0, target, { duration: 1.4, ease: EASE, onUpdate: (n) => setText(format(n)) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- format depends only on value and language
  }, [inView, target, language]);
  return <span ref={ref}>{Number.isFinite(target) ? text : value}</span>;
}

function SectionHead({ eyebrow, title, subtitle, invert = false }: { eyebrow: string; title: string; subtitle?: string; invert?: boolean }) {
  return (
    <motion.div {...reveal} className="mb-12 max-w-2xl">
      <div className="eyebrow flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-brand shadow-[0_0_8px_var(--color-glow)]" /> {eyebrow}
      </div>
      <h2 className={`mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-[40px] sm:leading-[1.1] ${invert ? "text-white" : "text-ink"}`}>{title}</h2>
      {subtitle && <p className="mt-3 text-[17px] leading-relaxed text-slate-500">{subtitle}</p>}
    </motion.div>
  );
}

function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24 ${className}`}>
      {children}
    </section>
  );
}

function AudienceCard({ audience, icon: Icon, dark = false, badge, index }: { audience: Audience; icon: LucideIcon; dark?: boolean; badge?: string; index: number }) {
  const { t } = useI18n();
  return (
    <motion.div
      {...reveal}
      transition={{ ...reveal.transition, delay: index * 0.08 }}
      data-theme={dark ? "dark" : undefined}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border p-7 ${
        dark ? "border-white/10 bg-[#07110b] text-ink shadow-2xl shadow-emerald-950/30" : "card"
      }`}
    >
      {dark && (
        <>
          <div className="grid-lines absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(92,255,99,0.28),transparent)]" />
        </>
      )}
      <div className="relative flex items-center justify-between">
        <div className={`flex size-11 items-center justify-center rounded-xl border ${dark ? "border-white/10 bg-white/5 text-brand" : "border-line bg-raised text-emerald-600"}`}>
          <Icon className="size-5" />
        </div>
        <span className="font-mono text-xs text-slate-400">0{index + 1}</span>
      </div>
      <h3 className="relative mt-6 text-xl font-semibold tracking-tight text-ink">{audience.title}</h3>
      <p className="relative mt-2 text-[15px] leading-relaxed text-slate-500">{audience.text}</p>
      <ul className="relative mt-5 space-y-2.5">
        {audience.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span className="text-slate-700">{point}</span>
          </li>
        ))}
      </ul>
      <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-7">
        <Link href="/signup" className={dark ? "btn-primary rounded-full px-5" : "btn-ghost rounded-full px-5"}>
          {t("landing.start")} <ArrowRight className="size-4" />
        </Link>
        {badge && <span className="chip bg-emerald-50 py-1 text-emerald-700 ring-1 ring-emerald-200"><BadgeCheck className="size-3.5" /> {badge}</span>}
      </div>
    </motion.div>
  );
}

export function LandingPage() {
  const { t, list } = useI18n();
  const { user } = useAuth();
  const home = user ? homeFor(user.role) : null;
  const cta = home ? { href: home, label: t("landing.openApp") } : { href: "/signup", label: t("landing.start") };
  const audience = (key: "forDoctors" | "forStudents"): Audience => ({
    title: t(`landing.${key}.title`),
    text: t(`landing.${key}.text`),
    points: list<string>(`landing.${key}.points`),
  });
  const titleLead = t("landing.titleLead");
  const diff = list<DiffItem>("landing.preview.diffItems");

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="MedNexus">
            <Logo className="size-8" />
            <span className="hidden sm:inline"><Wordmark /></span>
          </Link>
          <nav className="hidden items-center gap-1 text-[13.5px] font-medium whitespace-nowrap text-slate-500 lg:flex">
            {(["audiences", "problem", "how", "safety", "models"] as const).map((id) => (
              <a key={id} href={`#${id}`} className="rounded-lg px-3 py-1.5 transition hover:bg-slate-100 hover:text-ink">{t(`landing.nav.${id}`)}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
            <Link href={home ?? "/signin"} className="btn-dark h-9 rounded-xl px-4 whitespace-nowrap">
              {user ? t("landing.openApp") : t("common.signIn")}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="grid-lines absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-20">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-xs font-medium text-slate-600 shadow-soft">
              <span className="flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-mono text-[10px] text-canvas"><LogoMark className="size-3" /> #6</span>
              <span className="truncate">{t("landing.badge")}</span>
            </span>
            <h1 className="mt-6 text-[42px] leading-[1.02] font-semibold tracking-[-0.04em] text-balance text-ink sm:text-6xl">
              {titleLead && <>{titleLead} </>}
              <span className="text-brand-gradient">{t("landing.titleAccent")}</span> {t("landing.titleTail")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-500">{t("landing.subtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={cta.href} className="btn-primary h-12 rounded-full px-7 text-[15px]">
                {cta.label} <ArrowRight className="size-4" />
              </Link>
              <a href="#how" className="btn-ghost h-12 rounded-full px-6 text-[15px]">
                <ScanLine className="size-4" /> {t("landing.seeHow")}
              </a>
            </div>
            {!user && (
              <Link href="/signin" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-ink">
                {t("landing.demoHint")} <ArrowUpRight className="size-3.5" />
              </Link>
            )}
            <div className="mt-8"><EngineStrip /></div>
          </motion.div>
          <HeroConsole />
        </div>
      </section>

      {/* Model marquee */}
      <div className="relative overflow-hidden border-y border-line bg-surface/60 py-4 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <motion.div
          className="flex w-max gap-10 font-mono text-[13px] text-slate-500"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        >
          {[...MARQUEE, ...MARQUEE].map((name, i) => (
            <span key={i} className="flex items-center gap-10 whitespace-nowrap">
              {name} <span className="size-1 rounded-full bg-emerald-500" />
            </span>
          ))}
        </motion.div>
      </div>

      {/* Evidence */}
      <Section id="problem">
        <SectionHead eyebrow={t("landing.nav.problem")} title={t("landing.evidenceTitle")} subtitle={t("landing.evidenceSubtitle")} />
        <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {list<Evidence>("landing.evidence").map((item, i) => (
            <motion.div key={item.source} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="flex flex-col bg-surface p-6">
              <div className={`font-mono text-5xl font-semibold tracking-tight tabular-nums ${i === 3 ? "text-rose-600" : "text-ink"}`}>
                <CountUp value={item.value} />
              </div>
              <p className="mt-4 text-[15px] leading-snug text-slate-600">{item.label}</p>
              <div className="mt-auto pt-6 font-mono text-[10.5px] leading-snug text-slate-400">↳ {item.source}</div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Differential */}
      <Section className="pt-0 sm:pt-0">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow={t("landing.differential.eyebrow")} title={t("landing.differential.title")} subtitle={t("landing.differential.text")} />
            <ul className="-mt-4 space-y-3">
              {list<string>("landing.differential.rules").map((rule) => (
                <li key={rule} className="flex items-start gap-3 text-[15px] text-slate-700">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><CircleCheck className="size-3.5" /></span>
                  {rule}
                </li>
              ))}
            </ul>
            <blockquote className="mt-8 border-l-2 border-emerald-500 pl-4">
              <p className="text-[15px] leading-relaxed text-ink">{t("landing.differential.stat")}</p>
              <footer className="mt-2 font-mono text-[11px] text-slate-400">↳ {t("landing.differential.statSource")}</footer>
            </blockquote>
          </div>
          <motion.div {...reveal} className="card relative overflow-hidden p-6 sm:p-8">
            <div className="grid-lines absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-canvas"><Sparkles className="size-4" /></span>
                <div>
                  <div className="text-sm font-semibold text-ink">{t("landing.preview.differential")}</div>
                  <div className="font-mono text-[11px] text-slate-400">Qwen 3.8 27B VLM · {t("landing.preview.label")}</div>
                </div>
              </div>
            </div>
            <div className="relative mt-6 rounded-xl border border-line bg-raised p-3 text-[13px] text-slate-600">
              <span className="eyebrow mr-2">{t("assessment.symptoms")}</span>
              {t("landing.differential.sampleSymptoms")}
            </div>
            <div className="relative mt-6 space-y-4">
              {diff.map((item, i) => (
                <div key={item.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">{item.name}</span>
                    <span className="font-mono text-sm text-slate-500">~{item.value}%</span>
                  </div>
                  <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className={`h-full rounded-full ${i === 0 ? "bg-emerald-500" : "bg-emerald-300"}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${item.value}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.2 + i * 0.15, duration: 1, ease: EASE }}
                    />
                    <div className="absolute inset-y-0 right-0 w-[10%] bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-slate-300)_3px_5px)]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="relative mt-6 flex items-center justify-between gap-3 border-t border-line pt-4 font-mono text-[11px] text-slate-400">
              <span>max 90% · Σ ≤ 100%</span>
              <span className="flex items-center gap-1.5 text-amber-700"><ShieldCheck className="size-3.5" /> {t("landing.differential.notDiagnosis")}</span>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* Audiences */}
      <Section id="audiences" className="pt-0 sm:pt-0">
        <SectionHead eyebrow={t("landing.nav.audiences")} title={t("landing.audiencesTitle")} />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <AudienceCard audience={audience("forDoctors")} icon={Stethoscope} badge={t("auth.subscriptionFree")} dark index={0} />
          <AudienceCard audience={audience("forStudents")} icon={GraduationCap} index={1} />
        </div>
      </Section>

      {/* Pipeline */}
      <Section id="how" className="pt-0 sm:pt-0">
        <SectionHead eyebrow={t("landing.nav.how")} title={t("landing.howTitle")} subtitle={t("landing.howSubtitle")} />
        <div className="relative grid gap-4 lg:grid-cols-5">
          <div className="absolute top-8 right-[10%] left-[10%] hidden h-px overflow-hidden bg-line lg:block">
            <motion.div
              className="h-full w-1/4 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
              animate={{ x: ["-100%", "400%"] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          {list<Item>("landing.steps").map((step, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length];
            const last = i === STEP_ICONS.length - 1;
            return (
              <motion.div key={step.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.1 }} className="relative">
                <div className={`relative mx-auto flex size-16 items-center justify-center rounded-2xl border shadow-soft lg:mx-0 ${last ? "border-transparent bg-brand text-on-brand shadow-glow" : "border-line bg-surface text-slate-700"}`}>
                  <Icon className="size-6" />
                  <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-line bg-surface font-mono text-[10px] font-semibold text-slate-500">{i + 1}</span>
                </div>
                <div className="mt-5 text-center lg:text-left">
                  <div className="font-semibold text-ink">{step.title}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.text}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* Safety standard: always rendered on the dark reading-room palette */}
      <section id="safety" className="scroll-mt-20 px-4 sm:px-6">
        <div data-theme="dark" className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[#07110b] px-6 py-16 text-ink sm:px-12 sm:py-20">
          <div className="grid-lines absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
          <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(92,255,99,0.18),transparent)]" />
          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionHead eyebrow={t("landing.nav.safety")} title={t("landing.safetyTitle")} subtitle={t("landing.safetySubtitle")} />
              <div className="mb-12 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 pr-5">
                <Logo className="size-11" />
                <div className="font-mono text-[11px] leading-relaxed text-slate-500">
                  <div className="text-sm font-semibold text-ink">8 / 8</div>
                  <div>{t("landing.safetyLive")}</div>
                </div>
              </div>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {list<Item>("landing.safety").map((item, i) => {
                const Icon = SAFETY_ICONS[i % SAFETY_ICONS.length];
                return (
                  <motion.div
                    key={item.title}
                    {...reveal}
                    transition={{ ...reveal.transition, delay: i * 0.05 }}
                    className="group relative bg-[#07110b] p-6 transition hover:bg-[#0b1a11]"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="size-5 text-brand" />
                      <span className="font-mono text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="mt-5 font-semibold text-ink">{item.title}</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{item.text}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Models */}
      <Section id="models">
        <SectionHead eyebrow={t("landing.nav.models")} title={t("landing.modelsTitle")} subtitle={t("landing.modelsSubtitle")} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list<Model>("landing.models").map((model, i) => {
            const Icon = MODEL_ICONS[i % MODEL_ICONS.length];
            return (
              <motion.div key={model.name} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }} className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-raised text-slate-600 transition group-hover:text-emerald-600">
                    <Icon className="size-5" />
                  </span>
                  <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[10.5px] text-slate-500">{model.tag}</span>
                </div>
                <div className="mt-5 font-mono text-[15px] font-semibold text-ink">{model.name}</div>
                <div className="mt-1 text-sm font-medium text-emerald-700">{model.task}</div>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{model.detail}</p>
              </motion.div>
            );
          })}
        </div>
        <motion.div {...reveal} className="mt-10 flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-2">{t("landing.stackTitle")}</span>
          {STACK.map((item) => (
            <span key={item} className="rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs text-slate-600">{item}</span>
          ))}
          <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs text-slate-600">
            <Fingerprint className="size-3.5 text-emerald-600" /> weights fingerprinted
          </span>
        </motion.div>
      </Section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <motion.div {...reveal} className="card relative flex flex-col items-center gap-5 overflow-hidden px-6 py-16 text-center">
          <div className="grid-lines absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="absolute top-1/2 left-1/2 size-80 -translate-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-glow),transparent)] opacity-60" />
          <Logo className="relative size-14" />
          <h2 className="relative text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">{t("landing.ctaTitle")}</h2>
          <p className="relative max-w-lg text-slate-500">{t("landing.ctaText")}</p>
          <div className="relative flex flex-wrap justify-center gap-3">
            <Link href={cta.href} className="btn-primary h-12 rounded-full px-7 text-[15px]">
              {cta.label} <ArrowRight className="size-4" />
            </Link>
            {!user && (
              <Link href="/signin" className="btn-ghost h-12 rounded-full px-6 text-[15px]">{t("common.signIn")}</Link>
            )}
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-400 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo className="size-7" />
            <div>
              <Wordmark />
              <div className="mt-1 font-mono text-[10.5px]">{t("landing.footerNote")}</div>
            </div>
          </div>
          <Disclaimer />
        </div>
      </footer>
    </div>
  );
}
