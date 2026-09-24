import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface Option {
  id: string;
  label: string;
  supported: boolean;
}

interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (id: string) => void;
}

/** Listbox that keeps unsupported choices visible but disabled, with a "Coming soon" badge. */
export function StudySelect({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const openList = () => {
    setCursor(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  };

  const move = (step: number) => {
    let next = cursor;
    for (let i = 0; i < options.length; i++) {
      next = (next + step + options.length) % options.length;
      if (options[next].supported) break;
    }
    setCursor(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (event.key === "Escape") setOpen(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (options[cursor]?.supported) {
        onChange(options[cursor].id);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={root} className="relative">
      <div className="eyebrow mb-1.5 pl-1">{label}</div>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left text-[15px] font-semibold text-ink shadow-soft transition ${
          open ? "border-emerald-400 ring-4 ring-emerald-100" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        {selected?.label ?? "Select"}
        <ChevronDown className={`size-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl shadow-slate-900/10 backdrop-blur-xl"
          >
            {options.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                aria-disabled={!option.supported}
                onPointerEnter={() => option.supported && setCursor(index)}
                onClick={() => {
                  if (!option.supported) return;
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
                  option.supported
                    ? `cursor-pointer font-semibold text-ink ${cursor === index ? "bg-emerald-50" : ""}`
                    : "cursor-not-allowed text-slate-400"
                }`}
              >
                <span className="flex items-center gap-2">
                  {option.label}
                  {!option.supported && (
                    <span className="chip bg-slate-100 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
                      Coming soon
                    </span>
                  )}
                </span>
                {option.id === value && <Check className="size-4 text-emerald-600" />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
