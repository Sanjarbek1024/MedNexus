import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, FileImage, Languages, LogOut, Moon, Search, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { useI18n } from "../i18n";
import { api, type CaseSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { caseNumber } from "../lib/format";
import { navigate } from "../lib/router";
import { useTheme } from "../lib/theme";
import { NAV } from "./nav";

interface Command {
  id: string;
  group: "pages" | "actions" | "cases";
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

export const PALETTE_EVENT = "mednexus:palette";
export const openPalette = () => window.dispatchEvent(new Event(PALETTE_EVENT));

/** Ctrl/⌘+K: jump to any page, run an action, or open a case by number or pseudonym. */
export function CommandPalette() {
  const { t, scanTitle, language } = useI18n();
  const { user, signOut, setLanguage: saveLanguage } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (value) {
            setQuery("");
            setActive(0);
          }
          return !value;
        });
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  // Case search runs against the API (own cases only), debounced.
  useEffect(() => {
    if (!open || !user) return;
    const q = query.trim().replace(/^#0*/, "");
    const timer = window.setTimeout(() => {
      api.cases({ q: q || undefined, sort: "recent", limit: 6 }).then((page) => setCases(page.items), () => setCases([]));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [open, query, user]);

  const commands = useMemo<Command[]>(() => {
    if (!user) return [];
    const go = (href: string) => () => navigate(href);
    const pages: Command[] = NAV.filter((item) => item.roles.includes(user.role)).map((item) => ({
      id: item.href,
      group: "pages",
      label: t(`nav.${item.key}`),
      icon: item.icon,
      run: go(item.href),
    }));
    const next = language === "uz" ? "en" : language === "en" ? "ru" : "uz";
    const actions: Command[] = [
      { id: "theme", group: "actions", label: t(theme === "dark" ? "shell.theme.light" : "shell.theme.dark"), icon: theme === "dark" ? Sun : Moon, run: toggle },
      {
        id: "language",
        group: "actions",
        label: `${t("common.language")}: ${next.toUpperCase()}`,
        icon: Languages,
        run: () => saveLanguage(next),
      },
      {
        id: "signout",
        group: "actions",
        label: t("common.signOut"),
        icon: LogOut,
        run: async () => {
          await signOut();
          navigate("/signin", { replace: true });
        },
      },
    ];
    const found: Command[] = cases.map((c) => ({
      id: `case-${c.id}`,
      group: "cases",
      label: `${caseNumber(c.id)} · ${scanTitle(c)}`,
      hint: c.patient.pseudonym,
      icon: FileImage,
      run: go(`/cases/${c.id}`),
    }));
    const q = query.trim().toLowerCase();
    const match = (c: Command) => !q || c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q);
    return [...pages.filter(match), ...actions.filter(match), ...found];
  }, [user, t, theme, toggle, language, saveLanguage, signOut, cases, query, scanTitle]);

  const clamped = Math.min(active, Math.max(0, commands.length - 1));
  const run = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((clamped + 1) % Math.max(1, commands.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((clamped - 1 + commands.length) % Math.max(1, commands.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(commands[clamped]);
    } else if (event.key === "Escape") {
      close();
    }
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="no-print fixed inset-0 z-[70] flex items-start justify-center bg-ink/25 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("shell.search")}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/20"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={t("shell.searchPlaceholder")}
                aria-label={t("shell.search")}
                className="h-14 w-full bg-transparent text-[15px] text-ink placeholder:text-slate-400 focus:outline-none"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-slate-400">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
              {commands.length === 0 && <div className="px-3 py-8 text-center text-sm text-slate-400">{t("shell.noResults")}</div>}
              {commands.map((command, i) => {
                const header = command.group !== lastGroup;
                lastGroup = command.group;
                const Icon = command.icon;
                return (
                  <div key={command.id}>
                    {header && <div className="eyebrow px-3 pt-3 pb-1.5">{t(`shell.${command.group}`)}</div>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === clamped}
                      onMouseMove={() => setActive(i)}
                      onClick={() => run(command)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        i === clamped ? "bg-slate-100 text-ink" : "text-slate-600"
                      }`}
                    >
                      <Icon className={`size-4 shrink-0 ${i === clamped ? "text-emerald-600" : "text-slate-400"}`} />
                      <span className="flex-1 truncate font-medium">{command.label}</span>
                      {command.hint && <span className="font-mono text-[11px] text-slate-400">{command.hint}</span>}
                      {i === clamped && <CornerDownLeft className="size-3.5 text-slate-400" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-line bg-raised px-4 py-2 font-mono text-[10px] text-slate-400">
              <span><kbd className="font-sans">↑↓</kbd> {t("shell.toNavigate")}</span>
              <span><kbd className="font-sans">↵</kbd> {t("shell.toOpen")}</span>
              <span className="ml-auto">MedNexus</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
