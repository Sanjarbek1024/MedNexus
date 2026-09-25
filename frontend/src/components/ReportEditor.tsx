import { CircleAlert, FileSignature, LoaderCircle, Plus, Save, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import { api, type AnalysisResult, type ReportSections, type ReviewAction } from "../lib/api";
import { canSign, useAuth } from "../lib/auth";
import { LEVEL_STYLES } from "../lib/format";
import { useToast } from "../lib/toast";
import { Drawer } from "./ui";

type Decision = "agree" | "disagree";

function initialSections(result: AnalysisResult): ReportSections {
  const source = result.physician_report ?? result.suggested_report;
  return { findings: source?.findings ?? "", impression: source?.impression ?? "", recommendations: source?.recommendations ?? "" };
}

interface EditorProps {
  result: AnalysisResult;
  action: ReviewAction;
  onClose: () => void;
  onUpdate: (r: AnalysisResult) => void;
}

export function ReportEditor({ result, action, onClose, onUpdate }: Omit<EditorProps, "action"> & { action: ReviewAction | null }) {
  const { t } = useI18n();
  return (
    <Drawer open={action !== null} onClose={onClose} label={t("review.editorTitle")} width="max-w-2xl">
      {action && <EditorBody key={`${action}-${result.case_id}`} result={result} action={action} onClose={onClose} onUpdate={onUpdate} />}
    </Drawer>
  );
}

function EditorBody({ result, action, onClose, onUpdate }: EditorProps) {
  const { t, finding } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [sections, setSections] = useState<ReportSections>(() => initialSections(result));
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(result.findings.map((f) => [
      f.name, action === "reject" ? "disagree" : (result.review?.finding_decisions[f.name] ?? "agree"),
    ])),
  );
  const [added, setAdded] = useState<string[]>(() => result.review?.added_findings ?? []);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"draft" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidates = [...result.other_scores.map((s) => s.name), ...result.not_assessed].filter((name) => !added.includes(name));
  const signer = canSign(user?.role);
  const edited = JSON.stringify(sections) !== JSON.stringify(initialSections(result));
  const effective: ReviewAction =
    action === "reject" ? "reject" : edited || added.length || Object.values(decisions).includes("disagree") ? "edit" : "confirm";

  const sign = async () => {
    setBusy("sign");
    setError(null);
    try {
      const updated = await api.review(result.case_id, {
        action: effective, notes, report: sections, finding_decisions: decisions, added_findings: added,
      });
      onUpdate(updated);
      toast(t("review.signed"));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    setBusy("draft");
    setError(null);
    try {
      onUpdate(await api.saveDraft(result.case_id, sections));
      toast(t("review.draftSaved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const title = action === "confirm" ? t("review.confirmTitle") : action === "reject" ? t("review.rejectTitle") : t("review.editorTitle");
  const subtitle = action === "confirm" ? t("review.confirmText") : action === "reject" ? t("review.rejectText") : t("review.editorSubtitle");

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-6 py-5">
        <div>
          <div className="eyebrow">{t("review.decision")}</div>
          <h2 className="mt-1 text-xl font-bold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label={t("common.close")}><X className="size-5" /></button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {result.findings.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2">{t("review.decisions")}</h3>
            <ul className="space-y-2">
              {result.findings.map((f) => (
                <li key={f.name} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200/70">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{finding(f.name)}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span className="tabular-nums">{f.score.toFixed(2)}</span>
                      <span className={`chip py-0 ${LEVEL_STYLES[f.level].chip}`}>{t(`levels.${f.level}`).split(" – ")[0]}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5" role="group" aria-label={finding(f.name)}>
                    {(["agree", "disagree"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={decisions[f.name] === d}
                        onClick={() => setDecisions({ ...decisions, [f.name]: d })}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          decisions[f.name] === d ? (d === "agree" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {d === "agree" ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />} {t(`review.${d}`)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="eyebrow mb-2">{t("review.missed")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {added.map((name) => (
              <span key={name} className="chip bg-violet-50 py-1 text-violet-700 ring-1 ring-violet-200">
                {finding(name)}
                <button type="button" onClick={() => setAdded(added.filter((n) => n !== name))} aria-label="×"><X className="size-3" /></button>
              </span>
            ))}
            <label className="relative">
              <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
              <select
                value=""
                onChange={(e) => e.target.value && setAdded([...added, e.target.value])}
                className="field w-auto py-1.5 pl-7 text-xs"
                aria-label={t("review.addMissed")}
              >
                <option value="">{t("review.addMissed")}</option>
                {candidates.map((name) => <option key={name} value={name}>{finding(name)}</option>)}
              </select>
            </label>
          </div>
        </section>

        {(["findings", "impression", "recommendations"] as const).map((key) => (
          <label key={key} className="block">
            <span className="eyebrow">
              {key === "findings" ? t("review.findingsSection") : t(`review.${key}`)}
              {key === "impression" && <span className="text-rose-500"> *</span>}
            </span>
            <textarea
              className={`field mt-1.5 ${key === "impression" ? "min-h-24" : "min-h-28"} leading-relaxed`}
              placeholder={key === "impression" ? t("review.impressionRequired") : undefined}
              required={key === "impression"}
              value={sections[key]}
              onChange={(e) => setSections({ ...sections, [key]: e.target.value })}
            />
          </label>
        ))}

        <label className="block">
          <span className="eyebrow">{action === "reject" ? t("review.reason") : t("review.notes")}</span>
          <textarea className="field mt-1.5 min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {!signer && (
          <div className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-800 ring-1 ring-sky-200">
            <CircleAlert className="mt-0.5 size-4 shrink-0" /> {t("review.residentNote")}
          </div>
        )}
        {error && <div role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/70 bg-white/70 px-6 py-4">
        <button type="button" className="btn-ghost" onClick={saveDraft} disabled={busy !== null || result.physician_report?.status === "final"}>
          {busy === "draft" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} {t("review.saveDraft")}
        </button>
        <button
          type="button"
          onClick={sign}
          disabled={!signer || busy !== null || (action === "reject" && !notes.trim()) || !sections.impression.trim()}
          className={action === "reject" ? "btn bg-rose-500 text-white hover:bg-rose-600" : "btn-primary"}
        >
          {busy === "sign" ? <LoaderCircle className="size-4 animate-spin" /> : <FileSignature className="size-4" />} {t("review.sign")}
        </button>
      </div>
    </>
  );
}
