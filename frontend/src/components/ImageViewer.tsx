import { AnimatePresence, motion } from "framer-motion";
import { Columns2, Flame, Layers, Maximize, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { AnalysisResult, Box, Finding } from "../lib/api";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const STRUCTURE_COLORS: Record<string, string> = { Heart: "#fb7185" };
const LUNG_COLOR = "#34d399";

type Point = { x: number; y: number };

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
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface ViewportProps {
  result: AnalysisResult;
  zoom: number;
  pan: Point;
  onChange: (zoom: number, pan: Point) => void;
  label?: string;
  children?: ReactNode;
}

function Viewport({ result, zoom, pan, onChange, label, children }: ViewportProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Point | null>(null);
  const { width, height } = useElementSize(ref);
  const fit = Math.min(width / result.image.width, height / result.image.height) || 0;
  const state = useRef({ zoom, pan });
  state.current = { zoom, pan };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { zoom: current, pan: offset } = state.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * Math.exp(-event.deltaY * 0.0015)));
      const rect = element.getBoundingClientRect();
      const cursor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      const ratio = next / current;
      onChange(next, next === MIN_ZOOM ? { x: 0, y: 0 } : {
        x: cursor.x - (cursor.x - offset.x) * ratio,
        y: cursor.y - (cursor.y - offset.y) * ratio,
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [onChange]);

  return (
    <div
      ref={ref}
      className={`relative h-[clamp(20rem,calc(100vh-21rem),42rem)] touch-none overflow-hidden bg-[#060b09] select-none ${
        zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={(event) => {
        if (zoom === 1) return;
        drag.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) onChange(zoom, { x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => onChange(1, { x: 0, y: 0 })}
    >
      <div
        className="absolute top-1/2 left-1/2 transition-transform duration-75"
        style={{
          width: result.image.width * fit,
          height: result.image.height * fit,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <img src={result.image.url} alt="Study" draggable={false} className="size-full" />
        {children}
      </div>
      {label && (
        <div className="absolute top-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur">
          {label}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label, disabled }: {
  on: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`btn px-3 py-1.5 ${
        on ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

interface Props {
  result: AnalysisResult;
  selected: string | null;
  onSelect: (name: string) => void;
}

export function ImageViewer({ result, selected, onSelect }: Props) {
  const explained = result.findings.filter((f): f is Finding & { heatmap: NonNullable<Finding["heatmap"]> } => !!f.heatmap);
  const [showHeatmap, setShowHeatmap] = useState(explained.length > 0);
  const [showAnatomy, setShowAnatomy] = useState(result.structures.length > 0);
  const [compare, setCompare] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [view, setView] = useState<{ zoom: number; pan: Point }>({ zoom: 1, pan: { x: 0, y: 0 } });
  const active = explained.find((f) => f.name === selected) ?? explained[0];
  const analyzedBox = result.structures[0]?.box ?? active?.heatmap.box;
  const cropped = analyzedBox && analyzedBox.width * analyzedBox.height < 0.99;

  const change = useRef((zoom: number, pan: Point) => setView({ zoom, pan })).current;
  const zoomBy = (factor: number) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    setView({ zoom, pan: zoom === 1 ? { x: 0, y: 0 } : { x: view.pan.x * (zoom / view.zoom), y: view.pan.y * (zoom / view.zoom) } });
  };

  const overlays = (
    <>
      {showHeatmap && active && (
        <AnimatePresence mode="wait">
          <motion.img
            key={active.name}
            src={active.heatmap.url}
            alt={`Grad-CAM heatmap for ${active.name}`}
            initial={{ opacity: 0 }}
            animate={{ opacity }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            draggable={false}
            className="pointer-events-none absolute"
            style={boxStyle(active.heatmap.box)}
          />
        </AnimatePresence>
      )}
      {showAnatomy && result.structures.length > 0 && (
        <svg
          className="pointer-events-none absolute overflow-visible"
          style={boxStyle(result.structures[0].box)}
          viewBox={`0 0 ${result.structures[0].size} ${result.structures[0].size}`}
          preserveAspectRatio="none"
          aria-label="Anatomy contours"
        >
          {result.structures.map((structure) => {
            const color = STRUCTURE_COLORS[structure.label] ?? LUNG_COLOR;
            return (
              <motion.path
                key={structure.label}
                d={structure.path}
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
      {cropped && (showHeatmap || showAnatomy) && (
        <div className="pointer-events-none absolute border border-dashed border-white/35" style={boxStyle(analyzedBox)}>
          <span className="absolute -top-5 left-0 text-[10px] font-semibold tracking-wide text-white/60 uppercase">
            Analyzed region
          </span>
        </div>
      )}
    </>
  );

  return (
    <div className="card overflow-hidden">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <Toggle on={showHeatmap} onClick={() => setShowHeatmap(!showHeatmap)} icon={Flame} label="Heatmap" disabled={!explained.length} />
        <Toggle on={showAnatomy} onClick={() => setShowAnatomy(!showAnatomy)} icon={Layers} label="Anatomy" disabled={!result.structures.length} />
        <Toggle on={compare} onClick={() => setCompare(!compare)} icon={Columns2} label="Side by side" />
        {showHeatmap && explained.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-500">
            Opacity
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(event) => setOpacity(Number(event.target.value))}
              className="w-28"
              aria-label="Heatmap opacity"
            />
          </label>
        )}
      </div>

      <div className="relative">
        <div className={`grid gap-px bg-slate-800 ${compare ? "grid-cols-2" : ""}`}>
          {compare && <Viewport result={result} zoom={view.zoom} pan={view.pan} onChange={change} label="Original" />}
          <Viewport result={result} zoom={view.zoom} pan={view.pan} onChange={change} label={compare ? "AI overlay" : undefined}>
            {overlays}
          </Viewport>
        </div>
        <div className="no-print absolute top-3 right-3 flex items-center gap-1 rounded-xl bg-black/50 p-1 text-white backdrop-blur">
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
            <ZoomOut className="size-4" />
          </button>
          <span className="w-11 text-center text-xs font-semibold tabular-nums">{Math.round(view.zoom * 100)}%</span>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
            <ZoomIn className="size-4" />
          </button>
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => setView({ zoom: 1, pan: { x: 0, y: 0 } })} aria-label="Reset view">
            <Maximize className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {showHeatmap && explained.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Heatmap for</span>
            {explained.map((finding) => (
              <button
                key={finding.name}
                type="button"
                onClick={() => onSelect(finding.name)}
                className={`chip py-1 transition ${
                  finding.name === active?.name ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {finding.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          {showHeatmap && explained.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="h-2 w-16 rounded-full bg-gradient-to-r from-yellow-300/40 via-orange-500 to-red-600" />
              Grad-CAM: where the models looked, not a lesion outline
            </span>
          )}
          {showAnatomy && result.structures.length > 0 && (
            <>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: LUNG_COLOR }} /> Lungs</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: STRUCTURE_COLORS.Heart }} /> Heart</span>
            </>
          )}
          <span className="ml-auto hidden sm:inline">Scroll to zoom · drag to pan · double-click to reset</span>
        </div>
      </div>
    </div>
  );
}
