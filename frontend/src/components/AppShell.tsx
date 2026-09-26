import { AnimatePresence, motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Cpu, LogOut, Menu, Search, Settings, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import { api, type Health } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { Link, navigate } from "../lib/router";
import { LanguageSwitch, Logo, ThemeToggle, Wordmark } from "./Brand";
import { CommandPalette, openPalette } from "./CommandPalette";
import { Disclaimer } from "./Disclaimer";
import { NAV, type NavItem } from "./nav";

export { LanguageSwitch, Logo } from "./Brand";

const COLLAPSED_KEY = "mednexus.sidebar";

function initials(name: string): string {
  return name.replace(/^Dr\.?\s*/i, "").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  if (!user) return null;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 rounded-xl p-1 pr-2.5 transition hover:bg-slate-100"
      >
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-ink font-mono text-[11px] font-semibold text-canvas">
          {initials(user.full_name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold whitespace-nowrap text-ink">{user.full_name}</span>
          <span className="block text-[11px] text-slate-500">{t(`roles.${user.role}`)}</span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-60 origin-top-right rounded-2xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
          >
            <div className="px-3 py-2">
              <div className="text-sm font-semibold text-ink">{user.full_name}</div>
              <div className="truncate font-mono text-[11px] text-slate-500">{user.email}</div>
            </div>
            <div className="my-1 h-px bg-line" />
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              <Settings className="size-4" /> {t("nav.settings")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await signOut();
                navigate("/signin", { replace: true });
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="size-4" /> {t("common.signOut")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavLink({ item, path, collapsed, onNavigate }: { item: NavItem; path: string; collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const active = path === item.href || ((item.href === "/worklist" || item.href === "/my") && path.startsWith("/cases"));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? t(`nav.${item.key}`) : undefined}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition ${
        active ? "text-ink" : "text-slate-500 hover:bg-slate-100/70 hover:text-ink"
      } ${collapsed ? "justify-center" : ""}`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl border border-line bg-surface shadow-soft"
          transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
        >
          <span className="absolute top-1/2 -left-3 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand shadow-[0_0_12px_var(--color-glow)]" />
        </motion.span>
      )}
      <Icon className={`relative size-[18px] shrink-0 ${active ? "text-emerald-600" : ""}`} />
      {!collapsed && <span className="relative truncate">{t(`nav.${item.key}`)}</span>}
    </Link>
  );
}

function NavItems({ path, collapsed, onNavigate }: { path: string; collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const items = NAV.filter((item) => user && item.roles.includes(user.role));
  const groups = [
    { id: "workspace", label: t("shell.workspace") },
    { id: "safety", label: t("shell.safetyGroup") },
    { id: "account", label: "" },
  ] as const;
  return (
    <nav className="flex flex-col gap-5" aria-label={t("nav.menu")}>
      {groups.map((group) => {
        const members = items.filter((item) => item.group === group.id);
        if (!members.length) return null;
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            {group.label && !collapsed && <div className="eyebrow mb-1.5 px-3">{group.label}</div>}
            {group.label && collapsed && <div className="mx-auto mb-1.5 h-px w-6 bg-line" />}
            {members.map((item) => (
              <NavLink key={item.href} item={item} path={path} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

/** Live status of the analyzer registry (public /api/health), polled every minute. */
function EngineStatus({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => api.health().then((h) => alive && setHealth(h), () => alive && setHealth(null));
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const online = !!health;
  const dot = (
    <span className="relative flex size-2">
      {online && <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-emerald-400 opacity-70" />}
      <span className={`relative inline-flex size-2 rounded-full ${online ? "bg-emerald-500" : health === null ? "bg-rose-500" : "bg-slate-300"}`} />
    </span>
  );
  if (collapsed) {
    return <div className="flex justify-center py-2" title={t(online ? "shell.engineOnline" : "shell.engineOffline")}>{dot}</div>;
  }
  return (
    <div className="rounded-xl border border-line bg-surface/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink">
        {dot} {t(online ? "shell.engineOnline" : "shell.engineOffline")}
      </div>
      {health && (
        <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] text-slate-500">
          <Cpu className="size-3" /> {t("shell.analyzers", { n: health.analyzers.length })} · {health.device} · v{health.version}
        </div>
      )}
    </div>
  );
}

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const { t } = useI18n();
  const { user, setLanguage } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // storage unavailable
    }
  };

  const brand = (
    <Link href={user ? homeFor(user.role) : "/"} className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : "px-1"}`}>
      <Logo />
      {!collapsed && <Wordmark sub={t("shell.research")} />}
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      <CommandPalette />
      <motion.aside
        animate={{ width: collapsed ? 76 : 256 }}
        transition={{ type: "spring", bounce: 0.1, duration: 0.35 }}
        className="no-print sticky top-0 hidden h-screen shrink-0 flex-col gap-6 border-r border-line bg-raised/70 px-3 py-4 backdrop-blur-xl lg:flex"
      >
        {brand}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pl-3 -ml-3">
          <NavItems path={path} collapsed={collapsed} />
        </div>
        <div className="flex flex-col gap-2">
          <EngineStatus collapsed={collapsed} />
          {!collapsed ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-snug font-medium text-amber-800 ring-1 ring-amber-200/70">
              <ShieldAlert className="mt-px size-3.5 shrink-0" /> {t("common.disclaimer")}
            </div>
          ) : (
            <div className="flex justify-center text-amber-600" title={t("common.disclaimer")}><ShieldAlert className="size-4" /></div>
          )}
          <button
            type="button"
            onClick={toggle}
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> {t("nav.collapse")}</>}
          </button>
        </div>
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", bounce: 0.1, duration: 0.35 }}
              className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 border-r border-line bg-canvas p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5"><Logo /><Wordmark /></div>
                <button type="button" onClick={() => setMobileOpen(false)} aria-label={t("common.close")} className="rounded-lg p-1 text-slate-400">
                  <X className="size-5" />
                </button>
              </div>
              <div className="pl-3 -ml-3">
                <NavItems path={path} collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="mt-auto flex flex-col gap-2">
                <EngineStatus collapsed={false} />
                <Disclaimer className="rounded-xl!" />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass no-print sticky top-0 z-40 flex h-16 items-center gap-3 border-b px-4 sm:px-6">
          <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("nav.menu")}>
            <Menu className="size-5" />
          </button>
          <button
            type="button"
            onClick={openPalette}
            className="flex h-9 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 text-sm text-slate-400 transition hover:border-slate-300 hover:text-slate-600 sm:w-72"
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden truncate sm:inline">{t("shell.search")}</span>
            <kbd className="ml-auto hidden rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageSwitch onChange={setLanguage} />
            <ThemeToggle />
            <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
            <UserMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
