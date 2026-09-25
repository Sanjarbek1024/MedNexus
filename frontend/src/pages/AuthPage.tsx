import { motion } from "framer-motion";
import { CircleAlert, KeyRound, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { LanguageSwitch, Logo } from "../components/AppShell";
import { Disclaimer } from "../components/Disclaimer";
import { useI18n } from "../i18n";
import { ApiError, type Role } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";

// Accounts created by scripts/seed_demo.py (shown so judges and testers can sign in quickly).
const DEMO_PASSWORD = "MedNexus-Demo-2026";
const DEMO_ACCOUNTS: { email: string; role: Role }[] = [
  { email: "radiologist@mednexus.uz", role: "radiologist" },
  { email: "resident@mednexus.uz", role: "resident" },
  { email: "admin@mednexus.uz", role: "admin" },
];

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { t } = useI18n();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("radiologist");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (signup) await signUp({ email, full_name: fullName, password, role });
      else await signIn(email, password);
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 0 ? t("common.offline") : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-extrabold tracking-tight text-ink">MedNexus</span>
          </Link>
          <LanguageSwitch />
        </div>
        <motion.form
          key={mode}
          onSubmit={submit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto my-auto w-full max-w-sm py-10"
        >
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{signup ? t("auth.createTitle") : t("auth.welcome")}</h1>
          <p className="mt-2 text-sm text-slate-500">{signup ? t("auth.createSubtitle") : t("auth.signInSubtitle")}</p>

          <div className="mt-8 space-y-4">
            {signup && (
              <label className="block">
                <span className="eyebrow">{t("auth.fullName")}</span>
                <input className="field mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} autoComplete="name" />
              </label>
            )}
            <label className="block">
              <span className="eyebrow">{t("auth.email")}</span>
              <input className="field mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="block">
              <span className="eyebrow">{t("auth.password")}</span>
              <input
                className="field mt-1.5"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={signup ? 10 : 1}
                autoComplete={signup ? "new-password" : "current-password"}
              />
              {signup && <span className="mt-1 block text-xs text-slate-400">{t("auth.passwordRules")}</span>}
            </label>
            {signup && (
              <div>
                <span className="eyebrow">{t("auth.role")}</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(["radiologist", "resident"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRole(option)}
                      aria-pressed={role === option}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                        role === option ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {t(`roles.${option}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-6 w-full rounded-xl py-3">
            {busy && <LoaderCircle className="size-4 animate-spin" />} {signup ? t("common.signUp") : t("common.signIn")}
          </button>
          <p className="mt-5 text-center text-sm text-slate-500">
            {signup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
            <Link href={signup ? "/signin" : "/signup"} className="font-semibold text-emerald-700 hover:underline">
              {signup ? t("common.signIn") : t("common.signUp")}
            </Link>
          </p>

          {!signup && (
            <div className="mt-8 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <KeyRound className="size-4 text-emerald-600" /> {t("auth.demoTitle")}
              </div>
              <p className="mt-1 text-xs text-slate-500">{t("auth.demoHint", { password: DEMO_PASSWORD })}</p>
              <div className="mt-3 grid gap-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                    }}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  >
                    <span className="font-mono text-xs text-slate-600">{account.email}</span>
                    <span className="chip bg-slate-100 text-slate-600">{t(`roles.${account.role}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.form>
        <Disclaimer className="mx-auto w-fit" />
      </div>

      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 lg:block">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="text-4xl leading-tight font-extrabold tracking-tight">{t("landing.title")}</div>
            <div className="mt-8 grid gap-3">
              {(t("landing.safety.0.title") + "|" + t("landing.safety.3.title") + "|" + t("landing.safety.4.title")).split("|").map((line) => (
                <div key={line} className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
                  <span className="size-2 rounded-full bg-emerald-200" /> <span className="font-semibold">{line}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
