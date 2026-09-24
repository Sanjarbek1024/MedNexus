import { ShieldAlert } from "lucide-react";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full bg-amber-50/80 px-3 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200/70 ${className}`}
    >
      <ShieldAlert className="size-3.5 shrink-0" />
      Research prototype. Not a certified medical device.
    </div>
  );
}
