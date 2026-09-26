import { Moon, Sun } from "lucide-react";

import { useI18n } from "../i18n";
import type { Language } from "../lib/api";
import { useTheme } from "../lib/theme";

/** The MedNexus mark: three staggered bars in the brand lime. */
export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="-2 -6 58 58" className={`${className} shrink-0`} aria-hidden>
      <g fill="var(--color-brand)" stroke="var(--color-brand)" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M11 12.4 38 2.2v8.9L11 21.4z" />
        <path d="M2.2 29.4 29.4 19v9.2L2.2 38.6z" />
        <path d="M24.2 33.6 52 23.2v9.2L24.2 42.8z" />
      </g>
    </svg>
  );
}

/** App-icon tile: the lime mark on a dark tile keeps contrast on light and dark surfaces alike. */
export function Logo({ className = "size-9" }: { className?: string }) {
  return (
    <span
      className={`${className} relative flex shrink-0 items-center justify-center rounded-[28%] bg-[#07110b] shadow-[0_6px_18px_-6px_rgba(34,212,44,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-black/5`}
      aria-hidden
    >
      <LogoMark className="size-[62%]" />
    </span>
  );
}

export function Wordmark({ sub }: { sub?: string }) {
  return (
    <span className="leading-none">
      <span className="block text-[15px] font-semibold tracking-tight text-ink">
        Med<span className="text-brand-ink">Nexus</span>
      </span>
      {sub && <span className="mt-1 block font-mono text-[10px] tracking-wide text-slate-400 uppercase">{sub}</span>}
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = t(theme === "dark" ? "shell.theme.light" : "shell.theme.dark");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="relative flex size-9 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface text-slate-500 transition hover:text-ink"
    >
      <Sun className={`absolute size-4 transition duration-300 ${theme === "dark" ? "scale-100 rotate-0" : "scale-0 -rotate-90"}`} />
      <Moon className={`absolute size-4 transition duration-300 ${theme === "dark" ? "scale-0 rotate-90" : "scale-100 rotate-0"}`} />
    </button>
  );
}

export function LanguageSwitch({ onChange }: { onChange?: (language: Language) => void }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div role="group" aria-label={t("common.language")} className="flex h-9 items-center rounded-xl border border-line bg-surface p-0.5">
      {(["uz", "en", "ru"] as const).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={language === id}
          onClick={() => (onChange ? onChange(id) : setLanguage(id))}
          className={`h-full rounded-[9px] px-2 font-mono text-[11px] font-semibold uppercase transition ${
            language === id ? "bg-ink text-canvas" : "text-slate-500 hover:text-ink"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}
