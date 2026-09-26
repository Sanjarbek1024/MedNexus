import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronsLeft,
  FolderHeart,
  ChevronsRight,
  Columns2,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScanLine,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import type { Language, Role } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { Link, navigate } from "../lib/router";
import { Disclaimer } from "./Disclaimer";

const COLLAPSED_KEY = "mednexus.sidebar";

export function Logo({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 drop-shadow-[0_6px_14px_rgba(16,185,129,0.35)]`} aria-hidden>
      <defs>
        <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo)" />
      <path d="M7 17h4l2.5-6 4 11 2.5-5H25" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV: { href: string; key: string; icon: LucideIcon; roles: Role[] }[] = [
  { href: "/my", key: "myScans", icon: FolderHeart, roles: ["user"] },
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, roles: ["doctor"] },
  { href: "/worklist", key: "worklist", icon: ListChecks, roles: ["doctor"] },
  { href: "/analyze", key: "analyze", icon: ScanLine, roles: ["user", "doctor"] },
  { href: "/compare", key: "compare", icon: Columns2, roles: ["doctor"] },
  { href: "/training", key: "training", icon: GraduationCap, roles: ["doctor"] },
  { href: "/monitor", key: "monitor", icon: ShieldCheck, roles: ["doctor"] },
  { href: "/settings", key: "settings", icon: Settings, roles: ["user", "doctor"] },
];

export function LanguageSwitch({ onChange }: { onChange?: (language: Language) => void }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div role="group" aria-label={t("common.language")} className="flex rounded-xl bg-white/80 p-0.5 ring-1 ring-slate-200">
      {(["uz", "en", "ru"] as const).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={language === id}
          onClick={() => (onChange ? onChange(id) : setLanguage(id))}
          className={`rounded-lg px-2 py-1 text-xs font-bold uppercase transition ${
            language === id ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

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
        className="flex items-center gap-2 rounded-2xl p-1 pr-3 transition hover:bg-white/80"
      >
        <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white">
          {initials(user.full_name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold whitespace-nowrap text-ink">{user.full_name}</span>
          <span className="block text-[11px] text-slate-500">{t(`roles.${user.role}`)}</span>
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xl shadow-slate-900/10"
          >
            <div className="px-3 py-2 text-xs text-slate-500">{user.email}</div>
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Settings className="size-4" /> {t("nav.settings")}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await signOut();
                navigate("/signin", { replace: true });
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="size-4" /> {t("common.signOut")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItems({ path, collapsed, onNavigate }: { path: string; collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const active = (href: string) => path === href || ((href === "/worklist" || href === "/my") && path.startsWith("/cases"));
  return (
    <nav className="flex flex-col gap-1" aria-label={t("nav.menu")}>
      {NAV.filter((item) => user && item.roles.includes(user.role)).map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          title={collapsed ? t(`nav.${key}`) : undefined}
          aria-current={active(href) ? "page" : undefined}
          className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
            active(href) ? "text-emerald-800" : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
          } ${collapsed ? "justify-center" : ""}`}
        >
          {active(href) && (
            <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-emerald-50 ring-1 ring-emerald-200" transition={{ type: "spring", bounce: 0.2, duration: 0.45 }} />
          )}
          <Icon className="relative size-[18px] shrink-0" />
          {!collapsed && <span className="relative truncate">{t(`nav.${key}`)}</span>}
        </Link>
      ))}
    </nav>
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

  return (
    <div className="flex min-h-screen">
      <motion.aside
        animate={{ width: collapsed ? 76 : 248 }}
        transition={{ type: "spring", bounce: 0.1, duration: 0.35 }}
        className="no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/70 bg-white/55 px-3 py-4 backdrop-blur-xl lg:flex"
      >
        <Link href={user ? homeFor(user.role) : "/"} className={`mb-6 flex items-center gap-2.5 px-2 ${collapsed ? "justify-center" : ""}`}>
          <Logo />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-tight text-ink">MedNexus</div>
              <div className="text-[11px] font-medium text-slate-500">{t("common.tagline")}</div>
            </div>
          )}
        </Link>
        <NavItems path={path} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className="mt-auto flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-white/70 hover:text-slate-600"
          aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> {t("nav.collapse")}</>}
        </button>
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
              className="absolute inset-y-0 left-0 flex w-64 flex-col bg-canvas p-4 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2.5"><Logo /><span className="font-extrabold text-ink">MedNexus</span></div>
                <button type="button" onClick={() => setMobileOpen(false)} aria-label={t("common.close")} className="rounded-lg p-1 text-slate-400">
                  <X className="size-5" />
                </button>
              </div>
              <NavItems path={path} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-white/70 bg-canvas/75 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("nav.menu")}>
            <Menu className="size-5" />
          </button>
          <Disclaimer className="hidden min-w-0 md:flex" />
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <LanguageSwitch onChange={setLanguage} />
            <UserMenu />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
