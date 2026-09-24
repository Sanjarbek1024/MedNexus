import { motion } from "framer-motion";
import { ChevronDown, CircleCheck, CircleX, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react";
import { useState } from "react";

import type { AnalysisResult, Check, CheckCategory, CheckStatus } from "../lib/api";

const GROUPS: { category: CheckCategory; label: string }[] = [
  { category: "quality", label: "Image quality" },
  { category: "distribution", label: "In-distribution" },
  { category: "metadata", label: "DICOM header" },
  { category: "agreement", label: "Model agreement" },
  { category: "report", label: "Report grounding" },
];

const RANK: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };

const ICONS = {
  pass: <CircleCheck className="size-5 text-emerald-500" />,
  warn: <TriangleAlert className="size-5 text-amber-500" />,
  fail: <CircleX className="size-5 text-rose-500" />,
};

function Group({ label, checks }: { label: string; checks: Check[] }) {
  const [open, setOpen] = useState(false);
  const worst = checks.reduce<CheckStatus>((acc, c) => (RANK[c.status] > RANK[acc] ? c.status : acc), "pass");
  const headline = checks.find((c) => c.status === worst)!;
  return (
    <li className="py-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
      >
        {ICONS[worst]}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{label}</div>
          <div className={`text-xs ${worst === "pass" ? "text-slate-500" : worst === "warn" ? "text-amber-700" : "text-rose-700"}`}>
            {headline.detail}
          </div>
        </div>
        {checks.length > 1 && <ChevronDown className={`mt-0.5 size-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && checks.length > 1 && (
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 ml-8 space-y-1.5 border-l border-slate-100 pl-3">
          {checks.map((check) => (
            <li key={check.id} className="flex gap-2 text-xs">
              <span className="w-24 shrink-0 font-semibold text-slate-600">{check.label}</span>
              <span className="text-slate-500">{check.detail}</span>
            </li>
          ))}
        </motion.ul>
      )}
    </li>
  );
}

export function SafetyPanel({ result }: { result: AnalysisResult }) {
  const reviewed = result.review;
  return (
    <section className="card p-5" aria-labelledby="safety-title">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-emerald-600" />
        <h2 id="safety-title" className="font-bold text-ink">Safety checks</h2>
      </div>
      <ul className="mt-2 divide-y divide-slate-100">
        {GROUPS.map(({ category, label }) => {
          const checks = result.checks.filter((c) => c.category === category);
          return checks.length ? <Group key={category} label={label} checks={checks} /> : null;
        })}
        {!result.rejected && (
          <li className="flex items-start gap-3 py-2.5">
            {reviewed ? <UserCheck className="size-5 text-emerald-500" /> : <TriangleAlert className="size-5 text-amber-500" />}
            <div>
              <div className="text-sm font-semibold text-ink">Physician review</div>
              <div className={`text-xs ${reviewed ? "text-slate-500" : "text-amber-700"}`}>
                {reviewed
                  ? `Decision recorded by ${reviewed.reviewer}.`
                  : "Pending. The AI output is a draft until a physician confirms, edits or rejects it."}
              </div>
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}
