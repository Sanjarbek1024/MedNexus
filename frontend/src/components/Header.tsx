import { motion } from "framer-motion";
import { Cpu, History, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";

import { api, retryUntilLoaded, type Health } from "../lib/api";
import { Link } from "../lib/router";
import { Disclaimer } from "./Disclaimer";

const NAV = [
  { href: "/", label: "Analyze", icon: ScanLine },
  { href: "/history", label: "History", icon: History },
];

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-9 drop-shadow-[0_6px_14px_rgba(16,185,129,0.35)]" aria-hidden>
      <defs>
        <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo)" />
      <path
        d="M7 17h4l2.5-6 4 11 2.5-5H25"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Header({ path }: { path: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(
    () =>
      retryUntilLoaded(
        api.health,
        (value) => {
          setOffline(false);
          setHealth(value);
        },
        () => setOffline(true),
      ),
    [],
  );

  const active = path === "/history" ? "/history" : path.startsWith("/cases") ? "/history" : "/";

  return (
    <header className="no-print sticky top-0 z-40 border-b border-white/70 bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="MedNexus home">
          <Logo />
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-tight text-ink">MedNexus</div>
            <div className="text-[11px] font-medium text-slate-500">AI decision support</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-2xl bg-white/70 p-1 shadow-soft ring-1 ring-slate-200/60">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
                active === href ? "text-emerald-800" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {active === href && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-xl bg-emerald-50 ring-1 ring-emerald-200"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
                />
              )}
              <Icon className="relative size-4" />
              <span className="relative">{label}</span>
            </Link>
          ))}
        </nav>

        <Disclaimer className="ml-auto" />
        <div className="hidden items-center gap-2 text-xs font-medium text-slate-500 xl:flex">
          <span
            className={`size-2 rounded-full ${
              offline ? "bg-rose-400" : health ? "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.2)]" : "bg-slate-300"
            }`}
          />
          {offline && "Backend offline"}
          {health && (
            <>
              <Cpu className="size-3.5" />
              <span className="uppercase">{health.device}</span>
              <span className="text-slate-300">·</span>
              <span>{health.analyzers.length} analyzers</span>
              <span className="text-slate-300">·</span>
              <span>{health.llm.configured ? "Report AI ready" : "Report AI off"}</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
