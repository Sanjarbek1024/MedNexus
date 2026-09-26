import { motion } from "framer-motion";
import { Check, CircleAlert, KeyRound, LoaderCircle, Stethoscope } from "lucide-react";
import { useState, type FormEvent } from "react";

import { LanguageSwitch, Logo, ThemeToggle, Wordmark } from "../components/Brand";
import { Disclaimer } from "../components/Disclaimer";
import { useI18n } from "../i18n";
import { ApiError, type Role } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link } from "../lib/router";

// Accounts created by scripts/seed_demo.py (shown so judges and testers can sign in quickly).
const DEMO_PASSWORD = "MedNexus-Demo-2026";
const DEMO_ACCOUNTS: { email: string; role: Role }[] = [{ email: "doctor@mednexus.uz", role: "doctor" }];

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const { t } = useI18n();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode === "signup";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (signup) await signUp({ email, full_name: fullName, password, role: "doctor" });
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
            <Wordmark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
        <motion.form
          key={mode}
          onSubmit={submit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto my-auto w-full max-w-sm py-10"
        >
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-ink">{signup ? t("auth.createTitle") : t("auth.welcome")}</h1>
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
              <div className="flex items-start gap-2.5 rounded-xl border border-line bg-raised px-3 py-2.5 text-xs text-slate-600">
                <Stethoscope className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>
                  <span className="block font-semibold text-ink">{t("auth.roleDoctor")}</span>
                  {t("auth.subscriptionFree")}
                </span>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-6 h-11 w-full rounded-xl">
            {busy && <LoaderCircle className="size-4 animate-spin" />} {signup ? t("common.signUp") : t("common.signIn")}
          </button>
          <p className="mt-5 text-center text-sm text-slate-500">
            {signup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
            <Link href={signup ? "/signin" : "/signup"} className="font-semibold text-emerald-700 hover:underline">
              {signup ? t("common.signIn") : t("common.signUp")}
            </Link>
          </p>

          {!signup && (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-raised p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
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
                    className="flex items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left text-sm transition hover:border-line hover:bg-surface"
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

      <div data-theme="dark" className="relative hidden overflow-hidden bg-[#07110b] text-ink lg:block">
        <div className="grid-lines absolute inset-0 opacity-80 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_75%)]" />
        <div className="absolute -top-32 -right-32 size-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(92,255,99,0.22),transparent)]" />
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="flex items-center gap-3">
            <Logo className="size-11" />
            <div className="font-mono text-[11px] leading-relaxed text-slate-500">
              <div className="text-sm font-semibold text-ink">MedNexus</div>
              {t("shell.research")}
            </div>
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6 }}>
            <div className="text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              {t("landing.titleLead") && <>{t("landing.titleLead")} </>}
              <span className="text-brand-gradient">{t("landing.titleAccent")}</span> {t("landing.titleTail")}
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              {[0, 1, 2, 4].map((i, n) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + n * 0.12 }}
                  className="flex items-center gap-4 bg-[#07110b] px-5 py-4"
                >
                  <span className="font-mono text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t(`landing.safety.${i}.title`)}</div>
                    <div className="truncate text-xs text-slate-500">{t(`landing.safety.${i}.text`)}</div>
                  </div>
                  <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-brand ring-1 ring-emerald-200">
                    <Check className="size-3" />
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
          <div className="font-mono text-[11px] text-slate-500">{t("landing.footerNote")}</div>
        </div>
      </div>
    </div>
  );
}
