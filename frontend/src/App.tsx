import { MotionConfig, motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";

import { AppShell } from "./components/AppShell";
import type { Role } from "./lib/api";
import { homeFor, useAuth } from "./lib/auth";
import { navigate, useLocation } from "./lib/router";
import { AuthPage } from "./pages/AuthPage";
import { LandingPage } from "./pages/LandingPage";

// Pages load as separate chunks; the landing and sign-in pages ship in the main bundle.
const AnalyzePage = lazy(() => import("./pages/AnalyzePage").then((m) => ({ default: m.AnalyzePage })));
const CasePage = lazy(() => import("./pages/CasePage").then((m) => ({ default: m.CasePage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const MyScansPage = lazy(() => import("./pages/MyScansPage").then((m) => ({ default: m.MyScansPage })));
const MonitorPage = lazy(() => import("./pages/MonitorPage").then((m) => ({ default: m.MonitorPage })));
const ReportPage = lazy(() => import("./pages/ReportPage").then((m) => ({ default: m.ReportPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const TrainingPage = lazy(() => import("./pages/TrainingPage").then((m) => ({ default: m.TrainingPage })));
const WorklistPage = lazy(() => import("./pages/WorklistPage").then((m) => ({ default: m.WorklistPage })));

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      <LoaderCircle className="size-8 animate-spin" />
    </div>
  );
}

// Clinical workspace pages; people using MedNexus for their own scans are sent to "My scans".
const DOCTOR_ONLY = new Set(["/dashboard", "/worklist", "/compare", "/training", "/monitor", "/history"]);

function appPage(path: string, query: URLSearchParams, role: Role) {
  const caseMatch = /^\/cases\/(\d+)$/.exec(path);
  if (caseMatch) return <CasePage caseId={Number(caseMatch[1])} />;
  if (role !== "doctor" && DOCTOR_ONLY.has(path)) return <Redirect to="/my" />;
  switch (path) {
    case "/my":
      return role === "doctor" ? <Redirect to="/worklist" /> : <MyScansPage />;
    case "/dashboard":
      return <DashboardPage />;
    case "/worklist":
      return <WorklistPage />;
    case "/analyze":
      return <AnalyzePage />;
    case "/compare":
      return <ComparePage query={query} />;
    case "/training":
      return <TrainingPage />;
    case "/monitor":
      return <MonitorPage />;
    case "/settings":
      return <SettingsPage />;
    case "/history":
      return <Redirect to="/worklist" />;
    default:
      return <Redirect to={homeFor(role)} />;
  }
}

function Routes() {
  const { user, ready } = useAuth();
  const { path, query } = useLocation();

  if (path === "/") return <LandingPage />;
  if (!ready) return <Splash />;
  if (path === "/signin" || path === "/signup") {
    return user ? <Redirect to={query.get("next") ?? homeFor(user.role)} /> : <AuthPage mode={path === "/signin" ? "signin" : "signup"} />;
  }
  if (!user) return <Redirect to={`/signin?next=${encodeURIComponent(path + window.location.search)}`} />;

  const reportMatch = /^\/cases\/(\d+)\/report$/.exec(path);
  if (reportMatch && user.role !== "doctor") return <Redirect to={`/cases/${reportMatch[1]}`} />;
  if (reportMatch) {
    return (
      <Suspense fallback={<Splash />}>
        <ReportPage caseId={Number(reportMatch[1])} />
      </Suspense>
    );
  }

  return (
    <AppShell path={path}>
      <Suspense fallback={<div className="flex justify-center py-32 text-slate-400"><LoaderCircle className="size-7 animate-spin" /></div>}>
        <motion.div
          key={path}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {appPage(path, query, user.role)}
        </motion.div>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Routes />
    </MotionConfig>
  );
}
