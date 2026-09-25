import { AnimatePresence, motion } from "framer-motion";
import { BoxSelect, Columns2, Flame, Keyboard, Layers, Maximize, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n";
import type { AnalysisResult, Box, Finding } from "../lib/api";
import { Modal } from "./ui";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const HEART = "#fb7185";
const LUNG = "#34d399";

export type Point = { x: number; y: number };
export interface ViewState { zoom: number; pan: Point }
export const INITIAL_VIEW: ViewState = { zoom: 1, pan: { x: 0, y: 0 } };

const boxStyle = (box: Box) => ({
  left: `${box.x * 100}%`,
  top: `${box.y * 100}%`,
  width: `${box.width * 100}%`,
  height: `${box.height * 100}%`,
});

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);

interface ViewportProps {
  image: AnalysisResult["image"];
  view: ViewState;
  onChange: (view: ViewState) => void;
  label?: string;
  height: string;
  onImageClick?: (point: Point) => void;
  children?: ReactNode;
}

function Viewport({ image, view, onChange, label, height, onImageClick, children }: ViewportProps) {
  const ref = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: Point; origin: Point; moved: boolean } | null>(null);
  const { width, height: h } = useElementSize(ref);
  const fit = Math.min(width / (image.width || 1), h / (image.height || 1)) || 0;
  const latest = useRef({ view, onChange });
  useEffect(() => {
    latest.current = { view, onChange };
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view: current, onChange: change } = latest.current;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * Math.exp(-event.deltaY * 0.0015)));
      const rect = element.getBoundingClientRect();
      const cursor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      const ratio = zoom / current.zoom;
      change(zoom === MIN_ZOOM ? INITIAL_VIEW : { zoom, pan: { x: cursor.x - (cursor.x - current.pan.x) * ratio, y: cursor.y - (cursor.y - current.pan.y) * ratio } });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={ref}
      className={`relative ${height} touch-none overflow-hidden bg-[#060b09] select-none ${view.zoom > 1 ? "cursor-grab active:cursor-grabbing" : onImageClick ? "cursor-crosshair" : ""}`}
      onPointerDown={(event) => {
        drag.current = { start: { x: event.clientX, y: event.clientY }, origin: view.pan, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d) return;
        const dx = event.clientX - d.start.x;
        const dy = event.clientY - d.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        if (view.zoom > 1 && d.moved) onChange({ zoom: view.zoom, pan: { x: d.origin.x + dx, y: d.origin.y + dy } });
      }}
      onPointerUp={(event) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved || !onImageClick || !stage.current) return;
        const rect = stage.current.getBoundingClientRect();
        const point = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
        if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) onImageClick(point);
      }}
      onDoubleClick={() => onChange(INITIAL_VIEW)}
    >
      <div
        ref={stage}
        className="absolute top-1/2 left-1/2 transition-transform duration-75"
        style={{
          width: image.width * fit,
          height: image.height * fit,
          transform: `translate(-50%, -50%) translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
        }}
      >
        <img src={image.url} alt="" draggable={false} className="size-full" />
        {children}
      </div>
      {label && (
        <div className="absolute top-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur">{label}</div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label, disabled, hotkey }: {
  on: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  hotkey?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-keyshortcuts={hotkey}
      className={`btn px-3 py-1.5 ${on ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"}`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

interface Props {
  result: AnalysisResult;
  selected: string | null;
  onSelect: (name: string) => void;
  view?: ViewState;
  onViewChange?: (view: ViewState) => void;
  label?: string;
  compact?: boolean;
  overlays?: boolean;
  marks?: Point[];
  onImageClick?: (point: Point) => void;
  shortcuts?: boolean;
}

export function ImageViewer({
  result, selected, onSelect, view: controlled, onViewChange, label, compact = false, overlays = true, marks, onImageClick, shortcuts = false,
}: Props) {
  const { t, finding } = useI18n();
  const explained = result.findings.filter((f): f is Finding & { heatmap: NonNullable<Finding["heatmap"]> } => !!f.heatmap);
  const boxed = result.findings.filter((f) => f.boxes.length > 0);
  const selectable = overlays ? [...new Set([...explained, ...boxed])] : [];
  const [showHeatmap, setShowHeatmap] = useState(explained.length > 0);
  const [showAnatomy, setShowAnatomy] = useState(result.structures.length > 0);
  const [showBoxes, setShowBoxes] = useState(boxed.length > 0);
  const [compare, setCompare] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [help, setHelp] = useState(false);
  const [internal, setInternal] = useState<ViewState>(INITIAL_VIEW);
  const view = controlled ?? internal;
  const setView = onViewChange ?? setInternal;
  const active = selectable.find((f) => f.name === selected) ?? selectable[0];
  const labelled = active?.boxes.length ? active.name : null;
  const heatmapFinding = explained.find((f) => f.name === active?.name) ?? explained[0];
  const analyzedBox = result.structures[0]?.box ?? heatmapFinding?.heatmap.box;
  const cropped = analyzedBox && analyzedBox.width * analyzedBox.height < 0.99;

  const zoomBy = (factor: number) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    setView(zoom === 1 ? INITIAL_VIEW : { zoom, pan: { x: view.pan.x * (zoom / view.zoom), y: view.pan.y * (zoom / view.zoom) } });
  };

  const latest = useRef({ zoomBy, setView, selectable, active, onSelect });
  useEffect(() => {
    latest.current = { zoomBy, setView, selectable, active, onSelect };
  });
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const s = latest.current;
      const actions: Record<string, () => void> = {
        "+": () => s.zoomBy(1.4), "=": () => s.zoomBy(1.4), "-": () => s.zoomBy(1 / 1.4), "0": () => s.setView(INITIAL_VIEW),
        h: () => setShowHeatmap((v) => !v), a: () => setShowAnatomy((v) => !v), b: () => setShowBoxes((v) => !v),
        s: () => setCompare((v) => !v), "?": () => setHelp((v) => !v),
        n: () => {
          if (!s.selectable.length) return;
          const index = s.selectable.findIndex((f) => f.name === s.active?.name);
          s.onSelect(s.selectable[(index + 1) % s.selectable.length].name);
        },
      };
      const action = actions[event.key.toLowerCase()] ?? actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);

  const layer = overlays && (
    <>
      {showHeatmap && heatmapFinding && (
        <AnimatePresence mode="wait">
          <motion.img
            key={heatmapFinding.name}
            src={heatmapFinding.heatmap.url}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            draggable={false}
            className="pointer-events-none absolute"
            style={boxStyle(heatmapFinding.heatmap.box)}
          />
        </AnimatePresence>
      )}
      {showAnatomy && result.structures.length > 0 && (
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={boxStyle(result.structures[0].box)}
          viewBox={`0 0 ${result.structures[0].size} ${result.structures[0].size}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {result.structures.map((s) => {
            const color = s.label === "Heart" ? HEART : LUNG;
            return (
              <motion.path
                key={s.label}
                d={s.path}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.1, ease: "easeInOut" }}
                fill={`${color}14`}
                stroke={color}
                strokeWidth={1.6}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      )}
      {showBoxes &&
        boxed.flatMap((f) =>
          f.boxes.map((box, i) => (
            <motion.div
              key={`${f.name}-${i}`}
              initial={{ opacity: 0, scale: 1.08 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * i }}
              className={`pointer-events-none absolute rounded-md border-2 ${f.name === active?.name ? "border-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,0.25)]" : "border-amber-300/80"}`}
              style={boxStyle(box)}
            >
              {/* Only the selected finding is labelled, so labels of neighbouring boxes never collide. */}
              {(!labelled || f.name === labelled) && (
                <span className="absolute -top-5 left-0 rounded bg-rose-500/90 px-1.5 text-[10px] font-bold whitespace-nowrap text-white">
                  {finding(f.name)} {box.score.toFixed(2)}
                </span>
              )}
            </motion.div>
          )),
        )}
      {cropped && (showHeatmap || showAnatomy) && (
        <div className="pointer-events-none absolute border border-dashed border-white/35" style={boxStyle(analyzedBox!)}>
          <span className="absolute -top-5 left-0 text-[10px] font-semibold tracking-wide text-white/60 uppercase">{t("viewer.analyzedRegion")}</span>
        </div>
      )}
    </>
  );

  const markLayer = marks?.map((mark, i) => (
    <motion.span
      key={i}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300 bg-sky-400/30 shadow-[0_0_0_4px_rgba(56,189,248,0.25)]"
      style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
    />
  ));

  const height = compact ? "h-[clamp(18rem,calc(100vh-24rem),34rem)]" : "h-[clamp(20rem,calc(100vh-21rem),42rem)]";

  return (
    <div className="card overflow-hidden">
      {overlays && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          {explained.length > 0 && <Toggle on={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} icon={Flame} label={t("viewer.heatmap")} hotkey="h" />}
          {result.structures.length > 0 && <Toggle on={showAnatomy} onClick={() => setShowAnatomy(!showAnatomy)} icon={Layers} label={t("viewer.anatomy")} hotkey="a" />}
          {boxed.length > 0 && <Toggle on={showBoxes} onClick={() => setShowBoxes(!showBoxes)} icon={BoxSelect} label={t("viewer.boxes")} hotkey="b" />}
          {!compact && <Toggle on={compare} onClick={() => setCompare(!compare)} icon={Columns2} label={t("viewer.compare")} hotkey="s" />}
          {showHeatmap && explained.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-500">
              {t("viewer.opacity")}
              <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-24" aria-label={t("viewer.opacity")} />
            </label>
          )}
        </div>
      )}

      <div className="relative">
        <div className={`grid gap-px bg-slate-800 ${compare ? "grid-cols-2" : ""}`}>
          {compare && <Viewport image={result.image} view={view} onChange={setView} label={t("viewer.original")} height={height} />}
          <Viewport image={result.image} view={view} onChange={setView} label={compare ? t("viewer.overlay") : label} height={height} onImageClick={onImageClick}>
            {layer}
            {markLayer}
          </Viewport>
        </div>
        <div className="no-print absolute top-3 right-3 flex items-center gap-1 rounded-xl bg-black/50 p-1 text-white backdrop-blur">
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => zoomBy(1 / 1.4)} aria-label={t("viewer.zoomOut")}><ZoomOut className="size-4" /></button>
          <span className="w-11 text-center text-xs font-semibold tabular-nums">{Math.round(view.zoom * 100)}%</span>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => zoomBy(1.4)} aria-label={t("viewer.zoomIn")}><ZoomIn className="size-4" /></button>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => setView(INITIAL_VIEW)} aria-label={t("viewer.reset")}><Maximize className="size-4" /></button>
          {shortcuts && (
            <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => setHelp(true)} aria-label={t("common.shortcuts")}><Keyboard className="size-4" /></button>
          )}
        </div>
      </div>

      {overlays && (
        <div className="space-y-3 p-4">
          {selectable.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{t("viewer.heatmapFor")}</span>
              {selectable.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => onSelect(f.name)}
                  className={`chip py-1 transition ${f.name === active?.name ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {finding(f.name)}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            {showHeatmap && explained.length > 0 && (
              <span className="flex items-center gap-2">
                <span className="h-2 w-16 rounded-full bg-gradient-to-r from-yellow-300/40 via-orange-500 to-red-600" /> {t("viewer.gradcamNote")}
              </span>
            )}
            {showAnatomy && result.structures.length > 0 && (
              <>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: LUNG }} /> {t("viewer.lungs")}</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: HEART }} /> {t("viewer.heart")}</span>
              </>
            )}
            {!compact && <span className="ml-auto hidden sm:inline">{t("viewer.hint")}</span>}
          </div>
        </div>
      )}

      <Modal open={help} onClose={() => setHelp(false)} title={t("common.shortcuts")}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[["+ / −", "zoom"], ["0", "reset"], ["H", "heatmap"], ["A", "anatomy"], ["B", "boxes"], ["S", "compare"], ["N", "next"]].map(([key, action]) => (
            <div key={action} className="contents">
              <dt><kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs">{key}</kbd></dt>
              <dd className="text-slate-600">{t(`viewer.keys.${action}`)}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
