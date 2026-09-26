import { ShieldAlert } from "lucide-react";

import { useI18n } from "../i18n";

export function Disclaimer({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full bg-amber-50/80 px-3 py-1 text-[11px] leading-tight font-semibold text-amber-800 ring-1 ring-amber-200/70 ${className}`}
    >
      <ShieldAlert className="size-3.5 shrink-0" />
      {t("common.disclaimer")}
    </div>
  );
}
