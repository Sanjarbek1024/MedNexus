import { motion } from "framer-motion";
import { ChevronDown, CircleCheck, CircleX, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n";
import type { AnalysisResult, Check, CheckCategory, CheckStatus } from "../lib/api";

const GROUPS: CheckCategory[] = ["quality", "distribution", "metadata", "agreement", "report"];
const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };
const ICONS = {
  pass: <CircleCheck className="size-5 shrink-0 text-emerald-500" />,
  warn: <TriangleAlert className="size-5 shrink-0 text-amber-500" />,
  fail: <CircleX className="size-5 shrink-0 text-rose-500" />,
};

function Group({ category, checks }: { category: CheckCategory; checks: Check[] }) {
  const { t, check: message } = useI18n();
  const [open, setOpen] = useState(false);
  const worst = checks.reduce<CheckStatus>((acc, c) => (RANK[c.status] > RANK[acc] ? c.status : acc), "pass");
  const headline = checks.find((c) => c.status === worst)!;
  return (
    <li className="py-2.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        {ICONS[worst]}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{t(`safety.groups.${category}`)}</div>
          <div className={`text-xs ${worst === "pass" ? "text-slate-500" : worst === "warn" ? "text-amber-700" : "text-rose-700"}`}>{message(headline)}</div>
        </div>
        {checks.length > 1 && <ChevronDown className={`mt-0.5 size-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && checks.length > 1 && (
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 ml-8 space-y-1.5 border-l border-slate-100 pl-3">
          {checks.map((check) => (
            <li key={check.id} className="flex gap-2 text-xs">
              <span className="mt-0.5">{ICONS[check.status]}</span>
              <span className="text-slate-500">{message(check)}</span>
            </li>
          ))}
        </motion.ul>
      )}
    </li>
  );
}

export function SafetyPanel({ result }: { result: AnalysisResult }) {
  const { t } = useI18n();
  const signed = result.status === "reviewed" && result.review;
  return (
    <section className="card p-5" aria-labelledby="safety-title">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-emerald-600" />
        <h2 id="safety-title" className="font-bold text-ink">{t("safety.title")}</h2>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {GROUPS.map((category) => {
          const checks = result.checks.filter((c) => c.category === category);
          return checks.length ? <Group key={category} category={category} checks={checks} /> : null;
        })}
        {!result.rejected && (
          <li className="flex items-start gap-3 py-2.5">
            {signed ? <UserCheck className="size-5 text-emerald-500" /> : <TriangleAlert className="size-5 text-amber-500" />}
            <div>
              <div className="text-sm font-semibold text-ink">{t("safety.review")}</div>
              <div className={`text-xs ${signed ? "text-slate-500" : "text-amber-700"}`}>
                {signed ? t("safety.reviewDone", { name: result.review!.reviewer }) : t("safety.reviewPending")}
              </div>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
