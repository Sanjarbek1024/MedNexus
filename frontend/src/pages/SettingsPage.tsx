import { BadgeCheck, KeyRound, LoaderCircle, Server, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { LanguageSwitch } from "../components/AppShell";
import { PageHeader } from "../components/ui";
import { useI18n } from "../i18n";
import { api, type Health } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";

function Section({ icon: Icon, title, children, hint }: { icon: typeof UserRound; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 font-bold text-ink"><Icon className="size-5 text-emerald-600" /> {title}</h2>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { user, update, setLanguage } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? "");
  const [passwords, setPasswords] = useState({ current: "", next: "", repeat: "" });
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.health().then(setHealth, () => undefined);
  }, []);
  if (!user) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    try {
      update(await api.updateProfile({ full_name: name }));
      toast(t("settings.profileSaved"));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwords.next !== passwords.repeat) {
      toast(t("settings.passwordMismatch"), "error");
      return;
    }
    setBusy("password");
    try {
      await api.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", repeat: "" });
      toast(t("settings.passwordChanged"));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader eyebrow={t("nav.settings")} title={t("settings.title")} />
      <Section icon={UserRound} title={t("settings.profile")}>
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="eyebrow">{t("auth.fullName")}</span><input className="field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required /></label>
          <label className="block"><span className="eyebrow">{t("auth.email")}</span><input className="field mt-1.5 bg-slate-50" value={user.email} disabled /></label>
          <div>
            <span className="eyebrow">{t("auth.role")}</span>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 font-semibold text-ink">
              {t(`roles.${user.role}`)}
              {user.role === "doctor" && (
                <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{t("auth.subscriptionFree")}</span>
              )}
            </div>
          </div>
          <div><span className="eyebrow">{t("common.language")}</span><div className="mt-2"><LanguageSwitch onChange={setLanguage} /></div></div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy !== null}>{busy === "profile" && <LoaderCircle className="size-4 animate-spin" />} {t("settings.saveProfile")}</button>
          </div>
        </form>
      </Section>
      <Section icon={KeyRound} title={t("settings.password")} hint={t("auth.passwordRules")}>
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-3">
          {(["current", "next", "repeat"] as const).map((key) => (
            <label key={key} className="block">
              <span className="eyebrow">{t(key === "current" ? "settings.currentPassword" : key === "next" ? "settings.newPassword" : "settings.confirmPassword")}</span>
              <input
                type="password"
                className="field mt-1.5"
                value={passwords[key]}
                onChange={(e) => setPasswords({ ...passwords, [key]: e.target.value })}
                autoComplete={key === "current" ? "current-password" : "new-password"}
                minLength={key === "current" ? 1 : 10}
                required
              />
            </label>
          ))}
          <div className="sm:col-span-3">
            <button type="submit" className="btn-primary" disabled={busy !== null}>{busy === "password" && <LoaderCircle className="size-4 animate-spin" />} {t("settings.password")}</button>
          </div>
        </form>
      </Section>
      {user.role === "doctor" && (
        <Section icon={BadgeCheck} title={t("settings.subscription")} hint={t("settings.subscriptionHint")}>
          <span className="chip bg-emerald-50 py-1.5 text-sm text-emerald-700 ring-1 ring-emerald-200">
            <BadgeCheck className="size-4" /> {t("settings.subscriptionFree")}
          </span>
        </Section>
      )}
      {health && (
        <Section icon={Server} title={t("settings.about")}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="eyebrow">Version</dt><dd className="mt-1 font-mono">{health.version} · {health.device} · {health.database}</dd></div>
            <div><dt className="eyebrow">LLM</dt><dd className="mt-1 font-mono">{health.llm.model} {health.llm.configured ? "✓" : "—"}</dd></div>
            <div className="sm:col-span-2">
              <dt className="eyebrow">Analyzers</dt>
              <dd className="mt-1 space-y-1">{health.analyzers.map((a) => <div key={a.id} className="text-slate-600">{a.label} <span className="font-mono text-xs text-slate-400">{Object.values(a.versions).join(" ")}</span></div>)}</dd>
            </div>
          </dl>
        </Section>
      )}
    </div>
  );
}
