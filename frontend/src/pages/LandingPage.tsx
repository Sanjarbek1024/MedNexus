import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bone,
  BookOpenCheck,
  Brain,
  Building2,
  CircleCheck,
  Clock,
  FileQuestion,
  Fingerprint,
  HeartPulse,
  Layers,
  ListChecks,
  MessagesSquare,
  Radar,
  ScanLine,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
  UserCheck,
} from "lucide-react";

import { LanguageSwitch, Logo } from "../components/AppShell";
import { Disclaimer } from "../components/Disclaimer";
import { useI18n } from "../i18n";
import { homeFor, useAuth } from "../lib/auth";
import { Link } from "../lib/router";

type Item = { title: string; text: string };
type Audience = { title: string; text: string; points: readonly string[] };

const PROBLEM_ICONS = [FileQuestion, HeartPulse, Clock, Siren];
const FEATURE_ICONS = [Stethoscope, Bone, Brain, ListChecks, MessagesSquare, Building2];
const SAFETY_ICONS = [ShieldCheck, Radar, BookOpenCheck, UserCheck, Fingerprint, Layers];

/** A stylized chest radiograph drawn in SVG (no patient data, no third-party image). */
function XrayArt() {
  return (
    <svg viewBox="0 0 400 440" className="size-full" aria-hidden>
      <defs>
        <radialGradient id="body" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#6b7a76" />
          <stop offset="1" stopColor="#101816" />
        </radialGradient>
        <radialGradient id="lung" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#0b1210" />
          <stop offset="1" stopColor="#1f2a27" />
        </radialGradient>
        <radialGradient id="heart" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c9d2cf" stopOpacity="0.9" />
          <stop offset="1" stopColor="#8a9793" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id="heat" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#dc2626" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#f97316" stopOpacity="0.5" />
          <stop offset="1" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="440" fill="#070c0b" />
      <path d="M40 440 C40 250 70 120 200 95 C330 120 360 250 360 440 Z" fill="url(#body)" />
      <path d="M108 360 C80 300 88 170 150 130 C185 140 188 250 184 360 C160 372 130 372 108 360 Z" fill="url(#lung)" />
      <path d="M292 360 C320 300 312 170 250 130 C215 140 212 250 216 360 C240 372 270 372 292 360 Z" fill="url(#lung)" />
      <rect x="190" y="90" width="20" height="350" rx="8" fill="#c7d0cd" opacity="0.35" />
      {[150, 185, 220, 255, 290, 325].map((y) => (
        <g key={y} opacity="0.28" stroke="#e5ecea" strokeWidth="5" fill="none">
          <path d={`M195 ${y} C150 ${y - 30} 105 ${y - 10} 88 ${y + 40}`} />
          <path d={`M205 ${y} C250 ${y - 30} 295 ${y - 10} 312 ${y + 40}`} />
        </g>
      ))}
      <path d="M110 118 C150 108 180 112 196 124 M290 118 C250 108 220 112 204 124" stroke="#e5ecea" strokeWidth="7" opacity="0.4" fill="none" strokeLinecap="round" />
      <ellipse cx="228" cy="300" rx="62" ry="54" fill="url(#heart)" />
      <motion.ellipse
        cx="140"
        cy="200"
        rx="48"
        ry="56"
        fill="url(#heat)"
        animate={{ opacity: [0.55, 0.95, 0.55], scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "140px 200px" }}
      />
      <path d="M108 360 C80 300 88 170 150 130 C185 140 188 250 184 360 C160 372 130 372 108 360 Z" fill="none" stroke="#34d399" strokeWidth="1.6" />
      <path d="M292 360 C320 300 312 170 250 130 C215 140 212 250 216 360 C240 372 270 372 292 360 Z" fill="none" stroke="#34d399" strokeWidth="1.6" />
      <ellipse cx="228" cy="300" rx="62" ry="54" fill="none" stroke="#fb7185" strokeWidth="1.6" />
    </svg>
  );
}

function ProductPreview() {
  const { t } = useI18n();
  const checks = t("safety.groups.quality") + "|" + t("safety.groups.distribution") + "|" + t("safety.groups.agreement");
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-emerald-200/50 via-teal-100/40 to-transparent blur-2xl" />
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[28px] shadow-2xl shadow-emerald-900/20 ring-1 ring-white/60"
      >
        <div className="relative aspect-[400/440]">
          <XrayArt />
          <motion.div
            className="pointer-events-none absolute inset-x-0 h-20"
            animate={{ top: ["-10%", "95%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
          >
            <div className="h-full bg-gradient-to-b from-transparent via-emerald-400/15 to-emerald-400/5" />
            <div className="h-0.5 bg-emerald-300 shadow-[0_0_24px_6px_rgba(52,211,153,0.7)]" />
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
        transition={{ delay: 0.5, y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
        className="absolute -right-4 top-10 w-52 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-xl backdrop-blur-xl sm:-right-10"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{t("landing.previewFinding")}</span>
          <span className="text-lg font-extrabold tabular-nums text-ink">0.80</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500" initial={{ width: 0 }} animate={{ width: "80%" }} transition={{ delay: 0.9, duration: 1 }} />
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="chip bg-rose-50 text-rose-700 ring-1 ring-rose-200">
            <span className="size-1.5 animate-pulse rounded-full bg-rose-500" /> {t("landing.previewUrgent")}
          </span>
          <span className="chip bg-amber-50 text-amber-700 ring-1 ring-amber-200">{t("landing.previewStatus")}</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0, y: [0, 6, 0] }}
        transition={{ delay: 0.8, y: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}
        className="absolute -left-4 bottom-10 w-56 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-xl backdrop-blur-xl sm:-left-12"
      >
        <div className="eyebrow mb-2">{t("safety.title")}</div>
        {checks.split("|").map((label, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 + i * 0.35 }}
            className="flex items-center gap-2 py-0.5 text-xs font-semibold text-slate-700"
          >
            <CircleCheck className="size-4 text-emerald-500" /> {label}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} className="mb-10 max-w-2xl">
        <h2 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-2 text-slate-500">{subtitle}</p>}
      </motion.div>
      {children}
    </section>
  );
}

function Cards({ items, icons, columns = "sm:grid-cols-2 lg:grid-cols-3" }: { items: readonly Item[]; icons: typeof PROBLEM_ICONS; columns?: string }) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {items.map((item, i) => {
        const Icon = icons[i % icons.length];
        return (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: i * 0.06 }}
            className="card p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Icon className="size-5" />
            </div>
            <div className="mt-4 font-bold text-ink">{item.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.text}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

function AudienceCard({ audience, icon: Icon, featured = false, badge }: { audience: Audience; icon: typeof HeartPulse; featured?: boolean; badge?: string }) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      className={`relative flex flex-col overflow-hidden rounded-[28px] p-7 sm:p-8 ${
        featured ? "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white shadow-2xl shadow-emerald-900/20" : "card"
      }`}
    >
      {featured && <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />}
      <div className="relative flex items-center gap-3">
        <div className={`flex size-12 items-center justify-center rounded-2xl ${featured ? "bg-white/15 ring-1 ring-white/25" : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"}`}>
          <Icon className="size-6" />
        </div>
        <h3 className={`text-2xl font-extrabold tracking-tight ${featured ? "" : "text-ink"}`}>{audience.title}</h3>
      </div>
      <p className={`relative mt-4 leading-relaxed ${featured ? "text-emerald-50/90" : "text-slate-500"}`}>{audience.text}</p>
      <ul className="relative mt-5 space-y-2.5">
        {audience.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm font-semibold">
            <CircleCheck className={`mt-0.5 size-4 shrink-0 ${featured ? "text-emerald-200" : "text-emerald-500"}`} />
            <span className={featured ? "" : "text-slate-700"}>{point}</span>
          </li>
        ))}
      </ul>
      <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-7">
        <Link href="/signup" className={`btn rounded-full px-6 py-3 ${featured ? "bg-white text-emerald-700 shadow-lg hover:bg-emerald-50" : "btn-primary"}`}>
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
  const audience = (key: "forPeople" | "forDoctors"): Audience => ({
    title: t(`landing.${key}.title`),
    text: t(`landing.${key}.text`),
    points: list<string>(`landing.${key}.points`),
  });

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-white/70 bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-extrabold tracking-tight text-ink">MedNexus</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-slate-500 md:flex">
            <a href="#audiences" className="hover:text-ink">{t("landing.audiencesTitle")}</a>
            <a href="#problem" className="hover:text-ink">{t("landing.problemTitle")}</a>
            <a href="#how" className="hover:text-ink">{t("landing.howTitle")}</a>
            <a href="#safety" className="hover:text-ink">{t("landing.safetyTitle")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitch />
            <Link href={home ?? "/signin"} className="btn-primary rounded-full px-5">
              {user ? t("landing.openApp") : t("common.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="chip max-w-full bg-emerald-50 py-1 whitespace-normal! text-emerald-700 ring-1 ring-emerald-200">
            <Sparkles className="size-3.5" /> {t("landing.badge")}
          </span>
          <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight text-balance text-ink sm:text-5xl">{t("landing.title")}</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-500">{t("landing.subtitle")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {t("landing.modalities").split(" · ").map((item, i) => {
              const Icon = [Stethoscope, Bone, Brain][i % 3];
              return (
                <span key={item} className="chip bg-white/80 py-1.5 text-slate-700 shadow-soft ring-1 ring-slate-200/70">
                  <Icon className="size-3.5 text-emerald-600" /> {item}
                </span>
              );
            })}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={cta.href} className="btn-primary rounded-full px-7 py-3.5 text-base">
              {cta.label} <ArrowRight className="size-5" />
            </Link>
            <a href="#how" className="btn-ghost rounded-full px-6 py-3.5 text-base">
              <ScanLine className="size-5" /> {t("landing.howTitle")}
            </a>
          </div>
          <Disclaimer className="mt-8 w-fit" />
        </motion.div>
        <ProductPreview />
      </section>

      <Section id="audiences" title={t("landing.audiencesTitle")}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <AudienceCard audience={audience("forPeople")} icon={HeartPulse} featured />
          <AudienceCard audience={audience("forDoctors")} icon={Stethoscope} badge={t("auth.subscriptionFree")} />
        </div>
      </Section>

      <div id="problem">
        <Section title={t("landing.problemTitle")}>
          <Cards items={list<Item>("landing.problems")} icons={PROBLEM_ICONS} columns="sm:grid-cols-2 lg:grid-cols-4" />
        </Section>
      </div>

      <Section id="how" title={t("landing.howTitle")}>
        <div className="relative grid gap-6 md:grid-cols-3">
          <div className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 md:block" />
          {list<Item>("landing.steps").map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className="relative text-center"
            >
              <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-xl font-extrabold text-white shadow-glow">
                {i + 1}
              </div>
              <div className="mt-4 font-bold text-ink">{step.title}</div>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{step.text}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      <Section title={t("landing.featuresTitle")}>
        <Cards items={list<Item>("landing.features")} icons={FEATURE_ICONS} />
      </Section>

      <section id="safety" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white shadow-2xl shadow-emerald-900/20 sm:p-12">
          <div className="max-w-2xl">
            <ShieldCheck className="size-10 text-emerald-200" />
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight">{t("landing.safetyTitle")}</h2>
            <p className="mt-2 text-emerald-50/90">{t("landing.safetySubtitle")}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list<Item>("landing.safety").map((item, i) => {
              const Icon = SAFETY_ICONS[i];
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur"
                >
                  <Icon className="size-5 text-emerald-200" />
                  <div className="mt-3 font-bold">{item.title}</div>
                  <p className="mt-1 text-sm text-emerald-50/80">{item.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="card flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">{t("landing.ctaTitle")}</h2>
          <p className="max-w-lg text-slate-500">{t("landing.ctaText")}</p>
          <Link href={cta.href} className="btn-primary rounded-full px-7 py-3 text-base">
            {cta.label} <ArrowRight className="size-5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/70 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-400 sm:px-6">
          <div className="flex items-center gap-2"><Logo className="size-6" /> MedNexus</div>
          <Disclaimer />
        </div>
      </footer>
    </div>
  );
}
